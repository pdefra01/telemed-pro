-- pgTAP tests for monthly goals and advisor metrics (odd/tasks/commercial-crm.md, S9-S11).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c3..01  admin
--   c3..02  supervisor
--   c3..03  advisor 1 (promoter ADV-ONE, on the supervisor's team)
--   c3..04  advisor 2 (promoter ADV-TWO, outside the team)
--   c3..05  patient
--   c3..11/12/13  affiliates (plan A / plan B / plan A)
--   c3..a1  plan A (monthly_cost 1000)   c3..a2  plan B (monthly_cost 2500)

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'goal-admin@test.local', '', now(), now(), now(), '{"full_name":"Goal Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'goal-sup@test.local', '', now(), now(), now(), '{"full_name":"Goal Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'goal-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Goal Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'goal-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Goal Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'goal-patient@test.local', '', now(), now(), now(), '{"full_name":"Goal Patient"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'goal-aff-1@test.local', '', now(), now(), now(), '{"full_name":"Goal Affiliate 1"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'goal-aff-2@test.local', '', now(), now(), now(), '{"full_name":"Goal Affiliate 2"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c3c3c3c3-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'goal-aff-3@test.local', '', now(), now(), now(), '{"full_name":"Goal Affiliate 3"}', '{}');

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES
  ('c3c3c3c3-0000-0000-0000-0000000000a1', 'Goal Plan A', 1000, 0, 4, 1, 0, true),
  ('c3c3c3c3-0000-0000-0000-0000000000a2', 'Goal Plan B', 2500, 0, 4, 1, 0, true);

UPDATE public.profiles SET promoter_code = 'ADV-ONE', supervisor_id = 'c3c3c3c3-0000-0000-0000-000000000002' WHERE id = 'c3c3c3c3-0000-0000-0000-000000000003';
UPDATE public.profiles SET promoter_code = 'ADV-TWO' WHERE id = 'c3c3c3c3-0000-0000-0000-000000000004';
UPDATE public.profiles SET plan_id = 'c3c3c3c3-0000-0000-0000-0000000000a1' WHERE id IN ('c3c3c3c3-0000-0000-0000-000000000011', 'c3c3c3c3-0000-0000-0000-000000000013');
UPDATE public.profiles SET plan_id = 'c3c3c3c3-0000-0000-0000-0000000000a2' WHERE id = 'c3c3c3c3-0000-0000-0000-000000000012';

INSERT INTO public.producers (id, name, producer_code, email, commission_rate, status, links_shared_count)
VALUES ('c3c3c3c3-0000-0000-0000-000000000003', 'Goal Advisor One', 'ADV-ONE', 'goal-adv-1@test.local', 10, 'active', 7);

-- Sales. October 2026 for ADV-ONE: r1 (plan A), r2 (plan B), r6 (no profile), r7 (activated_at null,
-- falls back to created_at), r8 (plan A, Argentina-midnight boundary). r3 is November, r4 is pending.
-- ADV-TWO has r5 in October.
INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, approved_profile_id, activated_at, created_at)
VALUES
  ('c3c3c3c3-0000-0000-0000-0000000000b1', 'Sale 1', '90000001', '1990-01-01', 'x', 'x', 'x', 's1@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'ADV-ONE', 'c3c3c3c3-0000-0000-0000-000000000011', '2026-10-15 12:00+00', '2026-10-14 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000b2', 'Sale 2', '90000002', '1990-01-01', 'x', 'x', 'x', 's2@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'ADV-ONE', 'c3c3c3c3-0000-0000-0000-000000000012', '2026-10-20 12:00+00', '2026-10-19 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000b3', 'Sale 3', '90000003', '1990-01-01', 'x', 'x', 'x', 's3@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'ADV-ONE', 'c3c3c3c3-0000-0000-0000-000000000011', '2026-11-02 12:00+00', '2026-11-01 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000b4', 'Sale 4', '90000004', '1990-01-01', 'x', 'x', 'x', 's4@test.local', '1', 'soltero', 'cash', 'sig', 'pending', 'ADV-ONE', NULL, NULL, '2026-10-16 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000b5', 'Sale 5', '90000005', '1990-01-01', 'x', 'x', 'x', 's5@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'ADV-TWO', 'c3c3c3c3-0000-0000-0000-000000000013', '2026-10-21 12:00+00', '2026-10-20 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000b6', 'Sale 6', '90000006', '1990-01-01', 'x', 'x', 'x', 's6@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'ADV-ONE', NULL, '2026-10-22 12:00+00', '2026-10-21 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000b7', 'Sale 7', '90000007', '1990-01-01', 'x', 'x', 'x', 's7@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'ADV-ONE', NULL, NULL, '2026-10-25 12:00+00'),
  -- r8: 2026-11-01 01:00 UTC is 2026-10-31 22:00 in Argentina, so it belongs to October.
  ('c3c3c3c3-0000-0000-0000-0000000000b8', 'Sale 8', '90000008', '1990-01-01', 'x', 'x', 'x', 's8@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'ADV-ONE', 'c3c3c3c3-0000-0000-0000-000000000011', '2026-11-01 01:00+00', '2026-10-31 12:00+00');

-- Prospects of advisor 1. October cohort: p1 affiliated, p2 contacted, p3 new, p5 lost-after-contact.
INSERT INTO public.prospects (id, advisor_id, full_name, status, last_contact_at, created_at)
VALUES
  ('c3c3c3c3-0000-0000-0000-0000000000c1', 'c3c3c3c3-0000-0000-0000-000000000003', 'P1', 'affiliated', '2026-10-20 12:00+00', '2026-10-05 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000c2', 'c3c3c3c3-0000-0000-0000-000000000003', 'P2', 'contacted',  '2026-11-08 12:00+00', '2026-10-06 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000c3', 'c3c3c3c3-0000-0000-0000-000000000003', 'P3', 'new',        NULL,                  '2026-10-07 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000c4', 'c3c3c3c3-0000-0000-0000-000000000003', 'P4', 'new',        NULL,                  '2026-11-03 12:00+00'),
  ('c3c3c3c3-0000-0000-0000-0000000000c5', 'c3c3c3c3-0000-0000-0000-000000000003', 'P5', 'lost',       '2026-10-09 12:00+00', '2026-10-08 12:00+00');

-- ── S10: goal rules (owner role) ────────────────────────────────────────────
INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates, target_revenue)
VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-10-01', 5, 4000);

SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-10-15', 1)$$,
  '23514', NULL, 'a goal month must be the first day of the month');
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month) VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-12-01')$$,
  '23514', NULL, 'a goal needs at least one target');
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_revenue) VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-12-01', -1)$$,
  '23514', NULL, 'targets cannot be negative');
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-10-01', 9)$$,
  '23505', NULL, 'one goal per advisor and month');
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000005', '2026-12-01', 1)$$,
  '23514', NULL, 'a goal can only belong to an advisor');

