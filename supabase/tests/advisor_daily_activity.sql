-- pgTAP tests for daily commercial activity (odd/tasks/team-activity-trends.md, S2, S4).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c9..01  admin
--   c9..02  supervisor
--   c9..03  advisor 1 (promoter DAY-ONE, on the supervisor's team)
--   c9..04  advisor 2 (promoter DAY-TWO, outside the team)
--   c9..05  patient
--   c9..11/12  affiliates brought by advisor 1 (11 paid, 12 never paid)
--   c9..b1/b2  adhesion requests of advisor 1 (b1 -> affiliate 11, b2 -> affiliate 12)

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'day-admin@test.local', '', now(), now(), now(), '{"full_name":"Day Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'day-sup@test.local', '', now(), now(), now(), '{"full_name":"Day Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'day-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Day Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'day-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Day Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'day-patient@test.local', '', now(), now(), now(), '{"full_name":"Day Patient"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'day-aff-1@test.local', '', now(), now(), now(), '{"full_name":"Day Affiliate 1"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'day-aff-2@test.local', '', now(), now(), now(), '{"full_name":"Day Affiliate 2"}', '{}');

UPDATE public.profiles SET promoter_code = 'DAY-ONE', supervisor_id = 'c9c9c9c9-0000-0000-0000-000000000002' WHERE id = 'c9c9c9c9-0000-0000-0000-000000000003';
UPDATE public.profiles SET promoter_code = 'DAY-TWO' WHERE id = 'c9c9c9c9-0000-0000-0000-000000000004';

-- Prospects. 2026-11-01 01:00 UTC is 2026-10-31 22:00 in Argentina, so pr4 belongs to October.
INSERT INTO public.prospects (id, advisor_id, full_name, status, status_changed_at, created_at) VALUES
  ('c9c9c9c9-0000-0000-0000-0000000000a1', 'c9c9c9c9-0000-0000-0000-000000000003', 'Day Prospect 1', 'new', NULL, '2026-11-03 12:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000a2', 'c9c9c9c9-0000-0000-0000-000000000003', 'Day Prospect 2', 'affiliated', '2026-11-05 12:00+00', '2026-11-03 13:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000a3', 'c9c9c9c9-0000-0000-0000-000000000003', 'Day Prospect 3', 'new', NULL, '2026-10-30 12:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000a4', 'c9c9c9c9-0000-0000-0000-000000000003', 'Day Prospect 4', 'new', NULL, '2026-11-01 01:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000a5', 'c9c9c9c9-0000-0000-0000-000000000004', 'Day Prospect 5', 'new', NULL, '2026-11-03 12:00+00');

INSERT INTO public.collection_actions (affiliate_id, action_type, note, created_by, created_at) VALUES
  ('c9c9c9c9-0000-0000-0000-000000000011', 'call', 'first call', 'c9c9c9c9-0000-0000-0000-000000000003', '2026-11-03 12:00+00'),
  ('c9c9c9c9-0000-0000-0000-000000000011', 'whatsapp', 'reminder', 'c9c9c9c9-0000-0000-0000-000000000003', '2026-11-03 18:00+00'),
  ('c9c9c9c9-0000-0000-0000-000000000012', 'call', 'second affiliate', 'c9c9c9c9-0000-0000-0000-000000000003', '2026-11-04 12:00+00');

INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, approved_profile_id, activated_at, created_at)
VALUES
  ('c9c9c9c9-0000-0000-0000-0000000000b1', 'Day Sale 1', '92000001', '1990-01-01', 'x', 'x', 'x', 'ds1@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'DAY-ONE', 'c9c9c9c9-0000-0000-0000-000000000011', '2026-11-02 12:00+00', '2026-11-02 12:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000b2', 'Day Sale 2', '92000002', '1990-01-01', 'x', 'x', 'x', 'ds2@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'DAY-ONE', 'c9c9c9c9-0000-0000-0000-000000000012', '2026-11-02 12:00+00', '2026-11-02 12:00+00');

-- Affiliate 11 first pays on 2026-11-05; a later payment does not count again. Affiliate 12 never pays.
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'c9c9c9c9-0000-0000-0000-000000000011', 'charge',  1000, '2026-11-02 12:00+00'),
  ('affiliate', 'c9c9c9c9-0000-0000-0000-000000000011', 'payment', 1000, '2026-11-05 12:00+00'),
  ('affiliate', 'c9c9c9c9-0000-0000-0000-000000000011', 'payment', 1000, '2026-11-06 12:00+00'),
  ('affiliate', 'c9c9c9c9-0000-0000-0000-000000000012', 'charge',  1000, '2026-11-02 12:00+00');

