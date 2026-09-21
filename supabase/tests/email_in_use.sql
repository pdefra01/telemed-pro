-- pgTAP tests for 20260921010000_email_in_use.sql. Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'Taken.User@Test.local', '', now(), now(), now());

SELECT has_function('public', 'email_in_use', ARRAY['text'], 'email_in_use exists');
SELECT is(public.email_in_use('taken.user@test.local'), true, 'matches case-insensitively');
SELECT is(public.email_in_use('  TAKEN.USER@test.local '), true, 'trims and ignores case');
SELECT is(public.email_in_use('free@test.local'), false, 'unknown email is free');
SELECT is(public.email_in_use(NULL), false, 'NULL is never in use');

SELECT ok(has_function_privilege('service_role', 'public.email_in_use(text)', 'EXECUTE'), 'service_role can execute');
SELECT ok(NOT has_function_privilege('anon', 'public.email_in_use(text)', 'EXECUTE'), 'anon cannot execute');
SELECT ok(NOT has_function_privilege('authenticated', 'public.email_in_use(text)', 'EXECUTE'), 'authenticated cannot execute');

SELECT * FROM finish();
ROLLBACK;
