-- pgTAP tests for 20260925000000_lock_down_contact_verifications.sql
-- (odd/adhesion-auto-activation). Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

-- Fixtures (owner role = service-role equivalent): one logged-in user and one
-- server-issued guest challenge (user_id NULL, as /api/email-verification/send writes it).
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cv-user@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0c0c0c0-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cv-other@test.local', '', now(), now(), now());

INSERT INTO public.profiles (id, role, full_name)
VALUES
  ('c0c0c0c0-0000-0000-0000-000000000001', 'patient', 'CV User'),
  ('c0c0c0c0-0000-0000-0000-000000000002', 'patient', 'CV Other')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

INSERT INTO public.contact_verifications (id, user_id, channel, contact_value, otp_code)
VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', NULL, 'email', 'guest@example.com', '123456'),
  ('c1c1c1c1-0000-0000-0000-000000000002', 'c0c0c0c0-0000-0000-0000-000000000002', 'email', 'other@example.com', '654321');

-- Policies: no public policy survives.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_verifications' AND policyname LIKE 'Public %'),
  0, 'no "Public ..." policy remains on contact_verifications');

-- anon has no privileges at all.
SELECT ok(NOT has_table_privilege('anon', 'public.contact_verifications', 'SELECT'), 'anon cannot SELECT');
SELECT ok(NOT has_table_privilege('anon', 'public.contact_verifications', 'INSERT'), 'anon cannot INSERT');
SELECT ok(NOT has_table_privilege('anon', 'public.contact_verifications', 'UPDATE'), 'anon cannot UPDATE');
SELECT ok(NOT has_table_privilege('anon', 'public.contact_verifications', 'DELETE'), 'anon cannot DELETE');

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO public.contact_verifications (channel, contact_value, otp_code, verified_at)
    VALUES ('email', 'victim@example.com', '000000', now())$$,
  '42501', NULL, 'anon cannot insert a pre-verified challenge');
SELECT throws_ok(
  $$SELECT otp_code FROM public.contact_verifications$$,
  '42501', NULL, 'anon cannot read OTP codes');
RESET ROLE;

-- authenticated: own rows only, never pre-verified, never guest (user_id NULL) rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0c0c0c0-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO public.contact_verifications (id, user_id, channel, contact_value, otp_code)
    VALUES ('c1c1c1c1-0000-0000-0000-000000000003', 'c0c0c0c0-0000-0000-0000-000000000001', 'email', 'me@example.com', '111111')$$,
  'authenticated can insert an unverified challenge for itself');
SELECT throws_ok(
  $$INSERT INTO public.contact_verifications (user_id, channel, contact_value, otp_code, verified_at)
    VALUES ('c0c0c0c0-0000-0000-0000-000000000001', 'email', 'victim@example.com', '000000', now())$$,
  '42501', NULL, 'authenticated cannot insert a pre-verified challenge');
SELECT throws_ok(
  $$INSERT INTO public.contact_verifications (user_id, channel, contact_value, otp_code)
    VALUES (NULL, 'email', 'victim@example.com', '000000')$$,
  '42501', NULL, 'authenticated cannot insert a guest (user_id NULL) challenge');
SELECT throws_ok(
  $$INSERT INTO public.contact_verifications (user_id, channel, contact_value, otp_code)
    VALUES ('c0c0c0c0-0000-0000-0000-000000000002', 'email', 'victim@example.com', '000000')$$,
  '42501', NULL, 'authenticated cannot insert a challenge for another user');

SELECT is(
  (SELECT count(*)::int FROM public.contact_verifications),
  1, 'authenticated only sees its own challenges (no guest or foreign rows)');

UPDATE public.contact_verifications SET verified_at = now() WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$UPDATE public.contact_verifications SET user_id = NULL WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003'$$,
  '42501', NULL, 'authenticated cannot move its challenge into the guest namespace');
RESET ROLE;

SELECT ok(
  (SELECT verified_at IS NULL FROM public.contact_verifications WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  'authenticated cannot verify a guest challenge');

SELECT * FROM finish();
ROLLBACK;
