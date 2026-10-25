-- Description: issue the period invoice for a débito-automático charge on arrival
-- (odd/debito-charge-invoice, T1).
--   issue_debito_period_invoice(): service-role-only, idempotent RPC that the
--     Mercado Pago webhook calls when a débito charge finds no 'issued' invoice.
--     It upserts the invoice and its charge movement for the debit month (same
--     shape and external_ref as post_billing_charge, so a later admin billing
--     cycle never double-charges) and opens the coverage window ONLY if the
--     subject has none, anchored at the first debit date with zero paid months.
--     post_payment_movement_from_webhook then posts the payment and extends that
--     window by one month, so paid coverage runs from the first debit.

CREATE OR REPLACE FUNCTION public.issue_debito_period_invoice(
  p_mp_preapproval_id TEXT,
  p_occurred_at       TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription   public.affiliate_payment_subscriptions;
  v_profile        public.profiles;
  v_plan           public.plans;
  v_invoice        public.invoices;
  v_window_exists  BOOLEAN;
  v_amount         NUMERIC(12,2);
  -- Same expression post_payment_movement_from_webhook compares against
  -- to_char(period_start, 'YYYY-MM') (window_reset guard), so the invoice
  -- period and the window anchor always agree, even at a month boundary.
  v_occurred_at    TIMESTAMPTZ := COALESCE(p_occurred_at, now());
  v_period         TEXT := to_char(COALESCE(p_occurred_at, now()), 'YYYY-MM');
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Row lock: concurrent deliveries for one subscription serialize here, so
  -- only one of them can open the window.
  SELECT * INTO v_subscription
  FROM public.affiliate_payment_subscriptions
  WHERE mp_preapproval_id = p_mp_preapproval_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('issued', false, 'reason', 'not_found', 'invoice_id', NULL);
  END IF;
  IF v_subscription.profile_id IS NULL THEN
    RETURN jsonb_build_object('issued', false, 'reason', 'not_linked', 'invoice_id', NULL);
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_subscription.profile_id;
  IF NOT FOUND OR v_profile.plan_id IS NULL THEN
    RETURN jsonb_build_object('issued', false, 'reason', 'no_plan', 'invoice_id', NULL);
  END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = v_profile.plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('issued', false, 'reason', 'no_plan', 'invoice_id', NULL);
  END IF;

  -- The amount Mercado Pago debits per cycle, so the charge is fully covered.
  v_amount := COALESCE(v_subscription.discounted_monthly_cost, v_plan.monthly_cost);

  -- Invoice upsert, same shape as post_billing_charge.
  INSERT INTO public.invoices (entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
  VALUES ('affiliate', v_profile.id, v_period, v_amount, 0, v_amount,
          CASE WHEN v_amount = 0 THEN 'paid' ELSE 'issued' END)
  ON CONFLICT (entity_type, entity_id, period) DO NOTHING
  RETURNING * INTO v_invoice;
  IF NOT FOUND THEN
    SELECT * INTO v_invoice FROM public.invoices
    WHERE entity_type = 'affiliate' AND entity_id = v_profile.id AND period = v_period;
  END IF;

  INSERT INTO public.affiliate_account_movements
    (entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by)
  VALUES
    ('affiliate', v_profile.id, v_profile.family_group_id, 'charge', v_invoice.total_amount,
     'charge:affiliate:' || v_profile.id || ':' || v_period, v_invoice.id, 'mercadopago', NULL)
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING;

  -- Open the coverage window only when the subject has none; an existing
  -- window is never touched here (the webhook RPC extends it).
  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.family_coverage_windows WHERE family_group_id = v_profile.family_group_id)
      INTO v_window_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.family_coverage_windows WHERE subject_profile_id = v_profile.id)
      INTO v_window_exists;
  END IF;

  IF NOT v_window_exists THEN
    -- Zero paid months: paid_through = period_start until the payment posts,
    -- then post_payment_movement_from_webhook sets it to
    -- period_start + (paid_months + 1 + bonus_months) months.
    INSERT INTO public.family_coverage_windows (
      family_group_id, subject_profile_id, plan_id_snapshot,
      period_start, paid_through, granted_quota, is_unlimited, created_by,
      paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot
    ) VALUES (
      v_profile.family_group_id,
      CASE WHEN v_profile.family_group_id IS NULL THEN v_profile.id ELSE NULL END,
      v_plan.id,
      v_occurred_at,
      v_occurred_at,
      CASE WHEN v_plan.is_unlimited THEN NULL ELSE 0 END,
      v_plan.is_unlimited,
      NULL,
      0,
      v_plan.bonus_months,
      v_plan.monthly_cost
    );
  END IF;

  RETURN jsonb_build_object('issued', true, 'reason', 'issued', 'invoice_id', v_invoice.id);
END;
$$;

COMMENT ON FUNCTION public.issue_debito_period_invoice IS
  'Service-role-only, idempotent: issues the invoice and charge movement for the month of a '
  'débito-automático charge (amount = subscription discounted_monthly_cost) and opens the coverage '
  'window if the subject has none, anchored at the debit date with zero paid months. Never modifies '
  'an existing window. Returns {issued, reason, invoice_id}; non-issuable states (not_found, '
  'not_linked, no_plan) return issued=false instead of raising.';

REVOKE EXECUTE ON FUNCTION public.issue_debito_period_invoice(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_debito_period_invoice(TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_debito_period_invoice(TEXT, TIMESTAMPTZ) TO service_role;
