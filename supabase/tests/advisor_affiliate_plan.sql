-- pgTAP tests: an advisor with a plan is an affiliate (odd/tasks/advisor-affiliate-plan.md, S3, S4).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   d5..01  admin
--   d5..02  advisor WITH a plan (on the supervisor's team)
--   d5..03  supervisor
--   d5..04  advisor WITHOUT a plan
--   d5..05  doctor
--   d5..06  regular patient
--   d5..a1  plan

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'd5d5d5d5-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'aap-admin@test.local', '', now(), now(), now(), '{"full_name":"Aap Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'd5d5d5d5-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'aap-adv-plan@test.local', '', now(), now(), now(), '{"full_name":"Aap Advisor Plan"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'd5d5d5d5-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'aap-sup@test.local', '', now(), now(), now(), '{"full_name":"Aap Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'd5d5d5d5-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'aap-adv-noplan@test.local', '', now(), now(), now(), '{"full_name":"Aap Advisor No Plan"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'd5d5d5d5-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'aap-doc@test.local', '', now(), now(), now(), '{"full_name":"Aap Doctor"}', '{"role":"doctor"}'),
  ('00000000-0000-0000-0000-000000000000', 'd5d5d5d5-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'aap-pat@test.local', '', now(), now(), now(), '{"full_name":"Aap Patient"}', '{}');

UPDATE public.profiles SET role = 'advisor', is_active = true WHERE id IN ('d5d5d5d5-0000-0000-0000-000000000002', 'd5d5d5d5-0000-0000-0000-000000000004');
UPDATE public.profiles SET role = 'supervisor', is_active = true WHERE id = 'd5d5d5d5-0000-0000-0000-000000000003';
UPDATE public.profiles SET role = 'doctor', is_active = true WHERE id = 'd5d5d5d5-0000-0000-0000-000000000005';
UPDATE public.profiles SET role = 'admin', is_active = true WHERE id = 'd5d5d5d5-0000-0000-0000-000000000001';
UPDATE public.profiles SET supervisor_id = 'd5d5d5d5-0000-0000-0000-000000000003' WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002';

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES ('d5d5d5d5-0000-0000-0000-0000000000a1', 'Aap Plan', 1500, 2, 4, 6, 1, false);

INSERT INTO public.producers (id, name, producer_code, email, commission_rate, status, links_shared_count)
VALUES
  ('d5d5d5d5-0000-0000-0000-000000000002', 'Aap Advisor Plan', 'AAP-PLAN', 'aap-adv-plan@test.local', 10, 'active', 0),
  ('d5d5d5d5-0000-0000-0000-000000000004', 'Aap Advisor No Plan', 'AAP-NOPLAN', 'aap-adv-noplan@test.local', 10, 'active', 0);

-- The admin assigns the plan (opens the free coverage window long ago).
UPDATE public.profiles SET plan_id = 'd5d5d5d5-0000-0000-0000-0000000000a1' WHERE id IN ('d5d5d5d5-0000-0000-0000-000000000002', 'd5d5d5d5-0000-0000-0000-000000000006');
INSERT INTO public.family_coverage_windows (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited,
                                            paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES ('d5d5d5d5-0000-0000-0000-000000000002', 'd5d5d5d5-0000-0000-0000-0000000000a1', '2026-01-01', '2026-08-01', 14, false, 6, 1, 1500);

-- ── S3: who counts as an affiliate ──────────────────────────────────────────
SELECT is(public.is_affiliate('d5d5d5d5-0000-0000-0000-000000000002'), true, 'an advisor with a plan is an affiliate');
SELECT is(public.is_affiliate('d5d5d5d5-0000-0000-0000-000000000004'), false, 'an advisor without a plan is not an affiliate');
SELECT is(public.is_affiliate('d5d5d5d5-0000-0000-0000-000000000006'), true, 'a patient is an affiliate');
SELECT is(public.is_affiliate('d5d5d5d5-0000-0000-0000-000000000005'), false, 'a doctor is not an affiliate');
SELECT is(has_function_privilege('authenticated', 'public.is_affiliate(uuid)', 'EXECUTE'), false, 'is_affiliate is not exposed to the API');

-- ── S3: the doctor sees the advisor's chart ─────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d5d5d5d5-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is(public.get_patient_chart_data('d5d5d5d5-0000-0000-0000-000000000002') -> 'profile' ->> 'fullName', 'Aap Advisor Plan',
  'the doctor gets the chart of an advisor with a plan');
SELECT is(public.get_patient_chart_data('d5d5d5d5-0000-0000-0000-000000000002') -> 'plan' ->> 'name', 'Aap Plan', 'the chart carries the advisor''s plan');
SELECT is(public.get_patient_chart_data('d5d5d5d5-0000-0000-0000-000000000004'), NULL::jsonb, 'an advisor without a plan has no chart');
SELECT isnt(public.get_patient_chart_data('d5d5d5d5-0000-0000-0000-000000000006'), NULL::jsonb, 'a patient still has a chart');
RESET ROLE;

-- ── S4: deactivating an advisor WITH a plan turns them into a paying affiliate ──
SELECT is((SELECT has_account FROM public.set_advisor_status('d5d5d5d5-0000-0000-0000-000000000002', false)), true,
  'deactivation reports the account');
SELECT is((SELECT role FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), 'patient', 'the advisor with a plan becomes a patient');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), true, 'and can still log in');
SELECT is((SELECT plan_id FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), 'd5d5d5d5-0000-0000-0000-0000000000a1'::uuid, 'and keeps the plan');
SELECT is((SELECT supervisor_id FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), NULL::uuid, 'and leaves the supervisor''s team');
SELECT is((SELECT role FROM public.user_roles WHERE user_id = 'd5d5d5d5-0000-0000-0000-000000000002'), 'patient', 'user_roles follows');
SELECT is((SELECT status FROM public.producers WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), 'inactive', 'the referral link stops');
SELECT ok((SELECT period_start > now() - interval '1 minute' FROM public.family_coverage_windows WHERE subject_profile_id = 'd5d5d5d5-0000-0000-0000-000000000002'),
  'billing starts now: the coverage window reopens at the deactivation');
SELECT is((SELECT paid_through::date FROM public.family_coverage_windows WHERE subject_profile_id = 'd5d5d5d5-0000-0000-0000-000000000002'),
  (now() + interval '7 months')::date, 'the reopened window lasts the plan''s paid + bonus months');
SELECT is((SELECT count(*)::int FROM public.family_coverage_windows WHERE subject_profile_id = 'd5d5d5d5-0000-0000-0000-000000000002'), 1, 'no second window');

-- ── S4: reactivating turns them back into an advisor ────────────────────────
SELECT is((SELECT has_account FROM public.set_advisor_status('d5d5d5d5-0000-0000-0000-000000000002', true)), true, 'reactivation reports the account');
SELECT is((SELECT role FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), 'advisor', 'the former advisor is an advisor again');
SELECT is((SELECT status FROM public.producers WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), 'active', 'the referral link works again');

-- ── S4: an advisor WITHOUT a plan keeps today's deactivation ────────────────
SELECT is((SELECT has_account FROM public.set_advisor_status('d5d5d5d5-0000-0000-0000-000000000004', false)), true, 'deactivation without a plan reports the account');
SELECT is((SELECT role FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000004'), 'advisor', 'stays an advisor');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000004'), false, 'and cannot log in');
SELECT is((SELECT has_account FROM public.set_advisor_status('d5d5d5d5-0000-0000-0000-000000000004', true)), true, 'reactivation without a plan reports the account');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000004'), true, 'and can log in again');

-- A regular patient is never touched by set_advisor_status (no producers row).
SELECT throws_ok($$SELECT * FROM public.set_advisor_status('d5d5d5d5-0000-0000-0000-000000000006', true)$$, 'P0002', 'advisor_not_found',
  'a patient without a producers row is not an advisor');

SELECT * FROM finish();
ROLLBACK;
