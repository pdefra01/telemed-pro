-- Description: post the sign-up Checkout Pro payment into the affiliate ledger
-- (odd/checkout-payment-ledger, L1).
--   adhesion_requests.mp_paid_amount:   amount Mercado Pago actually collected (payment.transaction_amount).
--   adhesion_requests.ledger_posted_at: set once the payment has been posted (idempotency + audit).
--   post_adhesion_checkout_payment():   service-role-only, idempotent RPC that upserts the first invoice,
--     inserts the charge and payment movements, marks the invoice paid when fully covered, activates the
--     plan and opens the coverage window ONLY if the profile has none. It deliberately does NOT reuse
--     post_payment_movement_from_webhook, which would extend the window by one extra month for a
--     first-period payment.

ALTER TABLE public.adhesion_requests
  ADD COLUMN IF NOT EXISTS mp_paid_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ledger_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.adhesion_requests.mp_paid_amount IS 'Amount Mercado Pago collected for the first-period Checkout Pro payment (payment.transaction_amount).';
COMMENT ON COLUMN public.adhesion_requests.ledger_posted_at IS 'When the Checkout Pro payment was posted into the affiliate ledger by post_adhesion_checkout_payment. NULL = not posted yet.';

-- Same write protection as the other payment fields: only the service role may set them.
CREATE OR REPLACE FUNCTION public.protect_adhesion_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.mp_checkout_preference_id := NULL;
      NEW.mp_payment_id := NULL;
      NEW.payment_status := NULL;
      NEW.paid_at := NULL;
      NEW.mp_paid_amount := NULL;
      NEW.ledger_posted_at := NULL;
    ELSE
      NEW.mp_checkout_preference_id := OLD.mp_checkout_preference_id;
      NEW.mp_payment_id := OLD.mp_payment_id;
      NEW.payment_status := OLD.payment_status;
      NEW.paid_at := OLD.paid_at;
      NEW.mp_paid_amount := OLD.mp_paid_amount;
      NEW.ledger_posted_at := OLD.ledger_posted_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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

  UPDATE public.profiles SET plan_status = 'active' WHERE id = v_profile.id;

  -- Open the coverage window only when the subject has none (mirrors assign_plan);
  -- an existing window is never extended here.
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

  UPDATE public.adhesion_requests SET ledger_posted_at = now() WHERE id = v_req.id;

  RETURN jsonb_build_object('posted', true, 'reason', 'posted', 'invoice_id', v_invoice.id);
END;
$$;

COMMENT ON FUNCTION public.post_adhesion_checkout_payment IS
  'Service-role-only, idempotent: posts the sign-up Checkout Pro payment into the affiliate ledger '
  '(invoice, charge + payment movements, plan_status, coverage window if none). Never extends an '
  'existing window. Returns {posted, reason, invoice_id}; non-postable states return posted=false '
  'with a reason instead of raising.';

REVOKE EXECUTE ON FUNCTION public.post_adhesion_checkout_payment(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_adhesion_checkout_payment(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_adhesion_checkout_payment(UUID) TO service_role;
