-- pgTAP tests for get_patient_chart_data (doctors read a patient's chart data).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   e1..01  patient (with sign-up declaration)
--   e1..02  patient (no declaration)
--   e1..03  doctor
--   e1..04  second patient (caller who must not read others)

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chart-p1@test.local', '', now(), now(), now(), '{"full_name":"Chart Patient"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'chart-p2@test.local', '', now(), now(), now(), '{"full_name":"No Declaration"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'chart-doc@test.local', '', now(), now(), now(), '{"full_name":"Chart Doctor"}', '{"role":"doctor"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'chart-p4@test.local', '', now(), now(), now(), '{"full_name":"Other Patient"}', '{}');

UPDATE public.profiles SET dni = '30111222', phone = '3875111222', birth_date = '1980-05-10', blood_type = 'A+', address = 'Calle 1', plan_name = 'Plan X'
WHERE id = 'e1e1e1e1-0000-0000-0000-000000000001';

INSERT INTO public.adhesion_requests (titular_name, titular_dni, titular_email, titular_phone, plan_type, payment_method, medical_history, medical_history_other, titular_health_insurance, family_members, approved_profile_id)
VALUES ('Chart Patient', '30111222', 'chart-p1@test.local', '3875111222', 'individual', 'mercadopago',
  ARRAY['Hipertensión Arterial','Asma'], 'Enalapril 10mg', 'OSDE', '[{"name":"Hijo","age":8}]'::jsonb, 'e1e1e1e1-0000-0000-0000-000000000001');

INSERT INTO public.family_groups (id, primary_affiliate_id, name)
VALUES ('e1e1e1e1-0000-0000-0000-0000000000f1', 'e1e1e1e1-0000-0000-0000-000000000001', 'Chart Group');
UPDATE public.profiles SET family_group_id = 'e1e1e1e1-0000-0000-0000-0000000000f1' WHERE id = 'e1e1e1e1-0000-0000-0000-000000000001';
INSERT INTO public.family_members (family_group_id, full_name, relation, birth_date, dni)
VALUES ('e1e1e1e1-0000-0000-0000-0000000000f1', 'Hijo Chart', 'hijo/a', '2017-03-02', '50111222');

-- ── Doctor ──────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e1e1e1e1-0000-0000-0000-000000000003","role":"authenticated"}', true);

SELECT is(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')->'profile'->>'dni', '30111222', 'a doctor reads the patient personal data');
SELECT is(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')->'profile'->>'bloodType', 'A+', 'the doctor sees the blood type');
SELECT is(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')->'intake'->'medicalHistory', '["Hipertensión Arterial","Asma"]'::jsonb, 'the doctor sees the declared chronic conditions');
SELECT is(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')->'intake'->>'medicalHistoryOther', 'Enalapril 10mg', 'the doctor sees the declared medication');
SELECT is(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')->'intake'->>'healthInsurance', 'OSDE', 'the doctor sees the health insurance');
SELECT is(jsonb_array_length(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')->'intake'->'familyMembers'), 1, 'the doctor sees the declared family members');
SELECT is(jsonb_array_length(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')->'groupMembers'), 1, 'the doctor sees the current family group members');
SELECT ok(NOT (public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')::text ~ '(signature|encrypted_private_key|dni_front|dni_back)'),
  'the payload carries no signature, key material or DNI photos');
SELECT is(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000002')->'intake', 'null'::jsonb, 'a patient without a sign-up declaration has a null intake');
SELECT is(public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000003'), NULL, 'a non-patient id returns nothing');

-- ── Patient and anonymous ───────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"e1e1e1e1-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')$$, '42501', NULL, 'a patient cannot read another patient chart data');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.get_patient_chart_data('e1e1e1e1-0000-0000-0000-000000000001')$$, '42501', NULL, 'anon cannot call it');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