-- ── S10: who can read and write goals ───────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_goals), 1, 'an advisor reads their own goals');
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-12-01', 99)$$,
  '42501', NULL, 'an advisor cannot set goals, not even their own');
UPDATE public.advisor_goals SET target_affiliates = 99 WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003';
DELETE FROM public.advisor_goals WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003';
RESET ROLE;
SELECT is((SELECT target_affiliates FROM public.advisor_goals WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003' AND month = '2026-10-01'), 5,
  'an advisor cannot edit or delete their goals');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_goals), 1, 'a supervisor reads their team''s goals');
SELECT lives_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_revenue) VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-11-01', 3000)$$,
  'a supervisor sets a goal for an advisor on their team');
SELECT lives_ok($$UPDATE public.advisor_goals SET target_affiliates = 6 WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003' AND month = '2026-10-01'$$,
  'a supervisor edits their team''s goal');
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000004', '2026-11-01', 3)$$,
  '42501', NULL, 'a supervisor cannot set a goal for an advisor outside their team');
SELECT lives_ok($$DELETE FROM public.advisor_goals WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003' AND month = '2026-11-01'$$,
  'a supervisor removes their team''s goal');
RESET ROLE;
SELECT is((SELECT target_affiliates FROM public.advisor_goals WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003' AND month = '2026-10-01'), 6,
  'the supervisor''s edit was stored');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_goals), 0, 'a patient reads no goals');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT lives_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000004', '2026-10-01', 3)$$,
  'an admin sets a goal for any advisor');
RESET ROLE;

