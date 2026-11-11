-- pgTAP tests: a demoted supervisor loses the team (odd/tasks/commercial-crm.md, S3).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c4..01  admin
--   c4..02  supervisor (will be demoted)
--   c4..03  advisor on the supervisor's team
--   c4..04  second supervisor (stays supervisor)
--   c4..0a  prospect of the advisor

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c4c4c4c4-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dem-admin@test.local', '', now(), now(), now(), '{"full_name":"Dem Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c4c4c4c4-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dem-sup@test.local', '', now(), now(), now(), '{"full_name":"Dem Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c4c4c4c4-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'dem-adv@test.local', '', now(), now(), now(), '{"full_name":"Dem Advisor"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c4c4c4c4-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dem-sup-2@test.local', '', now(), now(), now(), '{"full_name":"Dem Supervisor Two"}', '{"role":"supervisor"}');

UPDATE public.profiles SET supervisor_id = 'c4c4c4c4-0000-0000-0000-000000000002' WHERE id = 'c4c4c4c4-0000-0000-0000-000000000003';
INSERT INTO public.prospects (id, advisor_id, full_name) VALUES ('c4c4c4c4-0000-0000-0000-00000000000a', 'c4c4c4c4-0000-0000-0000-000000000003', 'Dem Prospect');
INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c4c4c4c4-0000-0000-0000-000000000003', '2026-10-01', 3);

-- ── Before the demotion the supervisor has the team ─────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c4c4c4c4-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.prospects), 1, 'before demotion: the supervisor sees the team''s prospects');
SELECT is((SELECT count(*)::int FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12') WHERE advisor_id = 'c4c4c4c4-0000-0000-0000-000000000003'), 1,
  'before demotion: the supervisor gets the advisor''s metrics');
RESET ROLE;

-- ── Demotion (owner role, as the server or an admin would do) ───────────────
UPDATE public.profiles SET role = 'patient' WHERE id = 'c4c4c4c4-0000-0000-0000-000000000002';

SELECT is((SELECT supervisor_id FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000003'), NULL::uuid,
  'demoting a supervisor releases their advisors');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c4c4c4c4-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.prospects), 0, 'after demotion: no prospects of the former team');
SELECT is((SELECT count(*)::int FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12') WHERE advisor_id = 'c4c4c4c4-0000-0000-0000-000000000003'), 0,
  'after demotion: no metrics of the former team');
SELECT is((SELECT count(*)::int FROM public.advisor_goals), 0, 'after demotion: no goals of the former team');
SELECT is(public.is_supervisor_of('c4c4c4c4-0000-0000-0000-000000000003'), false, 'after demotion: is_supervisor_of is false');
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c4c4c4c4-0000-0000-0000-000000000003', '2026-12-01', 5)$$,
  '42501', NULL, 'after demotion: cannot set goals for the former team');
RESET ROLE;

-- ── Defence in depth: even a stale pointer grants nothing without the role ──
-- (owner role bypasses the release trigger by writing the pointer directly)
ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET supervisor_id = 'c4c4c4c4-0000-0000-0000-000000000002' WHERE id = 'c4c4c4c4-0000-0000-0000-000000000003';
ALTER TABLE public.profiles ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c4c4c4c4-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is(public.is_supervisor_of('c4c4c4c4-0000-0000-0000-000000000003'), false, 'a stale supervisor_id without the supervisor role is not a team');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000003'), 0, 'a stale supervisor_id gives no read access to the advisor profile');
RESET ROLE;

-- ── Other supervisors are not affected by someone else's demotion ───────────
UPDATE public.profiles SET supervisor_id = 'c4c4c4c4-0000-0000-0000-000000000004' WHERE id = 'c4c4c4c4-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c4c4c4c4-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.prospects), 1, 'a supervisor who stays a supervisor keeps their team');
RESET ROLE;

-- A role change that does not touch a supervisor leaves teams alone.
UPDATE public.profiles SET role = 'doctor' WHERE id = 'c4c4c4c4-0000-0000-0000-000000000001';
SELECT is((SELECT supervisor_id::text FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000003'), 'c4c4c4c4-0000-0000-0000-000000000004',
  'changing another user''s role does not release anyone');

SELECT * FROM finish();
ROLLBACK;
