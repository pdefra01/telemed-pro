-- pgTAP tests for 20260926000000_revoke_service_rpcs_from_clients.sql.
-- Service-only RPCs must not be executable by client roles (anon,
-- authenticated) at the GRANT layer; service_role keeps EXECUTE.
-- Also guards is_service_role() callers: every function that calls it must
-- be SECURITY DEFINER, and no policy or view may reference it, otherwise
-- client requests reaching them would fail with "permission denied".
BEGIN;
SELECT no_plan();

CREATE TEMP TABLE service_rpcs (sig TEXT) ON COMMIT DROP;
INSERT INTO service_rpcs VALUES
  ('public.is_service_role()'),
  ('public.post_payment_movement_from_webhook(uuid,text,uuid,numeric,text,text,timestamptz)'),
  ('public.record_mercadopago_subscription_event(text,text,text,text,timestamptz,text)'),
  ('public.mark_mercadopago_event_resolution(uuid,text,text,text)'),
  ('public.claim_subscription_enrollment(uuid)'),
  ('public.finalize_subscription_enrollment(uuid,text,numeric)'),
  ('public.release_subscription_reservation(uuid)');

SELECT ok(NOT has_function_privilege('anon', sig::regprocedure, 'EXECUTE'), sig || ': anon has no EXECUTE')
  FROM service_rpcs;
SELECT ok(NOT has_function_privilege('authenticated', sig::regprocedure, 'EXECUTE'), sig || ': authenticated has no EXECUTE')
  FROM service_rpcs;
SELECT ok(has_function_privilege('service_role', sig::regprocedure, 'EXECUTE'), sig || ': service_role has EXECUTE')
  FROM service_rpcs;

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname <> 'is_service_role'
      AND p.prosrc ILIKE '%is_service_role%' AND NOT p.prosecdef),
  0, 'every caller of is_service_role() is SECURITY DEFINER');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE coalesce(qual, '') || coalesce(with_check, '') ILIKE '%is_service_role%'),
  0, 'no RLS policy references is_service_role()');
SELECT is(
  (SELECT count(*)::int FROM pg_views WHERE definition ILIKE '%is_service_role%'),
  0, 'no view references is_service_role()');

SELECT * FROM finish();
ROLLBACK;
