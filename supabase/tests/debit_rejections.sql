-- pgTAP tests for debit rejections per affiliate (odd/tasks/commercial-crm-commissions.md, C1, S4/S5).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   d7..01  admin
--   d7..02  supervisor (team: advisor 1)
--   d7..03  advisor 1 (code DEB-ONE)
--   d7..04  advisor 2 (code DEB-TWO, outside the team)
--   d7..11  affiliate of advisor 1, debit rejected through the webhook RPC, then recovered
--   d7..12  affiliate of advisor 1, no debit subscription
--   d7..13  affiliate of advisor 2, debit rejected (old cancelled row + newer failed row)
--   d7..14  affiliate of advisor 2, a cancelled failed row and a newer authorized one

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'deb-admin@test.local', '', now(), now(), now(), '{"full_name":"Deb Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'deb-sup@test.local', '', now(), now(), now(), '{"full_name":"Deb Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'deb-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Deb Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'deb-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Deb Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'deb-aff-1@test.local', '', now(), now(), now(), '{"full_name":"Deb Affiliate 1"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'deb-aff-2@test.local', '', now(), now(), now(), '{"full_name":"Deb Affiliate 2"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'deb-aff-3@test.local', '', now(), now(), now(), '{"full_name":"Deb Affiliate 3"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'd7d7d7d7-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'deb-aff-4@test.local', '', now(), now(), now(), '{"full_name":"Deb Affiliate 4"}', '{}');

INSERT INTO public.producers (id, name, producer_code, email, commission_rate, status, links_shared_count)
VALUES
  ('d7d7d7d7-0000-0000-0000-000000000003', 'Deb Advisor One', 'DEB-ONE', 'deb-adv-1@test.local', 10, 'active', 0),
  ('d7d7d7d7-0000-0000-0000-000000000004', 'Deb Advisor Two', 'DEB-TWO', 'deb-adv-2@test.local', 10, 'active', 0);

UPDATE public.profiles SET promoter_code = 'DEB-ONE', supervisor_id = 'd7d7d7d7-0000-0000-0000-000000000002' WHERE id = 'd7d7d7d7-0000-0000-0000-000000000003';
UPDATE public.profiles SET promoter_code = 'DEB-TWO' WHERE id = 'd7d7d7d7-0000-0000-0000-000000000004';
UPDATE public.profiles SET producer_id = 'd7d7d7d7-0000-0000-0000-000000000003'
 WHERE id IN ('d7d7d7d7-0000-0000-0000-000000000011', 'd7d7d7d7-0000-0000-0000-000000000012');
UPDATE public.profiles SET producer_id = 'd7d7d7d7-0000-0000-0000-000000000004'
 WHERE id IN ('d7d7d7d7-0000-0000-0000-000000000013', 'd7d7d7d7-0000-0000-0000-000000000014');

INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status, status_changed_at, created_at, last_failure_at, failure_count) VALUES
  ('d7d7d7d7-0000-0000-0000-000000000011', 'deb-pre-11', 'authorized', '2026-09-01 00:00+00', '2026-09-01 00:00+00', NULL, 0),
  ('d7d7d7d7-0000-0000-0000-000000000013', 'deb-pre-13-old', 'cancelled', '2026-06-01 00:00+00', '2026-05-01 00:00+00', NULL, 0),
  ('d7d7d7d7-0000-0000-0000-000000000013', 'deb-pre-13', 'payment_failed', '2026-10-10 00:00+00', '2026-07-01 00:00+00', '2026-10-10 00:00+00', 2),
  ('d7d7d7d7-0000-0000-0000-000000000014', 'deb-pre-14-old', 'payment_failed', '2026-06-10 00:00+00', '2026-05-01 00:00+00', '2026-06-10 00:00+00', 1),
  ('d7d7d7d7-0000-0000-0000-000000000014', 'deb-pre-14', 'authorized', '2026-08-01 00:00+00', '2026-08-01 00:00+00', NULL, 0),
  -- An unfinalized reservation is never the "current" subscription.
  ('d7d7d7d7-0000-0000-0000-000000000014', NULL, 'pending', NULL, '2026-11-01 00:00+00', NULL, 0);