-- Links on 2026-11-03: b1 sent twice (one request, paid), b2 sent once (unpaid). A failed delivery does not count.
INSERT INTO public.adhesion_payment_link_deliveries (adhesion_request_id, channel, status, created_at) VALUES
  ('c9c9c9c9-0000-0000-0000-0000000000b1', 'whatsapp', 'sent',   '2026-11-03 12:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000b1', 'email',    'sent',   '2026-11-03 14:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000b2', 'whatsapp', 'sent',   '2026-11-03 15:00+00'),
  ('c9c9c9c9-0000-0000-0000-0000000000b2', 'whatsapp', 'failed', '2026-11-04 12:00+00');

-- ── S2/S4: the admin sees every advisor, per Argentina day ──────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT results_eq(
  $$SELECT advisor_id::text, day, prospects_loaded, prospects_affiliated, collection_actions, affiliates_sold, links_sent, links_paid
      FROM public.advisor_daily_activity('2026-11-01')
     WHERE advisor_id IN ('c9c9c9c9-0000-0000-0000-000000000003', 'c9c9c9c9-0000-0000-0000-000000000004')
     ORDER BY day, advisor_id$$,
  $$VALUES
    ('c9c9c9c9-0000-0000-0000-000000000003', '2026-11-03'::date, 2::bigint, 0::bigint, 2::bigint, 0::bigint, 2::bigint, 1::bigint),
    ('c9c9c9c9-0000-0000-0000-000000000004', '2026-11-03'::date, 1::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint),
    ('c9c9c9c9-0000-0000-0000-000000000003', '2026-11-04'::date, 0::bigint, 0::bigint, 1::bigint, 0::bigint, 0::bigint, 0::bigint),
    ('c9c9c9c9-0000-0000-0000-000000000003', '2026-11-05'::date, 0::bigint, 1::bigint, 0::bigint, 1::bigint, 0::bigint, 0::bigint)$$,
  'admin: daily counts per advisor; resent links count once; failed links and the Argentina-October prospect are excluded');

SELECT results_eq(
  $$SELECT day, prospects_loaded FROM public.advisor_daily_activity('2026-10-01')
     WHERE advisor_id = 'c9c9c9c9-0000-0000-0000-000000000003' ORDER BY day$$,
  $$VALUES ('2026-10-30'::date, 1::bigint), ('2026-10-31'::date, 1::bigint)$$,
  'the previous month holds the October prospect and the one created at the Argentina-midnight boundary');

-- ── S4: a supervisor sees only their team ────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT DISTINCT advisor_id::text FROM public.advisor_daily_activity('2026-11-01')$$,
  $$VALUES ('c9c9c9c9-0000-0000-0000-000000000003')$$,
  'a supervisor sees only the advisors of their team');

-- ── S4: an advisor sees only themselves ──────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT DISTINCT advisor_id::text FROM public.advisor_daily_activity('2026-11-01')$$,
  $$VALUES ('c9c9c9c9-0000-0000-0000-000000000004')$$,
  'an advisor sees only their own activity');

-- ── S4: anyone else sees nothing ─────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.advisor_daily_activity('2026-11-01')), 0::bigint, 'a patient sees no activity');
RESET ROLE;

SELECT is(has_function_privilege('anon', 'public.advisor_daily_activity(date)', 'execute'), false, 'anonymous callers cannot execute the daily activity');
SELECT is(has_function_privilege('authenticated', 'public.advisor_daily_activity(date)', 'execute'), true, 'signed-in users can execute the daily activity');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.routine_privileges WHERE routine_name = 'advisor_daily_activity' AND grantee = 'PUBLIC'), 'PUBLIC cannot execute the daily activity');
SELECT is((SELECT prosecdef FROM pg_proc WHERE oid = 'public.advisor_daily_activity(date)'::regprocedure), true, 'the daily activity runs as security definer');
SELECT ok((SELECT proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = 'public.advisor_daily_activity(date)'::regprocedure), 'the daily activity pins search_path');

-- ── S4: an advisor on a team sees only themselves ────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT results_eq(
  $$SELECT DISTINCT advisor_id::text FROM public.advisor_daily_activity('2026-11-01')$$,
  $$VALUES ('c9c9c9c9-0000-0000-0000-000000000003')$$,
  'an advisor on a team sees only their own activity');

-- ── S4: a role claimed only in JWT metadata grants nothing ───────────────────
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000005","role":"authenticated","user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}', true);
SELECT is((SELECT count(*) FROM public.advisor_daily_activity('2026-11-01')), 0::bigint, 'an admin claim in JWT metadata grants no visibility');
RESET ROLE;

-- ── S4: an inactive advisor is hidden, as in advisor_monthly_metrics ─────────
UPDATE public.profiles SET is_active = false WHERE id = 'c9c9c9c9-0000-0000-0000-000000000004';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.advisor_daily_activity('2026-11-01') WHERE advisor_id = 'c9c9c9c9-0000-0000-0000-000000000004'), 0::bigint, 'an inactive advisor is hidden from the admin');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
