-- pgTAP tests: a cancelled affiliate loses access on the server (migration 20261122020000).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   d5..01  affiliate whose cancellation is due
--   d5..02  affiliate whose cancellation is scheduled in the future
--   d5..03  affiliate without a cancellation
--   d5..a1..a3  sessions of 01..03

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', ('d5d5d5d5-0000-0000-0000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'revoke-' || n || '@test.local', '', now(), now(), now(), ('{"full_name":"Revoke ' || n || '"}')::jsonb, '{}'::jsonb
  FROM generate_series(1, 3) AS n;

UPDATE public.profiles SET role = 'patient', is_active = true, plan_status = 'active'
 WHERE id IN ('d5d5d5d5-0000-0000-0000-000000000001', 'd5d5d5d5-0000-0000-0000-000000000002', 'd5d5d5d5-0000-0000-0000-000000000003');

INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
SELECT ('d5d5d5d5-0000-0000-0000-0000000000a' || n)::uuid, ('d5d5d5d5-0000-0000-0000-00000000000' || n)::uuid, now(), now()
  FROM generate_series(1, 3) AS n;

INSERT INTO auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, session_id)
SELECT '00000000-0000-0000-0000-000000000000', 'revoke-rt-' || n, 'd5d5d5d5-0000-0000-0000-00000000000' || n, false, now(), now(),
       ('d5d5d5d5-0000-0000-0000-0000000000a' || n)::uuid
  FROM generate_series(1, 3) AS n;

INSERT INTO public.affiliate_cancellations (profile_id, titular_id, requested_at, effective_at) VALUES
  ('d5d5d5d5-0000-0000-0000-000000000001', 'd5d5d5d5-0000-0000-0000-000000000001', now() - interval '2 days', now() - interval '1 minute'),
  ('d5d5d5d5-0000-0000-0000-000000000002', 'd5d5d5d5-0000-0000-0000-000000000002', now(), now() + interval '10 days');

-- ── The sweep applies the due cancellation and ends its access ──────────────
SELECT ok(public.apply_due_affiliate_cancellations() >= 1, 'the sweep applies the due cancellation');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'd5d5d5d5-0000-0000-0000-000000000001'), 'cancelled',
  'the profile is cancelled as before');
SELECT ok((SELECT banned_until FROM auth.users WHERE id = 'd5d5d5d5-0000-0000-0000-000000000001') > now() + interval '99 years',
  'the cancelled affiliate is banned in Supabase Auth (100 years, a finite date GoTrue can read)');
SELECT is((SELECT count(*)::int FROM auth.sessions WHERE user_id = 'd5d5d5d5-0000-0000-0000-000000000001'), 0,
  'the cancelled affiliate sessions are deleted');
SELECT is((SELECT count(*)::int FROM auth.refresh_tokens WHERE user_id = 'd5d5d5d5-0000-0000-0000-000000000001'), 0,
  'and their refresh tokens with them');

-- ── A scheduled cancellation and other users are untouched ──────────────────
SELECT is((SELECT banned_until FROM auth.users WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002'), NULL,
  'a cancellation not yet effective does not ban');
SELECT is((SELECT count(*)::int FROM auth.sessions WHERE user_id = 'd5d5d5d5-0000-0000-0000-000000000002'), 1,
  'nor delete its sessions');
SELECT is((SELECT count(*)::int FROM auth.sessions WHERE user_id = 'd5d5d5d5-0000-0000-0000-000000000003'), 1,
  'an affiliate without cancellation keeps the session');
SELECT is((SELECT count(*)::int FROM auth.refresh_tokens WHERE user_id = 'd5d5d5d5-0000-0000-0000-000000000003'), 1,
  'and the refresh token');

-- ── When the scheduled date arrives, the next sweep ends that access too ────
UPDATE public.affiliate_cancellations SET effective_at = now() - interval '1 second'
 WHERE profile_id = 'd5d5d5d5-0000-0000-0000-000000000002';
SELECT is(public.apply_due_affiliate_cancellations(), 1, 'the next sweep applies only the newly due cancellation');
SELECT ok((SELECT banned_until FROM auth.users WHERE id = 'd5d5d5d5-0000-0000-0000-000000000002') > now() + interval '99 years',
  'and bans that affiliate');
SELECT is((SELECT count(*)::int FROM auth.sessions WHERE user_id = 'd5d5d5d5-0000-0000-0000-000000000002'), 0,
  'and deletes their sessions');
SELECT is(public.apply_due_affiliate_cancellations(), 0, 'a sweep with nothing due changes nothing');

-- ── Taking a profile out of cancelled lifts the ban ─────────────────────────
UPDATE public.profiles SET plan_status = 'active', is_active = true WHERE id = 'd5d5d5d5-0000-0000-0000-000000000001';
SELECT is((SELECT banned_until FROM auth.users WHERE id = 'd5d5d5d5-0000-0000-0000-000000000001'), NULL,
  'reactivating the plan lifts the ban');

UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = 'd5d5d5d5-0000-0000-0000-000000000003';
UPDATE public.profiles SET plan_status = 'suspended' WHERE id = 'd5d5d5d5-0000-0000-0000-000000000003';
SELECT isnt((SELECT banned_until FROM auth.users WHERE id = 'd5d5d5d5-0000-0000-0000-000000000003'), NULL,
  'other plan changes do not touch a ban');

-- ── Privileges ──────────────────────────────────────────────────────────────
SELECT ok(NOT has_function_privilege('authenticated', 'public.revoke_cancelled_affiliate_access(uuid[])', 'EXECUTE'),
  'an API user cannot ban or revoke sessions');
SELECT ok(NOT has_function_privilege('anon', 'public.revoke_cancelled_affiliate_access(uuid[])', 'EXECUTE'),
  'an anonymous caller cannot ban or revoke sessions');
SELECT ok(NOT has_function_privilege('authenticated', 'public.apply_due_affiliate_cancellations()', 'EXECUTE'),
  'an API user still cannot run the sweep');

SELECT * FROM finish();
ROLLBACK;
