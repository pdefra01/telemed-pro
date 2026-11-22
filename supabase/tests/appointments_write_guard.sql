-- pgTAP tests: appointments write guard (migration 20261122010000).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   a7..01  patient (books)
--   a7..02  another patient
--   a7..03  doctor of the appointments
--   a7..04  another doctor
--   a7..b1..b9  appointments of a7..01 with a7..03

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', ('a7a7a7a7-0000-0000-0000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'appt-guard-' || n || '@test.local', '', now(), now(), now(), ('{"full_name":"Appt ' || n || '"}')::jsonb, '{}'::jsonb
  FROM generate_series(1, 4) AS n;

UPDATE public.profiles SET role = 'patient', is_active = true WHERE id IN ('a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000002');
UPDATE public.profiles SET role = 'doctor', is_active = true WHERE id IN ('a7a7a7a7-0000-0000-0000-000000000003', 'a7a7a7a7-0000-0000-0000-000000000004');
UPDATE public.user_roles SET role = 'doctor' WHERE user_id IN ('a7a7a7a7-0000-0000-0000-000000000003', 'a7a7a7a7-0000-0000-0000-000000000004');

INSERT INTO public.appointments (id, patient_id, doctor_id, scheduled_at, status, livekit_room_name) VALUES
  ('a7a7a7a7-0000-0000-0000-0000000000b1', 'a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '1 day',  'confirmed', gen_random_uuid()::text),
  ('a7a7a7a7-0000-0000-0000-0000000000b2', 'a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '2 days', 'confirmed', gen_random_uuid()::text),
  ('a7a7a7a7-0000-0000-0000-0000000000b3', 'a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() - interval '1 day',  'cancelled', gen_random_uuid()::text),
  ('a7a7a7a7-0000-0000-0000-0000000000b4', 'a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() - interval '2 days', 'completed', gen_random_uuid()::text),
  ('a7a7a7a7-0000-0000-0000-0000000000b5', 'a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '3 days', 'in_progress', gen_random_uuid()::text),
  ('a7a7a7a7-0000-0000-0000-0000000000b6', 'a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '4 days', 'confirmed', gen_random_uuid()::text),
  ('a7a7a7a7-0000-0000-0000-0000000000b7', 'a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '5 days', 'confirmed', gen_random_uuid()::text);

-- The INSERT policy production already had now comes from a migration.
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments'
                    AND policyname = 'Permitir insercion de turnos propios' AND cmd = 'INSERT'),
  'the appointments INSERT policy exists');

-- ===== Patient =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a7a7a7a7-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT lives_ok($$INSERT INTO public.appointments (patient_id, doctor_id, scheduled_at, status, livekit_room_name)
  VALUES ('a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '6 days', 'confirmed', gen_random_uuid()::text)$$,
  'a patient books a confirmed appointment for themselves');
SELECT lives_ok($$INSERT INTO public.appointments (patient_id, doctor_id, scheduled_at, status, livekit_room_name)
  VALUES ('a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000004', now() + interval '7 days', 'pending', gen_random_uuid()::text)$$,
  'a patient books a pending appointment for themselves');
SELECT throws_ok($$INSERT INTO public.appointments (patient_id, doctor_id, scheduled_at, status, livekit_room_name)
  VALUES ('a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '8 days', 'completed', gen_random_uuid()::text)$$,
  '42501', NULL, 'a patient cannot book an appointment already completed');
SELECT throws_ok($$INSERT INTO public.appointments (patient_id, doctor_id, scheduled_at, status, livekit_room_name)
  VALUES ('a7a7a7a7-0000-0000-0000-000000000001', 'a7a7a7a7-0000-0000-0000-000000000002', now() + interval '9 days', 'confirmed', gen_random_uuid()::text)$$,
  '42501', NULL, 'a patient cannot book with someone who is not a doctor');

SELECT lives_ok($$UPDATE public.appointments SET status = 'cancelled' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b1'$$,
  'a patient cancels a confirmed appointment');
SELECT throws_ok($$UPDATE public.appointments SET status = 'completed' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b2'$$,
  '42501', NULL, 'a patient cannot mark an appointment completed');
SELECT throws_ok($$UPDATE public.appointments SET doctor_id = 'a7a7a7a7-0000-0000-0000-000000000004' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b2'$$,
  '42501', NULL, 'a patient cannot move an appointment to another doctor');
SELECT throws_ok($$UPDATE public.appointments SET scheduled_at = now() + interval '30 days' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b2'$$,
  '42501', NULL, 'a patient cannot reschedule an appointment');
SELECT throws_ok($$UPDATE public.appointments SET status = 'confirmed' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b3'$$,
  '42501', NULL, 'a patient cannot reopen a cancelled appointment');
SELECT throws_ok($$UPDATE public.appointments SET status = 'cancelled' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b5'$$,
  '42501', NULL, 'a patient cannot cancel an appointment in progress directly');
SELECT lives_ok($$SELECT public.cancel_patient_appointment('a7a7a7a7-0000-0000-0000-0000000000b6')$$,
  'the cancel_patient_appointment RPC still works for the patient');

SELECT throws_ok($$SELECT public.cancel_patient_appointment('a7a7a7a7-0000-0000-0000-0000000000b4')$$,
  'P0001', NULL, 'the cancel_patient_appointment RPC cannot cancel a completed appointment');

-- ===== Doctor =====
SELECT set_config('request.jwt.claims', '{"sub":"a7a7a7a7-0000-0000-0000-000000000003","role":"authenticated"}', true);

SELECT lives_ok($$UPDATE public.appointments SET notes = 'Paciente estable' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b5'$$,
  'a doctor saves notes');
SELECT lives_ok($$UPDATE public.appointments SET status = 'in_progress', consultation_metadata = '{"startedAt":"2026-11-22T10:00:00Z"}' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b2'$$,
  'a doctor starts a confirmed consultation');
SELECT lives_ok($$UPDATE public.appointments SET status = 'completed', consultation_metadata = '{"endedAt":"2026-11-22T10:30:00Z"}' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b2'$$,
  'a doctor completes a consultation in progress');
SELECT lives_ok($$UPDATE public.appointments SET status = 'cancelled' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b7'$$,
  'a doctor cancels a confirmed appointment');
SELECT throws_ok($$UPDATE public.appointments SET patient_id = 'a7a7a7a7-0000-0000-0000-000000000002' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b5'$$,
  '42501', NULL, 'a doctor cannot move an appointment to another patient');
SELECT throws_ok($$UPDATE public.appointments SET scheduled_at = now() + interval '40 days' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b5'$$,
  '42501', NULL, 'a doctor cannot reschedule an appointment');
SELECT throws_ok($$UPDATE public.appointments SET status = 'confirmed' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b4'$$,
  '42501', NULL, 'a doctor cannot reopen a completed appointment');
SELECT throws_ok($$INSERT INTO public.appointments (patient_id, doctor_id, scheduled_at, status, livekit_room_name)
  VALUES ('a7a7a7a7-0000-0000-0000-000000000002', 'a7a7a7a7-0000-0000-0000-000000000003', now() + interval '10 days', 'confirmed', gen_random_uuid()::text)$$,
  '42501', NULL, 'a doctor cannot create an appointment for a patient');

-- ===== Server roles are not restricted =====
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok($$UPDATE public.appointments SET scheduled_at = now() + interval '50 days', status = 'confirmed' WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b4'$$,
  'the service role can still change any appointment');
RESET ROLE;

SELECT is((SELECT status FROM public.appointments WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b1'), 'cancelled', 'the patient cancellation was stored');
SELECT is((SELECT status FROM public.appointments WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b2'), 'completed', 'the doctor completion was stored');
SELECT is((SELECT status FROM public.appointments WHERE id = 'a7a7a7a7-0000-0000-0000-0000000000b6'), 'cancelled', 'the RPC cancellation was stored');

SELECT * FROM finish();
ROLLBACK;
