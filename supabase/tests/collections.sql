-- pgTAP tests for collections follow-up (odd/tasks/commercial-crm.md, S12, S13).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c5..01  admin
--   c5..02  supervisor
--   c5..03  advisor 1 (code COL-ONE, on the supervisor's team)
--   c5..04  advisor 2 (code COL-TWO, outside the team)
--   c5..05  unrelated patient (a caller with no commercial role)
--   c5..11  affiliate brought by advisor 1 through profiles.producer_id (overdue, 1500)
--   c5..12  affiliate brought by advisor 1 through an approved adhesion request (current, 0)
--   c5..13  affiliate brought by advisor 2 (pending, 800)
--   c5..14  affiliate nobody brought

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'col-admin@test.local', '', now(), now(), now(), '{"full_name":"Col Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'col-sup@test.local', '', now(), now(), now(), '{"full_name":"Col Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'col-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Col Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'col-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Col Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'col-other@test.local', '', now(), now(), now(), '{"full_name":"Col Other"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'col-aff-1@test.local', '', now(), now(), now(), '{"full_name":"Col Affiliate 1"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'col-aff-2@test.local', '', now(), now(), now(), '{"full_name":"Col Affiliate 2"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'col-aff-3@test.local', '', now(), now(), now(), '{"full_name":"Col Affiliate 3"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c5c5c5c5-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'col-aff-4@test.local', '', now(), now(), now(), '{"full_name":"Col Affiliate 4"}', '{}');

INSERT INTO public.producers (id, name, producer_code, email, commission_rate, status, links_shared_count)
VALUES
  ('c5c5c5c5-0000-0000-0000-000000000003', 'Col Advisor One', 'COL-ONE', 'col-adv-1@test.local', 10, 'active', 0),
  ('c5c5c5c5-0000-0000-0000-000000000004', 'Col Advisor Two', 'COL-TWO', 'col-adv-2@test.local', 10, 'active', 0);

UPDATE public.profiles SET promoter_code = 'COL-ONE', supervisor_id = 'c5c5c5c5-0000-0000-0000-000000000002' WHERE id = 'c5c5c5c5-0000-0000-0000-000000000003';
UPDATE public.profiles SET promoter_code = 'COL-TWO' WHERE id = 'c5c5c5c5-0000-0000-0000-000000000004';
UPDATE public.profiles SET producer_id = 'c5c5c5c5-0000-0000-0000-000000000003' WHERE id = 'c5c5c5c5-0000-0000-0000-000000000011';
UPDATE public.profiles SET producer_id = 'c5c5c5c5-0000-0000-0000-000000000004' WHERE id = 'c5c5c5c5-0000-0000-0000-000000000013';

INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, approved_profile_id, activated_at)
VALUES ('c5c5c5c5-0000-0000-0000-0000000000b1', 'Col Sale', '91000001', '1990-01-01', 'x', 'x', 'x', 'colsale@test.local', '1', 'soltero', 'cash', 'sig',
  'approved', 'COL-ONE', 'c5c5c5c5-0000-0000-0000-000000000012', now());

-- Ledger: aff 11 owes 1500 with an expired window (overdue); aff 12 is fully paid; aff 13 owes 800 inside a valid window (pending).
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount) VALUES
  ('affiliate', 'c5c5c5c5-0000-0000-0000-000000000011', 'charge', 1500),
  ('affiliate', 'c5c5c5c5-0000-0000-0000-000000000012', 'charge', 1000),
  ('affiliate', 'c5c5c5c5-0000-0000-0000-000000000012', 'payment', 1000),
  ('affiliate', 'c5c5c5c5-0000-0000-0000-000000000013', 'charge', 800);
INSERT INTO public.family_coverage_windows (subject_profile_id, paid_through) VALUES
  ('c5c5c5c5-0000-0000-0000-000000000011', '2020-01-01 00:00+00'),
  ('c5c5c5c5-0000-0000-0000-000000000013', '2099-01-01 00:00+00');

-- Two earlier actions on aff 11 (explicit dates so "last" is deterministic).
INSERT INTO public.collection_actions (affiliate_id, action_type, note, promised_date, created_by, created_at) VALUES
  ('c5c5c5c5-0000-0000-0000-000000000011', 'call', 'first call', NULL, 'c5c5c5c5-0000-0000-0000-000000000003', '2026-11-01 12:00+00'),
  ('c5c5c5c5-0000-0000-0000-000000000011', 'promise', 'will pay in December', '2026-12-01', 'c5c5c5c5-0000-0000-0000-000000000003', '2026-11-05 12:00+00');

-- ── S12/S13: the collections list (admin sees every brought affiliate, every status) ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT results_eq($$
  SELECT advisor_id::text, payment_status, balance::numeric, paid_through IS NOT NULL, actions_count::int, last_action_type, promised_date
    FROM public.advisor_collections() WHERE affiliate_id = 'c5c5c5c5-0000-0000-0000-000000000011'$$,
  $$VALUES ('c5c5c5c5-0000-0000-0000-000000000003', 'overdue', 1500::numeric, true, 2, 'promise', '2026-12-01'::date)$$,
  'affiliate brought through producer_id: overdue, balance, coverage, two actions, last is the promise');

SELECT results_eq($$
  SELECT advisor_id::text, payment_status, balance::numeric, paid_through IS NOT NULL, actions_count::int, last_action_type, promised_date
    FROM public.advisor_collections() WHERE affiliate_id = 'c5c5c5c5-0000-0000-0000-000000000012'$$,
  $$VALUES ('c5c5c5c5-0000-0000-0000-000000000003', 'current', 0::numeric, false, 0, NULL::text, NULL::date)$$,
  'affiliate brought through an approved adhesion request: fully paid, listed as current');

