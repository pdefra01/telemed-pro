-- Migration: affiliate cancellation, "Dar de baja" (odd/tasks/affiliate-cancellation.md, S1, S2).
--
-- 1. profiles.plan_status gains 'cancelled' (a cancellation that took effect).
-- 2. affiliate_cancellations: one row per cancelled profile (the titular and
--    every patient profile of the titular's family group). Requested now,
--    effective at the end of the paid coverage (user decision "Fin del período
--    pagado"), applied by the sweep. Written only by the RPCs below.
-- 3. cancel_affiliate(): records the cancellation; applies it at once when the
--    coverage window is expired or missing. The server cancels the MercadoPago
--    subscription BEFORE calling it (fail closed).
-- 4. apply_due_affiliate_cancellations(): sweep run by the server; blocks the
--    login (is_active=false) and sets plan_status='cancelled' once effective.
-- 5. post_payment_movement_from_webhook: a late payment never reactivates a
--    suspended or cancelled affiliate, and never extends the coverage of an
--    affiliate whose cancellation was requested (deferred 'affiliate_cancelled').

-- 1. plan_status
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_status_check
  CHECK (plan_status IN ('active', 'pending', 'suspended', 'cancelled'));

-- 2. Cancellations
CREATE TABLE IF NOT EXISTS public.affiliate_cancellations (
  profile_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  titular_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_at  TIMESTAMPTZ NOT NULL,
  applied_at    TIMESTAMPTZ,
  requested_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_affiliate_cancellations_due
  ON public.affiliate_cancellations (effective_at) WHERE applied_at IS NULL;
COMMENT ON TABLE public.affiliate_cancellations IS
  'Affiliate cancellations ("Dar de baja"). Written only by cancel_affiliate / apply_due_affiliate_cancellations. A row stops billing at once; the login is blocked once effective_at is reached.';

ALTER TABLE public.affiliate_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.affiliate_cancellations FROM anon, authenticated;
GRANT SELECT ON public.affiliate_cancellations TO authenticated;

DROP POLICY IF EXISTS "Admins read cancellations" ON public.affiliate_cancellations;
CREATE POLICY "Admins read cancellations" ON public.affiliate_cancellations
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Affiliates read their cancellation" ON public.affiliate_cancellations;
CREATE POLICY "Affiliates read their cancellation" ON public.affiliate_cancellations
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- 3. cancel_affiliate
CREATE OR REPLACE FUNCTION public.cancel_affiliate(p_profile_id UUID, p_requested_by UUID)
RETURNS TABLE (profile_id UUID, effective_at TIMESTAMPTZ, immediate BOOLEAN, profiles_cancelled INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile   public.profiles;
  v_titular   UUID;
  v_window    public.family_coverage_windows;
  v_effective TIMESTAMPTZ;
  v_existing  public.affiliate_cancellations;
  v_count     INTEGER;
BEGIN
  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_profile.role IS DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'affiliate_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.agreement_id IS NOT NULL THEN
    RAISE EXCEPTION 'affiliate_has_agreement' USING ERRCODE = '22023';
  END IF;
  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT g.primary_affiliate_id INTO v_titular FROM public.family_groups g WHERE g.id = v_profile.family_group_id;
    IF v_titular IS DISTINCT FROM p_profile_id THEN
      RAISE EXCEPTION 'affiliate_not_titular' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Lock order: family_coverage_windows before profiles, like
  -- renew_coverage_window and post_payment_movement_from_webhook.
  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT * INTO v_window FROM public.family_coverage_windows w
     WHERE w.family_group_id = v_profile.family_group_id FOR UPDATE;
  ELSE
    SELECT * INTO v_window FROM public.family_coverage_windows w
     WHERE w.subject_profile_id = p_profile_id FOR UPDATE;
  END IF;

  PERFORM 1 FROM public.profiles p
   WHERE p.id = p_profile_id
      OR (v_profile.family_group_id IS NOT NULL AND p.family_group_id = v_profile.family_group_id AND p.role = 'patient')
     FOR UPDATE;

  -- Idempotent: a retry (e.g. after the MP cancel succeeded but the response
  -- was lost) returns the existing cancellation.
  SELECT * INTO v_existing FROM public.affiliate_cancellations c WHERE c.profile_id = p_profile_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.profile_id, v_existing.effective_at, v_existing.applied_at IS NOT NULL,
      (SELECT count(*)::INTEGER FROM public.affiliate_cancellations c WHERE c.titular_id = p_profile_id);
    RETURN;
  END IF;

  v_effective := GREATEST(now(), COALESCE(v_window.paid_through, now()));

  INSERT INTO public.affiliate_cancellations (profile_id, titular_id, requested_at, effective_at, requested_by)
  SELECT p.id, p_profile_id, now(), v_effective, p_requested_by
    FROM public.profiles p
   WHERE p.id = p_profile_id
      OR (v_profile.family_group_id IS NOT NULL AND p.family_group_id = v_profile.family_group_id AND p.role = 'patient')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_effective <= now() THEN
    PERFORM public.apply_due_affiliate_cancellations();
  END IF;

  RETURN QUERY SELECT p_profile_id, v_effective, v_effective <= now(), v_count;
END;
$$;

-- 4. Sweep
CREATE OR REPLACE FUNCTION public.apply_due_affiliate_cancellations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH due AS (
    UPDATE public.affiliate_cancellations c
       SET applied_at = now()
     WHERE c.applied_at IS NULL AND c.effective_at <= now()
    RETURNING c.profile_id
  )
  UPDATE public.profiles p
     SET is_active = false, plan_status = 'cancelled'
    FROM due
   WHERE p.id = due.profile_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_affiliate(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_affiliate(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.apply_due_affiliate_cancellations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_due_affiliate_cancellations() TO service_role;

-- 5. Webhook payment: never reactivate a suspended or cancelled affiliate.
-- Full definition from 20260731000000_add_receipt_number_to_webhook.sql with
-- the affiliate-cancellation guards; CREATE OR REPLACE keeps its grants.
CREATE OR REPLACE FUNCTION public.post_payment_movement_from_webhook(
  p_invoice_id    UUID,
  p_entity_type   TEXT,
  p_entity_id     UUID,
  p_amount        DECIMAL(12,2),
  p_external_ref  TEXT,
  p_source        TEXT DEFAULT 'mercadopago',
  p_occurred_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.webhook_payment_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice                 public.invoices;
  v_movement                public.affiliate_account_movements;
  v_family_group_id         UUID;
  v_profile                 public.profiles;
  v_window                  public.family_coverage_windows;
  v_policy                  JSONB;
  v_mode                    TEXT;
  v_balance                 NUMERIC;
  v_posted                  BOOLEAN;
  v_invoice_was_paid_before BOOLEAN;
  v_invoice_was_cancelled   BOOLEAN;
  v_window_found            BOOLEAN;
  v_paid_total              NUMERIC;
  v_result                  public.webhook_payment_result;
  v_receipt_number          INTEGER;  -- [NEW] correlative receipt number
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_entity_type <> 'affiliate' THEN
    RAISE EXCEPTION 'post_payment_movement_from_webhook solo soporta entity_type=affiliate (recibido: %)', p_entity_type;
  END IF;

  IF p_external_ref IS NULL OR p_external_ref = '' THEN
    RAISE EXCEPTION 'post_payment_movement_from_webhook requiere un external_ref no vacio para garantizar idempotencia.';
  END IF;

  -- Row-lock the invoice for the duration of this transaction — mirrors
  -- post_payment_movement:256-263 and, by locking the SAME row, serializes
  -- against the admin manual-reconciliation path racing on one invoice
  -- (R16): whichever commits second observes the committed status below.
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura % no encontrada', p_invoice_id;
  END IF;

  -- I10: captured BEFORE this movement's own flip, so a second genuinely
  -- distinct payment against an already-paid invoice (R15) still posts (the
  -- credit is real) but never extends coverage a second time.
  v_invoice_was_paid_before := (v_invoice.status = 'paid');

  -- Fix 2: cancelled invoices must never be silently resurrected to 'paid'
  -- by a stray/redelivered webhook payment against an admin-cancelled
  -- invoice — captured alongside v_invoice_was_paid_before, BEFORE this
  -- movement's own flip.
  v_invoice_was_cancelled := (v_invoice.status = 'cancelled');

  SELECT family_group_id INTO v_family_group_id FROM public.profiles WHERE id = p_entity_id;

  -- [NEW] Assign a correlative receipt number from the shared sequence.
  -- nextval() is called BEFORE the INSERT so that ON CONFLICT DO NOTHING
  -- (idempotent replay) never retries the insert and never wastes a second
  -- sequence number. The value is consumed once; if the insert is skipped by
  -- ON CONFLICT the sequence gap is intentional and harmless (same behavior
  -- as post_manual_adjustment).
  v_receipt_number := nextval('public.receipt_number_seq');

  -- Idempotent insert (D4 pattern). Unlike post_payment_movement, this path
  -- never RAISEs when the invoice is already paid — MP redelivery (R13) and
  -- a second legitimate payment (R15) must both be able to reach this insert
  -- and let ON CONFLICT decide, not an exception.
  INSERT INTO public.affiliate_account_movements
    (entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by, receipt_number)
  VALUES
    (p_entity_type, p_entity_id, v_family_group_id, 'payment', p_amount, p_external_ref, p_invoice_id, p_source, NULL, v_receipt_number)
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING
  RETURNING * INTO v_movement;

  IF FOUND THEN
    v_posted := true;
  ELSE
    v_posted := false;
    SELECT * INTO v_movement
    FROM public.affiliate_account_movements
    WHERE external_ref = p_external_ref;
  END IF;

  -- Defensive: external_ref is globally unique, but guard against an
  -- app-layer bug reusing a ref across different invoices.
  IF v_movement.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'external_ref % ya pertenece a la factura %, no a %; posible reuso de referencia entre facturas.', p_external_ref, v_movement.invoice_id, p_invoice_id;
  END IF;

  -- Fix 1: the status-flip and partial-payment determination must be based
  -- on the CUMULATIVE sum of every 'payment'-type movement posted against
  -- this invoice (including the one just inserted/found above), not on
  -- p_amount alone — otherwise a second, later, distinct partial payment
  -- that completes the invoice would never flip it to 'paid'.
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_total
  FROM public.affiliate_account_movements
  WHERE invoice_id = p_invoice_id AND type = 'payment';

  -- I9: flip to paid / reactivate the plan ONLY when the cumulative payments
  -- cover the invoice in full, and never when the invoice was cancelled
  -- (Fix 2). A partial payment posts the real amount but leaves the
  -- invoice 'issued'.
  IF v_posted AND NOT v_invoice_was_cancelled AND v_paid_total >= v_invoice.total_amount THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
    v_invoice.status := 'paid';
  END IF;

  v_result.posted := v_posted;
  v_result.movement_id := v_movement.id;
  v_result.invoice_id := p_invoice_id;
  v_result.invoice_status := v_invoice.status;
  v_result.coverage_extended := false;
  v_result.deferred_reason := NULL;

  -- I6: extension runs ONLY when THIS call is the one that actually posted
  -- the movement (FOUND after ON CONFLICT DO NOTHING). A duplicate/replayed
  -- call never re-extends (R12/R13).
  IF NOT v_posted THEN
    RETURN v_result;
  END IF;

  -- Fix 2: the movement is still posted (money received is real), but a
  -- cancelled invoice must never be resurrected to 'paid' nor have its
  -- coverage extended by a stray/redelivered payment.
  IF v_invoice_was_cancelled THEN
    v_result.deferred_reason := 'invoice_cancelled';
    RETURN v_result;
  END IF;

  -- I10 (continued): the payment is a legitimate second credit (R15/R16),
  -- but coverage was already extended for this invoice by an earlier,
  -- distinct payment.
  IF v_invoice_was_paid_before THEN
    -- R-JD5: this is a legitimate, distinct second payment against an
    -- invoice that was already 'paid' (e.g. by an earlier payment or by
    -- admin manual reconciliation). It returns BEFORE the family_coverage_windows
    -- lock below, so it never participates in the lock-order guarded by the
    -- deadlock fix further down — reactivating the profile here is safe and
    -- does not need to wait for that ordering.
    -- Never reactivates a suspended or cancelled affiliate (affiliate-cancellation S2).
    UPDATE public.profiles SET plan_status = 'active'
     WHERE id = p_entity_id
       AND COALESCE(plan_status, '') NOT IN ('suspended', 'cancelled')
       AND NOT EXISTS (SELECT 1 FROM public.affiliate_cancellations c WHERE c.profile_id = p_entity_id);
    v_result.deferred_reason := 'invoice_already_paid';
    RETURN v_result;
  END IF;

  -- I9 (continued): a partial payment never triggers extension. Uses the
  -- CUMULATIVE paid total (Fix 1), so this only holds while the sum of all
  -- payments against this invoice still falls short of the total.
  IF v_paid_total < v_invoice.total_amount THEN
    v_result.deferred_reason := 'partial_payment';
    RETURN v_result;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_entity_id;

  -- R18: lock the window BEFORE the balance read, so the balance guard, the
  -- I10 capture and this UPDATE all observe one committed row version — the
  -- second of two concurrent extensions blocks here until the first commits,
  -- then re-reads the COMMITTED paid_months_snapshot.
  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT * INTO v_window FROM public.family_coverage_windows w
     WHERE w.family_group_id = v_profile.family_group_id FOR UPDATE;
  ELSE
    SELECT * INTO v_window FROM public.family_coverage_windows w
     WHERE w.subject_profile_id = p_entity_id FOR UPDATE;
  END IF;
  -- Captured immediately: the profiles UPDATE below also sets FOUND (to
  -- whether it affected a row), which would otherwise clobber the window
  -- lookup's FOUND before the NOT FOUND check further down can read it.
  v_window_found := FOUND;

  -- Deadlock fix: this UPDATE used to run immediately after the invoice
  -- status flip, BEFORE the window lock above — the exact opposite lock
  -- order from renew_coverage_window (family_coverage_windows THEN
  -- profiles). Two concurrent transactions taking opposite lock orders on
  -- the same two rows (an admin renewal and a webhook payment against the
  -- same profile/family) is a textbook AB-BA deadlock. Moved here, AFTER
  -- the window lock, so both functions always acquire
  -- family_coverage_windows before profiles. Reaching this point already
  -- guarantees v_posted, NOT v_invoice_was_cancelled, v_paid_total >=
  -- v_invoice.total_amount AND NOT v_invoice_was_paid_before — that last
  -- condition returns earlier above with its OWN profiles reactivation
  -- (see the invoice_was_paid_before branch), precisely because that path
  -- never reaches the window lock and therefore needs no lock-ordering
  -- protection. This UPDATE preserves the original
  -- unconditional-on-full-payment behavior for the remaining path,
  -- including running even when no window exists for this profile (the
  -- NOT FOUND check below still fires on the CAPTURED v_window_found, not
  -- on this UPDATE's own FOUND).
  -- Never reactivates a suspended or cancelled affiliate (affiliate-cancellation S2).
  UPDATE public.profiles SET plan_status = 'active'
   WHERE id = p_entity_id
     AND COALESCE(plan_status, '') NOT IN ('suspended', 'cancelled')
     AND NOT EXISTS (SELECT 1 FROM public.affiliate_cancellations c WHERE c.profile_id = p_entity_id);

  IF NOT v_window_found THEN
    v_result.deferred_reason := 'no_window';
    RETURN v_result;
  END IF;

  -- affiliate-cancellation S2: a payment that arrives after the cancellation
  -- was requested is recorded (it already is, above) but never extends
  -- coverage: the affiliate keeps only the period paid before the request.
  IF EXISTS (SELECT 1 FROM public.affiliate_cancellations c WHERE c.profile_id = p_entity_id) THEN
    v_result.deferred_reason := 'affiliate_cancelled';
    RETURN v_result;
  END IF;

  -- R17: an admin ran renew_coverage_window (a full-term reset) after this
  -- invoice's period was issued — the window no longer represents that term.
  -- Extending it now would grant a free month on top of the reset.
  IF v_invoice.period < to_char(v_window.period_start, 'YYYY-MM') THEN
    v_result.deferred_reason := 'window_reset';
    RETURN v_result;
  END IF;

  -- Fix 3: a shared family_coverage_windows row can be reached independently
  -- by DIFFERENT invoices (different family members, different
  -- external_refs) for the SAME billing period — v_invoice_was_paid_before
  -- and the R17 check above are both per-invoice/per-invoice-vs-window-period
  -- and do not catch this. last_extended_period records which invoice-period
  -- most recently extended this SAME window; if some other invoice already
  -- extended it for this period (or a later one), this call must not extend
  -- it again.
  IF v_window.last_extended_period IS NOT NULL AND v_window.last_extended_period >= v_invoice.period THEN
    v_result.deferred_reason := 'period_already_extended';
    RETURN v_result;
  END IF;

  -- I7: balance guard, shape-robust read mirroring renew_coverage_window
  -- (20260722010000:393-403). The balance SUM already reflects THIS payment
  -- (I5), since the movement insert above is in the same transaction.
  SELECT value INTO v_policy FROM public.system_settings WHERE key = 'delinquency_policy';
  v_mode := CASE
    WHEN v_policy IS NULL THEN NULL
    WHEN jsonb_typeof(v_policy) = 'object' THEN v_policy ->> 'mode'
    ELSE v_policy #>> '{}'
  END;
  IF v_mode IS NULL OR v_mode NOT IN ('block', 'grace_period') THEN
    v_mode := 'grace_period';
  END IF;

  v_balance := COALESCE((
    SELECT balance FROM public.affiliate_account_balances
    WHERE entity_type = 'affiliate' AND entity_id = p_entity_id
  ), 0);

  IF v_mode = 'block' AND v_balance > 0 THEN
    v_result.deferred_reason := 'balance_due';
    RETURN v_result;
  END IF;

  -- I1/I2/I3/I4: one-month extension recomputed from the FIXED period_start
  -- anchor, never accumulated onto paid_through. period_start itself is
  -- never modified here. All derived columns are computed inside this single
  -- UPDATE from paid_months_snapshot + 1, never from a value read earlier.
  UPDATE public.family_coverage_windows w SET
    paid_months_snapshot = w.paid_months_snapshot + 1,
    paid_through = w.period_start + make_interval(months =>
                     (w.paid_months_snapshot + 1) + w.bonus_months_snapshot),
    granted_quota = CASE WHEN w.is_unlimited THEN NULL
                    ELSE w.granted_quota + COALESCE((SELECT p.bonified_consultations
                      FROM public.plans p WHERE p.id = w.plan_id_snapshot), 0) END,
    last_extended_period = v_invoice.period
  WHERE w.id = v_window.id;

  v_result.coverage_extended := true;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.post_payment_movement_from_webhook IS
  'Service-role-only counterpart to post_payment_movement (D-A): posts a payment movement AND, '
  'in the same transaction, extends the affiliate''s coverage window by one period when the '
  'payment is new, full, non-window-reset and balance-guard-clear (D-B). Never RAISEs on an '
  'already-settled invoice — MP redelivery must always be a free no-op, never an error. '
  'Assigns a correlative receipt_number from public.receipt_number_seq on the initial insert '
  'so the affiliate and admin can download the PDF receipt (added in 20260731000000). '
  'Never reactivates a suspended or cancelled affiliate, and never extends coverage once a '
  'cancellation was requested (deferred_reason affiliate_cancelled, added in 20261113010000).';
