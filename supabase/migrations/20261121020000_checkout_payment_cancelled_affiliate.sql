-- Migration: a sign-up checkout payment never reactivates a cancelled or suspended affiliate
-- (odd/tasks/cancelled-affiliate-checkout-payment.md, S2).
--
-- post_adhesion_checkout_payment set plan_status = 'active' unconditionally and opened a coverage
-- window when none existed, so a late Checkout Pro payment could bring back an affiliate that had
-- been cancelled ("Dar de baja") or suspended. The ledger is still posted (the money is real); only
-- the profile and coverage side effects are guarded, with the same rule as
-- post_payment_movement_from_webhook (20261113010000, affiliate-cancellation S2):
--   - plan_status is never set to 'active' when it is 'suspended' or 'cancelled', or when the
--     profile has an affiliate_cancellations row (scheduled or applied);
--   - no coverage window is opened for a profile with an affiliate_cancellations row.
-- The result keeps posted/reason/invoice_id and adds deferred_reason
-- ('affiliate_cancelled' | 'affiliate_suspended') when a side effect was skipped.

CREATE OR REPLACE FUNCTION public.post_adhesion_checkout_payment(p_adhesion_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req             public.adhesion_requests;
  v_profile         public.profiles;
  v_plan            public.plans;
  v_invoice         public.invoices;
  v_window_exists   BOOLEAN;
  v_expected        NUMERIC(12,2);
  v_paid            NUMERIC(12,2);
  v_paid_total      NUMERIC;
  v_period          TEXT := to_char(now(), 'YYYY-MM');
  v_charge_ref      TEXT;
  v_total_months    INTEGER;
  v_cancelled       BOOLEAN;
  v_deferred        TEXT;
  v_result          JSONB;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Row lock: concurrent calls for one request serialize here, so the second
  -- one observes ledger_posted_at and returns already_posted.
  SELECT * INTO v_req FROM public.adhesion_requests WHERE id = p_adhesion_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'not_found', 'invoice_id', NULL);
  END IF;

  IF v_req.status IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'not_approved', 'invoice_id', NULL);
  END IF;
  IF v_req.approved_profile_id IS NULL THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'no_profile', 'invoice_id', NULL);
  END IF;
  IF v_req.payment_status IS DISTINCT FROM 'approved' OR v_req.mp_payment_id IS NULL OR v_req.mp_payment_id = '' THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'not_paid', 'invoice_id', NULL);
  END IF;
  IF v_req.ledger_posted_at IS NOT NULL THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'already_posted', 'invoice_id', NULL);
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_req.approved_profile_id;
  IF NOT FOUND OR v_profile.plan_id IS NULL THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'no_plan', 'invoice_id', NULL);
  END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = v_profile.plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'no_plan', 'invoice_id', NULL);
  END IF;

  v_expected := v_plan.monthly_cost * v_plan.paid_months;
  -- Requests paid before mp_paid_amount existed have no recorded amount: assume the expected charge.
  v_paid := COALESCE(v_req.mp_paid_amount, v_expected);
  v_charge_ref := 'charge:affiliate:' || v_profile.id || ':' || v_period;

  -- Invoice upsert, same shape as post_billing_charge.
  INSERT INTO public.invoices (entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
  VALUES ('affiliate', v_profile.id, v_period, v_expected, 0, v_expected,
          CASE WHEN v_expected = 0 THEN 'paid' ELSE 'issued' END)
  ON CONFLICT (entity_type, entity_id, period) DO NOTHING
  RETURNING * INTO v_invoice;
  IF NOT FOUND THEN
    SELECT * INTO v_invoice FROM public.invoices
    WHERE entity_type = 'affiliate' AND entity_id = v_profile.id AND period = v_period;
  END IF;

  INSERT INTO public.affiliate_account_movements
    (entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by)
  VALUES
    ('affiliate', v_profile.id, v_profile.family_group_id, 'charge', v_expected, v_charge_ref, v_invoice.id, 'mercadopago', NULL)
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING;

  -- The receipt number is drawn only when the insert is not a replay (the
  -- request lock plus ledger_posted_at already make a replay a no-op; ON
  -- CONFLICT is the second line of defense).
  INSERT INTO public.affiliate_account_movements
    (entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by, receipt_number, created_at)
  VALUES
    ('affiliate', v_profile.id, v_profile.family_group_id, 'payment', v_paid,
     'payment:mercadopago:' || v_req.mp_payment_id, v_invoice.id, 'mercadopago', NULL,
     nextval('public.receipt_number_seq'), COALESCE(v_req.paid_at, now()))
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_total
  FROM public.affiliate_account_movements
  WHERE invoice_id = v_invoice.id AND type = 'payment';

  IF v_invoice.status = 'issued' AND v_paid_total >= v_invoice.total_amount THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = v_invoice.id;
  END IF;

  -- Never reactivates a suspended or cancelled affiliate, nor one whose cancellation was
  -- requested (same guard as post_payment_movement_from_webhook, affiliate-cancellation S2).
  v_cancelled := EXISTS (SELECT 1 FROM public.affiliate_cancellations c WHERE c.profile_id = v_profile.id);
  IF v_cancelled OR v_profile.plan_status = 'cancelled' THEN
    v_deferred := 'affiliate_cancelled';
  ELSIF v_profile.plan_status = 'suspended' THEN
    v_deferred := 'affiliate_suspended';
  ELSE
    UPDATE public.profiles SET plan_status = 'active' WHERE id = v_profile.id;
  END IF;

  -- Open the coverage window only when the subject has none (mirrors assign_plan);
  -- an existing window is never extended here, and a cancelled affiliate gets none.
  IF NOT v_cancelled THEN
    IF v_profile.family_group_id IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.family_coverage_windows WHERE family_group_id = v_profile.family_group_id)
        INTO v_window_exists;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.family_coverage_windows WHERE subject_profile_id = v_profile.id)
        INTO v_window_exists;
    END IF;

    IF NOT v_window_exists THEN
      v_total_months := v_plan.paid_months + v_plan.bonus_months;
      INSERT INTO public.family_coverage_windows (
        family_group_id, subject_profile_id, plan_id_snapshot,
        period_start, paid_through, granted_quota, is_unlimited, created_by,
        paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot
      ) VALUES (
        v_profile.family_group_id,
        CASE WHEN v_profile.family_group_id IS NULL THEN v_profile.id ELSE NULL END,
        v_plan.id,
        now(),
        now() + make_interval(months => v_total_months),
        CASE WHEN v_plan.is_unlimited THEN NULL ELSE v_plan.bonified_consultations * v_total_months END,
        v_plan.is_unlimited,
        NULL,
        v_plan.paid_months,
        v_plan.bonus_months,
        v_plan.monthly_cost
      );
    END IF;
  END IF;

  UPDATE public.adhesion_requests SET ledger_posted_at = now() WHERE id = v_req.id;

  v_result := jsonb_build_object('posted', true, 'reason', 'posted', 'invoice_id', v_invoice.id);
  IF v_deferred IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('deferred_reason', v_deferred);
  END IF;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.post_adhesion_checkout_payment IS
  'Service-role-only, idempotent: posts the sign-up Checkout Pro payment into the affiliate ledger '
  '(invoice, charge + payment movements, plan_status, coverage window if none). Never extends an '
  'existing window. Never reactivates a suspended or cancelled affiliate and never opens coverage '
  'once a cancellation was requested (deferred_reason, added in 20261121020000). Returns '
  '{posted, reason, invoice_id[, deferred_reason]}; non-postable states return posted=false '
  'with a reason instead of raising.';

REVOKE EXECUTE ON FUNCTION public.post_adhesion_checkout_payment(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_adhesion_checkout_payment(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_adhesion_checkout_payment(UUID) TO service_role;
