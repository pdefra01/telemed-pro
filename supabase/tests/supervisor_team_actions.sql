-- pgTAP tests for supervisor actions on their team (odd/tasks/commercial-crm-commissions.md, B1, S1).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c8..01  admin
--   c8..02  supervisor
--   c8..03  advisor 1 (on the supervisor's team)
--   c8..04  advisor 2 (on the supervisor's team)
--   c8..05  advisor 3 (outside the team)
--   c8..11  affiliate brought by advisor 1
--   c8..12  affiliate brought by advisor 3
--   c8..a1  prospect of advisor 1
--   c8..a3  prospect of advisor 3

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c8c8c8c8-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sta-admin@test.local', '', now(), now(), now(), '{"full_name":"Sta Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c8c8c8c8-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sta-sup@test.local', '', now(), now(), now(), '{"full_name":"Sta Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c8c8c8c8-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sta-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Sta Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c8c8c8c8-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'sta-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Sta Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c8c8c8c8-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'sta-adv-3@test.local', '', now(), now(), now(), '{"full_name":"Sta Advisor Three"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c8c8c8c8-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'sta-aff-1@test.local', '', now(), now(), now(), '{"full_name":"Sta Affiliate 1"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c8c8c8c8-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'sta-aff-2@test.local', '', now(), now(), now(), '{"full_name":"Sta Affiliate 2"}', '{}');

INSERT INTO public.producers (id, name, producer_code, email, commission_rate, status, links_shared_count)
VALUES
  ('c8c8c8c8-0000-0000-0000-000000000003', 'Sta Advisor One', 'STA-ONE', 'sta-adv-1@test.local', 10, 'active', 0),
  ('c8c8c8c8-0000-0000-0000-000000000005', 'Sta Advisor Three', 'STA-THREE', 'sta-adv-3@test.local', 10, 'active', 0);

UPDATE public.profiles SET supervisor_id = 'c8c8c8c8-0000-0000-0000-000000000002'
 WHERE id IN ('c8c8c8c8-0000-0000-0000-000000000003', 'c8c8c8c8-0000-0000-0000-000000000004');
UPDATE public.profiles SET producer_id = 'c8c8c8c8-0000-0000-0000-000000000003' WHERE id = 'c8c8c8c8-0000-0000-0000-000000000011';
UPDATE public.profiles SET producer_id = 'c8c8c8c8-0000-0000-0000-000000000005' WHERE id = 'c8c8c8c8-0000-0000-0000-000000000012';

INSERT INTO public.prospects (id, advisor_id, full_name) VALUES
  ('c8c8c8c8-0000-0000-0000-0000000000a1', 'c8c8c8c8-0000-0000-0000-000000000003', 'Team Prospect'),
  ('c8c8c8c8-0000-0000-0000-0000000000a3', 'c8c8c8c8-0000-0000-0000-000000000005', 'Outside Prospect');

-- ── S1: the supervisor acts on the prospects of their team ──────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c8c8c8c8-0000-0000-0000-000000000002","role":"authenticated"}', true);

SELECT lives_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c8c8c8c8-0000-0000-0000-000000000004', 'By Supervisor')$$,
  'a supervisor creates a prospect for an advisor of their team');
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c8c8c8c8-0000-0000-0000-000000000005', 'Outside By Supervisor')$$,
  '42501', NULL, 'a supervisor cannot create a prospect for an advisor outside their team');

SELECT lives_ok($$UPDATE public.prospects SET status = 'contacted', notes = 'called by the supervisor', last_contact_at = now()
                   WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  'a supervisor edits the status and notes of a team prospect');
SELECT results_eq($$SELECT status, notes, last_contact_at IS NOT NULL FROM public.prospects WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  $$VALUES ('contacted', 'called by the supervisor', true)$$, 'the edit was stored');

SELECT lives_ok($$UPDATE public.prospects SET advisor_id = 'c8c8c8c8-0000-0000-0000-000000000004' WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  'a supervisor reassigns a prospect to another advisor of the team');
SELECT results_eq($$SELECT advisor_id::text FROM public.prospects WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  $$VALUES ('c8c8c8c8-0000-0000-0000-000000000004')$$, 'the prospect now belongs to advisor 2');
SELECT throws_ok($$UPDATE public.prospects SET advisor_id = 'c8c8c8c8-0000-0000-0000-000000000005' WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  '42501', NULL, 'a supervisor cannot reassign a prospect outside their team');

UPDATE public.prospects SET status = 'lost' WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a3';
DELETE FROM public.prospects WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1';
RESET ROLE;

SELECT results_eq($$SELECT advisor_id::text FROM public.prospects WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  $$VALUES ('c8c8c8c8-0000-0000-0000-000000000004')$$, 'a supervisor cannot delete a team prospect (the row survives)');
SELECT results_eq($$SELECT status FROM public.prospects WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a3'$$,
  $$VALUES ('new')$$, 'a supervisor cannot edit a prospect outside their team');

-- ── S1: the supervisor logs collection actions on the team's affiliates ─────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c8c8c8c8-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT lives_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c8c8c8c8-0000-0000-0000-000000000011', 'note', 'by supervisor')$$,
  'a supervisor logs a collection action on an affiliate of their team');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c8c8c8c8-0000-0000-0000-000000000012', 'note', 'outside')$$,
  '42501', NULL, 'a supervisor cannot log a collection action on an affiliate outside their team');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note, created_by) VALUES ('c8c8c8c8-0000-0000-0000-000000000011', 'note', 'impersonated', 'c8c8c8c8-0000-0000-0000-000000000003')$$,
  '42501', NULL, 'a supervisor cannot log an action in the name of an advisor');
