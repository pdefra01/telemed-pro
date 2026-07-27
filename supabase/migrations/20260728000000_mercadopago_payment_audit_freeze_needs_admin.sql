-- Migration: Extend the record_mercadopago_payment_audit_event freeze guard
-- to also cover resolution_state = 'needs_admin' (Judgment Day Round 2 fix)
--
-- 20260727000000's own handlePaymentSettlement fix writes
-- resolution_state='needs_admin' (instead of 'final') for the
-- outcome==='window_reset' case, so a human can review it. But this RPC's
-- ON CONFLICT ... DO UPDATE freeze guard only checked
-- resolution_state = 'final' — 'needs_admin' was left unprotected. The very
-- next ordinary MP webhook redelivery of the same payment
-- (post_payment_movement_from_webhook's own idempotent ON CONFLICT DO
-- NOTHING guarantees v_posted=false, outcome='duplicate' on redelivery)
-- would silently overwrite resolution_state back to 'final', before any
-- admin ever saw the case. This defeats the entire purpose of the
-- window_reset fix.
--
-- mark_mercadopago_event_resolution (the sweep's own bookkeeping RPC)
-- already guards on WHERE resolution_state = 'pending' — meaning once a row
-- reaches EITHER 'final' OR 'needs_admin', that RPC already refuses to touch
-- it further. Treating 'needs_admin' as ALSO frozen here is consistent with
-- how the rest of this system already treats that state: a human, not
-- automation, must be the one to move a row out of 'needs_admin'.
--
-- This migration re-defines record_mercadopago_payment_audit_event via
-- CREATE OR REPLACE with an identical signature, which preserves its
-- existing ACL automatically (same precedent as the renew_coverage_window
-- re-definition in 20260726000000_mercadopago_integration.sql) — the only
-- change is widening each `resolution_state = 'final'` freeze condition to
-- `resolution_state IN ('final', 'needs_admin')`.

CREATE OR REPLACE FUNCTION public.record_mercadopago_payment_audit_event(
  p_mp_resource_id TEXT,
  p_mp_status TEXT,
  p_outcome TEXT,
  p_resolution_state TEXT,
  p_detail TEXT DEFAULT NULL,
  p_invoice_id UUID DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_mp_resource_id IS NULL OR p_mp_resource_id = '' THEN
    RAISE EXCEPTION 'record_mercadopago_payment_audit_event requires a non-empty mp_resource_id';
  END IF;

  INSERT INTO public.mercadopago_events (
    event_type, mp_resource_id, mp_status, outcome, resolution_state, detail, invoice_id, profile_id, amount
  ) VALUES (
    'payment', p_mp_resource_id, p_mp_status, p_outcome, p_resolution_state, p_detail, p_invoice_id, p_profile_id, p_amount
  )
  ON CONFLICT (event_type, mp_resource_id) DO UPDATE SET
    mp_status = CASE WHEN mercadopago_events.resolution_state IN ('final', 'needs_admin') THEN mercadopago_events.mp_status ELSE EXCLUDED.mp_status END,
    outcome = CASE WHEN mercadopago_events.resolution_state IN ('final', 'needs_admin') THEN mercadopago_events.outcome ELSE EXCLUDED.outcome END,
    resolution_state = CASE WHEN mercadopago_events.resolution_state IN ('final', 'needs_admin') THEN mercadopago_events.resolution_state ELSE EXCLUDED.resolution_state END,
    detail = CASE WHEN mercadopago_events.resolution_state IN ('final', 'needs_admin') THEN mercadopago_events.detail ELSE EXCLUDED.detail END,
    invoice_id = CASE WHEN mercadopago_events.resolution_state IN ('final', 'needs_admin') THEN mercadopago_events.invoice_id ELSE EXCLUDED.invoice_id END,
    profile_id = CASE WHEN mercadopago_events.resolution_state IN ('final', 'needs_admin') THEN mercadopago_events.profile_id ELSE EXCLUDED.profile_id END,
    amount = CASE WHEN mercadopago_events.resolution_state IN ('final', 'needs_admin') THEN mercadopago_events.amount ELSE EXCLUDED.amount END;
END;
$$;

COMMENT ON FUNCTION public.record_mercadopago_payment_audit_event IS 'Idempotent upsert for payment-topic mercadopago_events audit rows (event_type is always the literal ''payment'', so the composite UNIQUE(event_type, mp_resource_id) degrades to bare mp_resource_id for this topic — this function refreshes the row on every redelivery instead of PR1''s DO-NOTHING pattern used by record_mercadopago_subscription_event). Freeze rule applied uniformly to every column: once a row''s resolution_state reaches EITHER ''final'' (a genuinely settled, no-further-action-needed outcome) OR ''needs_admin'' (a case requiring human review), the ENTIRE row is permanently frozen against automated writes — every subsequent call for the same mp_resource_id is a pure no-op, regardless of what values it passes (including a ''duplicate'' outcome from an ordinary webhook redelivery, which must not silently overwrite a ''needs_admin'' row back to ''final'' before a human reviews it). Until a row reaches ''final'' or ''needs_admin'', every call fully overwrites every column (mp_status/outcome/resolution_state/detail/invoice_id/profile_id/amount) with the latest known truth — callers must pass the complete current field set, including explicit NULL to intentionally clear a stale value (e.g. a successful settlement should pass detail=NULL to clear an earlier rpc_error message).';
