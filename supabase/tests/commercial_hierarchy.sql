-- pgTAP tests for the commercial hierarchy (odd/tasks/commercial-crm.md, S2, S3, S7).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c1..01  admin
--   c1..02  supervisor A
--   c1..03  advisor 1 (will be on supervisor A)
--   c1..04  advisor 2 (no supervisor)
--   c1..05  patient
--   c1..06  supervisor B

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'crm-admin@test.local', '', now(), now(), now(), '{"full_name":"Crm Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'crm-sup-a@test.local', '', now(), now(), now(), '{"full_name":"Supervisor A"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'crm-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'crm-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'crm-patient@test.local', '', now(), now(), now(), '{"full_name":"Crm Patient"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'crm-sup-b@test.local', '', now(), now(), now(), '{"full_name":"Supervisor B"}', '{"role":"supervisor"}');

-- ── S3: the supervisor role exists ──────────────────────────────────────────
SELECT is((SELECT role::text FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000002'), 'supervisor',
  'a server-created user can be a supervisor');
SELECT is((SELECT role::text FROM public.user_roles WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000002'), 'supervisor',
  'the supervisor role reaches user_roles');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000002'), true,
  'a supervisor is active by default');

-- ── S3/S7: assignment rules (owner role) ────────────────────────────────────
UPDATE public.profiles SET supervisor_id = 'c1c1c1c1-0000-0000-0000-000000000002' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003';
SELECT is((SELECT supervisor_id::text FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003'), 'c1c1c1c1-0000-0000-0000-000000000002',
  'an advisor can be assigned to a supervisor');

SELECT throws_ok($$UPDATE public.profiles SET supervisor_id = 'c1c1c1c1-0000-0000-0000-000000000003' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004'$$,
  '23514', NULL, 'the supervisor of an advisor must have the supervisor role');
SELECT throws_ok($$UPDATE public.profiles SET supervisor_id = 'c1c1c1c1-0000-0000-0000-000000000002' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000005'$$,
  '23514', NULL, 'only advisors can have a supervisor');
SELECT throws_ok($$UPDATE public.profiles SET supervisor_id = 'c1c1c1c1-0000-0000-0000-000000000002' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000006'$$,
  '23514', NULL, 'a supervisor cannot have a supervisor (one level only)');

-- ── S7: supervisor_id is privileged ─────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT throws_ok($$UPDATE public.profiles SET supervisor_id = 'c1c1c1c1-0000-0000-0000-000000000002' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004'$$,
  '42501', NULL, 'an advisor cannot assign themselves a supervisor');
SELECT lives_ok($$UPDATE public.profiles SET phone = '1122334455' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004'$$,
  'an advisor can still edit their own non-privileged data');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003'), 1,
  'a supervisor can read the profile of an advisor on their team');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004'), 0,
  'a supervisor cannot read the profile of an advisor outside their team');
SELECT results_eq($$SELECT public.is_supervisor_of('c1c1c1c1-0000-0000-0000-000000000003'), public.is_supervisor_of('c1c1c1c1-0000-0000-0000-000000000004')$$,
  $$VALUES (true, false)$$, 'is_supervisor_of is true only for the supervisor''s own advisors');
-- A supervisor only has SELECT on their team (RLS), so the write matches no rows.
UPDATE public.profiles SET supervisor_id = NULL WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003';
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003'), 1,
  'a supervisor cannot reassign their own advisors (the team link is unchanged)');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT lives_ok($$UPDATE public.profiles SET supervisor_id = 'c1c1c1c1-0000-0000-0000-000000000006' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004'$$,
  'an admin can assign an advisor to any supervisor');
SELECT lives_ok($$UPDATE public.profiles SET supervisor_id = 'c1c1c1c1-0000-0000-0000-000000000002' WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004'$$,
  'an admin can reassign an advisor to another supervisor');
RESET ROLE;

-- ── Previous behavior: other roles keep working ─────────────────────────────
SELECT is((SELECT role::text FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003'), 'advisor',
  'advisor accounts are unchanged');

-- ── Removing a supervisor releases their advisors ───────────────────────────
DELETE FROM public.profiles WHERE id = 'c1c1c1c1-0000-0000-0000-000000000002';
SELECT is((SELECT count(*)::int FROM public.profiles WHERE supervisor_id IS NOT NULL AND id IN ('c1c1c1c1-0000-0000-0000-000000000003', 'c1c1c1c1-0000-0000-0000-000000000004')), 0,
  'deleting a supervisor leaves their advisors without a supervisor');

SELECT * FROM finish();
ROLLBACK;