RESET ROLE;
SELECT results_eq($$SELECT created_by::text FROM public.collection_actions WHERE note = 'by supervisor'$$,
  $$VALUES ('c8c8c8c8-0000-0000-0000-000000000002')$$, 'the action is signed by the supervisor');

SELECT is(has_function_privilege('anon', 'public.can_log_collections(uuid)', 'execute'), false, 'anon still cannot execute can_log_collections');
SELECT is(has_function_privilege('authenticated', 'public.can_log_collections(uuid)', 'execute'), true, 'signed-in users still can');

-- ── Advisors and admins keep their previous behavior ───────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c8c8c8c8-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c8c8c8c8-0000-0000-0000-000000000004', 'For a teammate')$$,
  '42501', NULL, 'an advisor still cannot create a prospect for another advisor, even a teammate');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c8c8c8c8-0000-0000-0000-000000000012', 'note', 'not mine')$$,
  '42501', NULL, 'an advisor still cannot log actions on another advisor''s affiliate');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c8c8c8c8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT lives_ok($$UPDATE public.prospects SET advisor_id = 'c8c8c8c8-0000-0000-0000-000000000005' WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  'an admin still reassigns a prospect to any advisor');
SELECT lives_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c8c8c8c8-0000-0000-0000-000000000012', 'note', 'by admin')$$,
  'an admin still logs actions on any affiliate');
RESET ROLE;
SELECT throws_ok($$UPDATE public.prospects SET advisor_id = 'c8c8c8c8-0000-0000-0000-000000000002' WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  '23514', NULL, 'a prospect still cannot be handed to a non-advisor (the supervisor)');
UPDATE public.prospects SET advisor_id = 'c8c8c8c8-0000-0000-0000-000000000003' WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1';

-- ── A demoted supervisor can do none of it ──────────────────────────────────
-- (the demotion trigger also releases the team; is_supervisor_of() requires the role anyway)
UPDATE public.profiles SET role = 'advisor' WHERE id = 'c8c8c8c8-0000-0000-0000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c8c8c8c8-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name) VALUES ('c8c8c8c8-0000-0000-0000-000000000003', 'After demotion')$$,
  '42501', NULL, 'a demoted supervisor cannot create prospects for the former team');
UPDATE public.prospects SET status = 'lost', advisor_id = 'c8c8c8c8-0000-0000-0000-000000000004' WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1';
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c8c8c8c8-0000-0000-0000-000000000011', 'note', 'after demotion')$$,
  '42501', NULL, 'a demoted supervisor cannot log collection actions');
RESET ROLE;
SELECT results_eq($$SELECT status, advisor_id::text FROM public.prospects WHERE id = 'c8c8c8c8-0000-0000-0000-0000000000a1'$$,
  $$VALUES ('contacted', 'c8c8c8c8-0000-0000-0000-000000000003')$$, 'a demoted supervisor cannot edit or reassign prospects');

SELECT * FROM finish();
ROLLBACK;
