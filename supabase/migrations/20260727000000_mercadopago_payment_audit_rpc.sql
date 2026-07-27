-- Migration: Mercado Pago payment-topic audit RPC (Judgment Day Round 2 fix)
--
-- 20260726000000's own header comment claimed every branch of every webhook
-- topic writes exactly one mercadopago_events row via
-- `INSERT ... ON CONFLICT (event_type, mp_resource_id) DO NOTHING` and that
-- "final rows are never touched again". That is correct for
-- record_mercadopago_subscription_event (event_type varies per transition,
-- so DO NOTHING is the right dedup). It is WRONG for handlePaymentSettlement's
-- payment-topic writes, which always use the literal event_type='payment' —
-- the composite UNIQUE(event_type, mp_resource_id) degrades to bare
-- mp_resource_id for that topic, and a redelivery genuinely needs its row
-- refreshed, not frozen at first-seen.
--
-- PR2 (uncommitted) attempted this with a client-side
-- `supabaseAdmin.from('mercadopago_events').upsert(row, {onConflict:...})`
-- (bare ON CONFLICT DO UPDATE). Judgment Day Round 2 (two independent blind
-- judges, both ESCALATED) found this broken in three ways: (1) partial-column
-- staleness — inconsistent field sets across call sites left some columns
-- (e.g. detail) stuck with stale values from an earlier, different-outcome
-- write; (2) a 'duplicate' outcome (the normal case on any ordinary webhook
-- redelivery of an already-settled payment) clobbered a real prior outcome
-- (e.g. 'posted'), destroying audit history for the most common case; (3) no
-- monotonic guard on resolution_state, so a later transient failure could
-- downgrade an already-'final' row back to 'pending'. Both judges also noted
-- this contradicted 20260726000000's own documented "writes only via
-- SECURITY DEFINER RPC" pattern for this table.
--
-- This migration replaces the client-side upsert with a single, purpose-built
-- SECURITY DEFINER RPC for the payment topic only (record_mercadopago_subscription_event
-- is untouched and keeps its own DO-NOTHING dedup for every other topic).

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
    mp_status = CASE WHEN mercadopago_events.resolution_state = 'final' THEN mercadopago_events.mp_status ELSE EXCLUDED.mp_status END,
    outcome = CASE WHEN mercadopago_events.resolution_state = 'final' THEN mercadopago_events.outcome ELSE EXCLUDED.outcome END,
    resolution_state = CASE WHEN mercadopago_events.resolution_state = 'final' THEN mercadopago_events.resolution_state ELSE EXCLUDED.resolution_state END,
    detail = CASE WHEN mercadopago_events.resolution_state = 'final' THEN mercadopago_events.detail ELSE EXCLUDED.detail END,
    invoice_id = CASE WHEN mercadopago_events.resolution_state = 'final' THEN mercadopago_events.invoice_id ELSE EXCLUDED.invoice_id END,
    profile_id = CASE WHEN mercadopago_events.resolution_state = 'final' THEN mercadopago_events.profile_id ELSE EXCLUDED.profile_id END,
    amount = CASE WHEN mercadopago_events.resolution_state = 'final' THEN mercadopago_events.amount ELSE EXCLUDED.amount END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mercadopago_payment_audit_event FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_mercadopago_payment_audit_event FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_mercadopago_payment_audit_event TO service_role;

COMMENT ON FUNCTION public.record_mercadopago_payment_audit_event IS 'Idempotent upsert for payment-topic mercadopago_events audit rows (event_type is always the literal ''payment'', so the composite UNIQUE(event_type, mp_resource_id) degrades to bare mp_resource_id for this topic — this function refreshes the row on every redelivery instead of PR1''s DO-NOTHING pattern used by record_mercadopago_subscription_event). Single freeze-once-final rule applied uniformly to every column: once a row''s resolution_state reaches ''final'', the ENTIRE row is permanently frozen — every subsequent call for the same mp_resource_id is a pure no-op, regardless of what values it passes (including a ''duplicate'' outcome, which can therefore only ever arrive on an already-final row). Until a row reaches ''final'', every call fully overwrites every column (mp_status/outcome/resolution_state/detail/invoice_id/profile_id/amount) with the latest known truth — callers must pass the complete current field set, including explicit NULL to intentionally clear a stale value (e.g. a successful settlement should pass detail=NULL to clear an earlier rpc_error message).';
