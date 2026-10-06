-- Migration: 20260926000000_revoke_service_rpcs_from_clients.sql
-- Description: Removes EXECUTE from anon/authenticated on the Mercado Pago
-- service-only RPCs.
--
-- 20260726000000_mercadopago_integration.sql revoked EXECUTE only FROM PUBLIC.
-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated explicitly, so those grants survived and any logged-in or
-- anonymous client could call these RPCs through PostgREST. Each function still
-- rejects non-service callers with its in-body is_service_role() guard; this
-- restores the GRANT-layer barrier the design intended (supabase/tests/
-- mercadopago.sql, "authenticated has NO EXECUTE at the GRANT layer").
--
-- All callers use the service-role client (server.js, server/mercadopago.js).
-- is_service_role() is only invoked from inside SECURITY DEFINER functions and
-- by no RLS policy, so revoking it from client roles is safe.

REVOKE EXECUTE ON FUNCTION public.is_service_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_payment_movement_from_webhook(uuid, text, uuid, numeric, text, text, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_mercadopago_subscription_event(text, text, text, text, timestamptz, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_mercadopago_event_resolution(uuid, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_subscription_enrollment(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_subscription_enrollment(uuid, text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_subscription_reservation(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_service_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.post_payment_movement_from_webhook(uuid, text, uuid, numeric, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_mercadopago_subscription_event(text, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_mercadopago_event_resolution(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_subscription_enrollment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_subscription_enrollment(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_subscription_reservation(uuid) TO service_role;