-- The rejection arrives through the same RPC the webhook and the periodic MP query use.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(
  public.record_mercadopago_subscription_event('deb-pre-11', 'subscription_authorized_payment_rejected', 'deb-ap-oct', 'payment_failed', '2026-10-10 12:00+00'),
  'status_applied', 'the rejection of affiliate 1 is recorded');

-- ── Cobranzas: rejected ─────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT results_eq($$
  SELECT debit_rejected, debit_rejected_at, debit_failures
    FROM public.advisor_collections() WHERE affiliate_id = 'd7d7d7d7-0000-0000-0000-000000000011'$$,
  $$VALUES (true, '2026-10-10 12:00+00'::timestamptz, 1)$$,
  'a rejected debit is marked with its date and failure count');
SELECT results_eq($$
  SELECT debit_rejected, debit_rejected_at, debit_failures
    FROM public.advisor_collections() WHERE affiliate_id = 'd7d7d7d7-0000-0000-0000-000000000012'$$,
  $$VALUES (false, NULL::timestamptz, 0)$$,
  'an affiliate without a debit subscription is not marked');
SELECT results_eq($$SELECT affiliate_id::text FROM public.advisor_collections() ORDER BY 1$$,
  $$VALUES ('d7d7d7d7-0000-0000-0000-000000000011'), ('d7d7d7d7-0000-0000-0000-000000000012')$$,
  'the advisor scope is unchanged');
RESET ROLE;

-- ── Cobranzas: recovered ────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(
  public.record_mercadopago_subscription_event('deb-pre-11', 'subscription_authorized_payment_processed', 'deb-ap-nov', 'authorized', '2026-11-10 12:00+00'),
  'status_applied', 'the next processed debit of affiliate 1 is recorded');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT results_eq($$
  SELECT debit_rejected, debit_rejected_at, debit_failures
    FROM public.advisor_collections() WHERE affiliate_id = 'd7d7d7d7-0000-0000-0000-000000000011'$$,
  $$VALUES (false, '2026-10-10 12:00+00'::timestamptz, 1)$$,
  'a recovered debit is no longer marked (the last rejection stays as history)');
SELECT results_eq($$SELECT affiliate_id::text FROM public.advisor_collections() ORDER BY 1$$,
  $$VALUES ('d7d7d7d7-0000-0000-0000-000000000011'), ('d7d7d7d7-0000-0000-0000-000000000012')$$,
  'the supervisor scope is unchanged');
RESET ROLE;

-- ── Cobranzas: the current subscription decides ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$
  SELECT affiliate_id::text, debit_rejected, debit_failures
    FROM public.advisor_collections()
   WHERE affiliate_id IN ('d7d7d7d7-0000-0000-0000-000000000013', 'd7d7d7d7-0000-0000-0000-000000000014')
   ORDER BY 1$$,
  $$VALUES ('d7d7d7d7-0000-0000-0000-000000000013', true, 2), ('d7d7d7d7-0000-0000-0000-000000000014', false, 0)$$,
  'the newest non-reservation subscription decides the mark');

-- ── Padrón de Afiliados: admin data source ──────────────────────────────────
SELECT results_eq($$
  SELECT profile_id::text, debit_rejected_at, debit_failures
    FROM public.admin_debit_rejections()
   WHERE profile_id::text LIKE 'd7d7d7d7-%' ORDER BY 1$$,
  $$VALUES ('d7d7d7d7-0000-0000-0000-000000000013', '2026-10-10 00:00+00'::timestamptz, 2)$$,
  'the admin gets only the affiliates whose current debit is rejected');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.admin_debit_rejections()), 0, 'an advisor gets nothing from the admin data source');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000013","role":"authenticated"}', true);
SELECT results_eq($$SELECT profile_id::text FROM public.admin_debit_rejections()$$,
  $$VALUES ('d7d7d7d7-0000-0000-0000-000000000013')$$,
  'an affiliate sees at most their own row');
RESET ROLE;

SELECT is(has_function_privilege('anon', 'public.admin_debit_rejections()', 'execute'), false, 'anonymous callers cannot execute the admin data source');
SELECT is(has_function_privilege('anon', 'public.advisor_collections()', 'execute'), false, 'anonymous callers still cannot execute the collections list');
SELECT is(has_function_privilege('authenticated', 'public.advisor_collections()', 'execute'), true, 'signed-in users still execute the collections list');

SELECT * FROM finish();
ROLLBACK;