-- ── S11: metrics, as the admin (sees every advisor) ─────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT results_eq($$
  SELECT advisor_id::text, affiliates_sold::int, revenue::numeric, prospects_loaded::int, prospects_contacted::int,
         prospects_affiliated::int, prospects_stale::int, links_shared::int, goal_affiliates::int, goal_revenue::numeric
    FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12')
   WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003'$$,
  $$VALUES ('c3c3c3c3-0000-0000-0000-000000000003', 5, 4500::numeric, 4, 3, 1, 2, 7, 6, 4000::numeric)$$,
  'October metrics of advisor 1: sold (incl. null activated_at fallback and the Argentina-midnight sale), plan-price revenue, prospect cohort, stale, links, goals');

SELECT results_eq($$
  SELECT affiliates_sold::int, revenue::numeric, prospects_loaded::int, links_shared::int, goal_affiliates::int, goal_revenue::numeric
    FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12')
   WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000004'$$,
  $$VALUES (1, 1000::numeric, 0, 0, 3, NULL::numeric)$$,
  'advisor 2 has one sale, no prospects, no links row and only an affiliates goal');

SELECT results_eq($$
  SELECT affiliates_sold::int, revenue::numeric, prospects_loaded::int, goal_affiliates::int, goal_revenue::numeric
    FROM public.advisor_monthly_metrics('2026-11-17', '2026-11-12')
   WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003'$$,
  $$VALUES (1, 1000::numeric, 1, NULL::int, NULL::numeric)$$,
  'any date inside a month selects that month (November: one sale, one prospect, the goal was removed)');

SELECT is((SELECT count(*)::int FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12')
            WHERE advisor_id IN ('c3c3c3c3-0000-0000-0000-000000000003', 'c3c3c3c3-0000-0000-0000-000000000004')), 2,
  'an admin gets every advisor');
RESET ROLE;

-- ── S11: metrics scope by caller ────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisor_id::text FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12')
                     WHERE advisor_id IN ('c3c3c3c3-0000-0000-0000-000000000003', 'c3c3c3c3-0000-0000-0000-000000000004')$$,
  $$VALUES ('c3c3c3c3-0000-0000-0000-000000000003')$$, 'a supervisor gets only their team');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisor_id::text FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12')$$,
  $$VALUES ('c3c3c3c3-0000-0000-0000-000000000003')$$, 'an advisor gets only their own metrics');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_monthly_metrics('2026-10-01', '2026-11-12')), 0, 'a patient gets no metrics');
RESET ROLE;

-- Privileges are checked with has_function_privilege: actually calling a function
-- as anon without EXECUTE crashes the local Postgres 17.6 (reproduced with a trivial function).
SELECT is(has_function_privilege('anon', 'public.advisor_monthly_metrics(date,timestamptz)', 'execute'), false,
  'anonymous callers cannot execute the metrics function');
SELECT is(has_function_privilege('authenticated', 'public.advisor_monthly_metrics(date,timestamptz)', 'execute'), true,
  'signed-in users can execute the metrics function');
SELECT is(has_function_privilege('anon', 'public.is_supervisor_of(uuid)', 'execute'), false,
  'anonymous callers cannot execute is_supervisor_of');

-- ── S10: the upsert the UI uses (INSERT ... ON CONFLICT DO UPDATE) respects the same scope ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000004', '2026-10-01', 99)
                   ON CONFLICT (advisor_id, month) DO UPDATE SET target_affiliates = EXCLUDED.target_affiliates$$,
  '42501', NULL, 'a supervisor cannot upsert over the goal of an advisor outside their team');
SELECT lives_ok($$INSERT INTO public.advisor_goals (advisor_id, month, target_affiliates) VALUES ('c3c3c3c3-0000-0000-0000-000000000003', '2026-10-01', 8)
                   ON CONFLICT (advisor_id, month) DO UPDATE SET target_affiliates = EXCLUDED.target_affiliates$$,
  'a supervisor can upsert over the goal of an advisor on their team');
RESET ROLE;
SELECT is((SELECT target_affiliates FROM public.advisor_goals WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000004' AND month = '2026-10-01'), 3,
  'the out-of-team goal was not touched by the rejected upsert');
SELECT is((SELECT target_affiliates FROM public.advisor_goals WHERE advisor_id = 'c3c3c3c3-0000-0000-0000-000000000003' AND month = '2026-10-01'), 8,
  'the in-team upsert was stored');

SELECT * FROM finish();
ROLLBACK;
