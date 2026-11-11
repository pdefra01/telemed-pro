-- pgTAP tests for the prospects table (odd/tasks/commercial-crm.md, S4-S6).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c2..01  admin
--   c2..02  supervisor
--   c2..03  advisor 1 (on the supervisor's team)
--   c2..04  advisor 2 (outside the team)
--   c2..05  patient
--   c2..0a  prospect of advisor 1
--   c2..0b  prospect of advisor 2

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c2c2c2c2-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pros-admin@test.local', '', now(), now(), now(), '{"full_name":"Pros Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c2c2c2c2-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pros-sup@test.local', '', now(), now(), now(), '{"full_name":"Pros Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c2c2c2c2-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pros-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Pros Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c2c2c2c2-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'pros-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Pros Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c2c2c2c2-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'pros-patient@test.local', '', now(), now(), now(), '{"full_name":"Pros Patient"}', '{}');

UPDATE public.profiles SET supervisor_id = 'c2c2c2c2-0000-0000-0000-000000000002' WHERE id = 'c2c2c2c2-0000-0000-0000-000000000003';

INSERT INTO public.prospects (id, advisor_id, full_name, phone)
VALUES
  ('c2c2c2c2-0000-0000-0000-00000000000a', 'c2c2c2c2-0000-0000-0000-000000000003', 'Prospect of One', '1111'),
  ('c2c2c2c2-0000-0000-0000-00000000000b', 'c2c2c2c2-0000-0000-0000-000000000004', 'Prospect of Two', '2222');

-- ── S4, S6: manual entry with a pipeline status ─────────────────────────────
SELECT results_eq($$SELECT status, source FROM public.prospects WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000a'$$,
  $$VALUES ('new', 'manual')$$, 'a new prospect starts as new and manual');
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name, status) VALUES ('c2c2c2c2-0000-0000-0000-000000000003', 'Bad Status', 'won')$$,
  '23514', NULL, 'the pipeline status is constrained');
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c2c2c2c2-0000-0000-0000-000000000003', '  ')$$,
  '23514', NULL, 'a prospect needs a name');
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c2c2c2c2-0000-0000-0000-000000000005', 'Owned By Patient')$$,
  '23514', NULL, 'a prospect can only belong to an advisor');

-- ── S5: advisor sees and edits only their own ───────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c2c2c2c2-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.prospects), 1, 'an advisor sees only their own prospects');
SELECT lives_ok($$INSERT INTO public.prospects (advisor_id, full_name, email) VALUES ('c2c2c2c2-0000-0000-0000-000000000003', 'Own New', 'own@test.local')$$,
  'an advisor can add a prospect for themselves');
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c2c2c2c2-0000-0000-0000-000000000004', 'For Someone Else')$$,
  '42501', NULL, 'an advisor cannot add a prospect for another advisor');
SELECT lives_ok($$UPDATE public.prospects SET status = 'contacted', last_contact_at = now() WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000a'$$,
  'an advisor can move their prospect through the pipeline');
SELECT throws_ok($$UPDATE public.prospects SET advisor_id = 'c2c2c2c2-0000-0000-0000-000000000004' WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000a'$$,
  '42501', NULL, 'an advisor cannot hand their prospect to another advisor');
UPDATE public.prospects SET notes = 'touched' WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000b';
SELECT is((SELECT count(*)::int FROM public.prospects WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000b'), 0,
  'an advisor cannot see or edit another advisor''s prospect');
DELETE FROM public.prospects WHERE full_name = 'Own New';
SELECT is((SELECT count(*)::int FROM public.prospects WHERE full_name = 'Own New'), 0, 'an advisor can delete their own prospect');
RESET ROLE;

SELECT results_eq($$SELECT status, notes IS NULL FROM public.prospects WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000b'$$,
  $$VALUES ('new', true)$$, 'the other advisor''s prospect was not touched');
SELECT ok((SELECT updated_at >= created_at FROM public.prospects WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000a'),
  'updated_at is maintained on update');

-- ── S5: the supervisor reads their team, nothing else ───────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c2c2c2c2-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT results_eq($$SELECT id::text FROM public.prospects$$, $$VALUES ('c2c2c2c2-0000-0000-0000-00000000000a')$$,
  'a supervisor sees only the prospects of their team');
SELECT lives_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c2c2c2c2-0000-0000-0000-000000000003', 'By Supervisor')$$,
  'a supervisor adds prospects for an advisor of their team');
UPDATE public.prospects SET status = 'lost' WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000a';
DELETE FROM public.prospects WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000a';
RESET ROLE;
SELECT results_eq($$SELECT status FROM public.prospects WHERE id = 'c2c2c2c2-0000-0000-0000-00000000000a'$$, $$VALUES ('lost')$$,
  'a supervisor edits but cannot delete their team''s prospects');

-- ── S5: nobody else sees prospects ──────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c2c2c2c2-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.prospects), 0, 'a patient sees no prospects');
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c2c2c2c2-0000-0000-0000-000000000003', 'By Patient')$$,
  '42501', NULL, 'a patient cannot add prospects');
RESET ROLE;

-- ── S5: the admin sees and manages all ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c2c2c2c2-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.prospects), 3, 'an admin sees every prospect (including the supervisor''s)');
SELECT lives_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c2c2c2c2-0000-0000-0000-000000000004', 'By Admin')$$,
  'an admin can add a prospect for any advisor');
RESET ROLE;

-- ── A supervisor removed from the team loses visibility ─────────────────────
UPDATE public.profiles SET supervisor_id = NULL WHERE id = 'c2c2c2c2-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c2c2c2c2-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.prospects), 0, 'a supervisor loses sight of an advisor released from the team');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
