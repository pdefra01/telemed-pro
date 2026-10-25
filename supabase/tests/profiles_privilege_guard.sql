-- pgTAP tests for the profiles privilege guard (odd/tasks/profiles-privilege-escalation.md, S1-S4).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   9a..01  patient (self-service caller)
--   9a..02  admin
--   9a..03  self-signup trying role=admin via user metadata
--   9a..04  server-created doctor (role in app metadata)
--   9a..05  self-signup trying is_active=true via user metadata
--   9b..01  plan

BEGIN;
SELECT no_plan();

-- ── Fixtures (owner role) ───────────────────────────────────────────────────
INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES ('9b9b9b9b-0000-0000-0000-000000000001', 'Guard Plan', 1000, 0, 4, 1, 0, true);

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'guard-patient@test.local', '', now(), now(), now(),
   '{"role":"patient","full_name":"Guard Patient"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'guard-admin@test.local', '', now(), now(), now(),
   '{"full_name":"Guard Admin"}', '{"role":"admin"}');

-- ── S3: signup never trusts user-controlled metadata ────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'guard-selfadmin@test.local', '', now(), now(), now(),
   '{"role":"admin","full_name":"Self Admin"}', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'guard-doctor@test.local', '', now(), now(), now(),
   '{"role":"doctor","full_name":"Server Doctor"}', '{"provider":"email","role":"doctor"}'),
  ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'guard-selfactive@test.local', '', now(), now(), now(),
   '{"role":"patient","is_active":true,"full_name":"Self Active"}', '{"provider":"email"}');

SELECT is((SELECT role::text FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000003'), 'patient',
  'self-signup with user metadata role=admin gets a patient profile');
SELECT is((SELECT role::text FROM public.user_roles WHERE user_id = '9a9a9a9a-0000-0000-0000-000000000003'), 'patient',
  'self-signup with user metadata role=admin is not an admin in user_roles');
SELECT is((SELECT role::text FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000004'), 'doctor',
  'a server-created user takes its role from app metadata');
SELECT is((SELECT is_active FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000004'), true,
  'a server-created doctor is active');
SELECT is((SELECT is_active FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000005'), false,
  'self-signup cannot activate itself through user metadata');
SELECT is((SELECT role::text FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000002'), 'admin',
  'admin fixture created from app metadata');

-- GoTrue admin createUser inserts the user first and writes app_metadata in a
-- later UPDATE: the profile starts as an inactive patient and the server grants
-- the role with a service-role update (server/profileAccess.js).
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'guard-gotrue@test.local', '', now(), now(), now(),
  '{"role":"doctor","full_name":"GoTrue Doctor"}', '{"provider":"email"}');
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"doctor"}' WHERE id = '9a9a9a9a-0000-0000-0000-000000000006';
SELECT results_eq($$SELECT role::text, is_active FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000006'$$,
  $$VALUES ('patient', false)$$, 'createUser order: the new profile starts as an inactive patient');
SET LOCAL ROLE service_role;
UPDATE public.profiles SET role = 'doctor', is_active = true WHERE id = '9a9a9a9a-0000-0000-0000-000000000006';
RESET ROLE;
SELECT results_eq($$SELECT p.role::text, p.is_active, ur.role::text FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = '9a9a9a9a-0000-0000-0000-000000000006'$$,
  $$VALUES ('doctor', true, 'doctor')$$, 'the server role grant reaches profiles and user_roles');

-- ── S1, S2: a patient cannot change privileged columns of its own row ───────
UPDATE public.profiles SET plan_status = 'suspended' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT throws_ok($$UPDATE public.profiles SET role = 'admin' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'a patient cannot make itself admin');
SELECT ok(NOT public.is_admin(), 'the patient is still not an admin');
SELECT throws_ok($$UPDATE public.profiles SET plan_id = '9b9b9b9b-0000-0000-0000-000000000001' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'a patient cannot assign itself a plan');
SELECT throws_ok($$UPDATE public.profiles SET plan_status = 'active' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'a patient cannot change its plan status');
SELECT throws_ok($$UPDATE public.profiles SET is_active = true WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'a patient cannot activate itself');
SELECT throws_ok($$UPDATE public.profiles SET is_dni_verified = true, is_verified = true WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'a patient cannot mark itself verified');
SELECT throws_ok($$INSERT INTO public.profiles (id, role, full_name) VALUES ('9a9a9a9a-0000-0000-0000-000000000001', 'admin', 'x')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role$$,
  '42501', NULL, 'an upsert cannot change the role either');

SELECT throws_ok($$INSERT INTO public.profiles (id, role, full_name) VALUES ('9a9a9a9a-0000-0000-0000-0000000000ee', 'patient', 'x')$$,
  '42501', NULL, 'a user cannot insert profiles directly');

-- S4: non-privileged personal columns stay editable, and rewriting a privileged column with its same value is allowed
SELECT lives_ok($$UPDATE public.profiles SET phone = '3875000000', address = 'Calle 1', first_name = 'Guard' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  'a patient can edit its personal data');
SELECT lives_ok($$UPDATE public.profiles SET role = role, phone = '3875000001' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  'writing a privileged column with its unchanged value is allowed');

-- Self-service exceptions: own family group only, quota may only grow
RESET ROLE;
INSERT INTO public.family_groups (id, primary_affiliate_id, name) VALUES
  ('9c9c9c9c-0000-0000-0000-000000000001', '9a9a9a9a-0000-0000-0000-000000000001', 'Own group'),
  ('9c9c9c9c-0000-0000-0000-000000000002', '9a9a9a9a-0000-0000-0000-000000000002', 'Someone else''s group');
UPDATE public.profiles SET current_period_quota_used = 2 WHERE id = '9a9a9a9a-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT throws_ok($$UPDATE public.profiles SET family_group_id = '9c9c9c9c-0000-0000-0000-000000000002' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'a patient cannot join a family group it does not own');
SELECT lives_ok($$UPDATE public.profiles SET family_group_id = '9c9c9c9c-0000-0000-0000-000000000001' WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  'a patient can link its own family group');
SELECT lives_ok($$UPDATE public.profiles SET current_period_quota_used = 3 WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  'booking can increment the quota counter');
SELECT throws_ok($$UPDATE public.profiles SET current_period_quota_used = 0 WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  '42501', NULL, 'a patient cannot reset its quota counter');

SELECT throws_ok($$WITH gone AS (DELETE FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000001' RETURNING id)
  INSERT INTO public.profiles (id, role, full_name, plan_status, current_period_quota_used)
  SELECT id, 'patient', 'x', 'active', -500 FROM gone$$,
  '42501', NULL, 'a user cannot delete and re-create its profile with other values');

-- S4: an admin can still change privileged columns of anyone
SELECT set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT lives_ok($$UPDATE public.profiles SET plan_id = '9b9b9b9b-0000-0000-0000-000000000001', plan_status = 'active', is_active = true
  WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$, 'an admin can assign a plan and activate a patient');

RESET ROLE;

SELECT is((SELECT role::text FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'), 'patient', 'the patient row kept role patient');
SELECT is((SELECT plan_id FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'), '9b9b9b9b-0000-0000-0000-000000000001'::uuid,
  'the admin plan assignment persisted');
SELECT is((SELECT phone FROM public.profiles WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'), '3875000001', 'the self-service edit persisted');

-- S4: the service role (server) is not blocked
SET LOCAL ROLE service_role;
SELECT lives_ok($$UPDATE public.profiles SET is_active = false WHERE id = '9a9a9a9a-0000-0000-0000-000000000001'$$,
  'the service role can change privileged columns');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