SELECT results_eq($$
  SELECT advisor_id::text, payment_status, balance::numeric, actions_count::int
    FROM public.advisor_collections() WHERE affiliate_id = 'c5c5c5c5-0000-0000-0000-000000000013'$$,
  $$VALUES ('c5c5c5c5-0000-0000-0000-000000000004', 'pending', 800::numeric, 0)$$,
  'affiliate of advisor 2: pending inside a valid coverage window');

SELECT is((SELECT count(*)::int FROM public.advisor_collections() WHERE affiliate_id = 'c5c5c5c5-0000-0000-0000-000000000014'), 0,
  'an affiliate nobody brought is not listed');
RESET ROLE;

-- ── S12: scope of the list by caller ────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT results_eq($$SELECT affiliate_id::text FROM public.advisor_collections() ORDER BY 1$$,
  $$VALUES ('c5c5c5c5-0000-0000-0000-000000000011'), ('c5c5c5c5-0000-0000-0000-000000000012')$$,
  'an advisor lists only the affiliates they brought');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT results_eq($$SELECT affiliate_id::text FROM public.advisor_collections() ORDER BY 1$$,
  $$VALUES ('c5c5c5c5-0000-0000-0000-000000000011'), ('c5c5c5c5-0000-0000-0000-000000000012')$$,
  'a supervisor lists their team''s affiliates, whatever their status');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT results_eq($$SELECT affiliate_id::text FROM public.advisor_collections()$$,
  $$VALUES ('c5c5c5c5-0000-0000-0000-000000000013')$$, 'an advisor outside the team lists only their own');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_collections()), 0, 'a patient lists nothing');
SELECT is((SELECT count(*)::int FROM public.collection_actions), 0, 'a patient reads no collection actions');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c5c5c5c5-0000-0000-0000-000000000011', 'note', 'x')$$,
  '42501', NULL, 'a patient cannot log collection actions');
RESET ROLE;

SELECT is(has_function_privilege('anon', 'public.advisor_collections()', 'execute'), false, 'anonymous callers cannot execute the collections list');
SELECT is(has_function_privilege('authenticated', 'public.advisor_collections()', 'execute'), true, 'signed-in users can execute the collections list');

-- ── S12: the advisor logs actions for their own affiliates ──────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.collection_actions), 2, 'an advisor reads the actions on their affiliates');
SELECT lives_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c5c5c5c5-0000-0000-0000-000000000012', 'whatsapp', 'sent reminder')$$,
  'an advisor logs an action on an affiliate they brought (also one brought through the adhesion request)');
SELECT lives_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, promised_date) VALUES ('c5c5c5c5-0000-0000-0000-000000000012', 'promise', '2026-12-10')$$,
  'a promise to pay with a date is accepted');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c5c5c5c5-0000-0000-0000-000000000013', 'call', 'not mine')$$,
  '42501', NULL, 'an advisor cannot log an action on another advisor''s affiliate');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note, created_by) VALUES ('c5c5c5c5-0000-0000-0000-000000000011', 'call', 'forged', 'c5c5c5c5-0000-0000-0000-000000000004')$$,
  '42501', NULL, 'an advisor cannot log an action in someone else''s name');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type) VALUES ('c5c5c5c5-0000-0000-0000-000000000011', 'promise')$$,
  '23514', NULL, 'a promise to pay needs a date');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c5c5c5c5-0000-0000-0000-000000000011', 'note', '   ')$$,
  '23514', NULL, 'a note action needs text');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type) VALUES ('c5c5c5c5-0000-0000-0000-000000000011', 'email')$$,
  '23514', NULL, 'the action type is constrained');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c5c5c5c5-0000-0000-0000-000000000004', 'note', 'an advisor is not an affiliate')$$,
  '23514', NULL, 'actions can only be logged on affiliates (patients)');
-- The history is append-only: no UPDATE or DELETE privilege for API roles.
SELECT throws_ok($$UPDATE public.collection_actions SET note = 'edited' WHERE affiliate_id = 'c5c5c5c5-0000-0000-0000-000000000011'$$,
  '42501', NULL, 'actions cannot be edited');
SELECT throws_ok($$DELETE FROM public.collection_actions WHERE affiliate_id = 'c5c5c5c5-0000-0000-0000-000000000011'$$,
  '42501', NULL, 'actions cannot be deleted');
RESET ROLE;

SELECT results_eq($$SELECT created_by::text FROM public.collection_actions WHERE note = 'sent reminder'$$,
  $$VALUES ('c5c5c5c5-0000-0000-0000-000000000003')$$, 'created_by defaults to the logged-in advisor');

-- ── S12: the supervisor only reads; other advisors see nothing of it ────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.collection_actions), 4, 'a supervisor reads every action on their team''s affiliates');
SELECT throws_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c5c5c5c5-0000-0000-0000-000000000011', 'note', 'by supervisor')$$,
  '42501', NULL, 'a supervisor cannot log actions (read-only)');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.collection_actions), 0, 'another advisor sees no actions on affiliates they did not bring');
RESET ROLE;

-- ── S12: the admin reads and logs everywhere ────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.collection_actions), 4, 'an admin reads all actions');
SELECT lives_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note) VALUES ('c5c5c5c5-0000-0000-0000-000000000013', 'call', 'admin follow-up')$$,
  'an admin logs an action on any brought affiliate');
RESET ROLE;

-- ── A demoted supervisor loses the actions along with the team ──────────────
UPDATE public.profiles SET role = 'patient' WHERE id = 'c5c5c5c5-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c5c5c5c5-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.collection_actions), 0, 'a demoted supervisor reads no actions');
SELECT is((SELECT count(*)::int FROM public.advisor_collections()), 0, 'a demoted supervisor lists no affiliates');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
