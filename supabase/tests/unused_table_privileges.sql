-- pgTAP tests for the revoked unused table privileges (odd/tasks/revoke-unused-table-privileges.md, S1-S3).
-- Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

-- ── S1: no public table grants TRUNCATE, REFERENCES or TRIGGER to the API roles ──
SELECT is(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0::bigint,
  'anon and authenticated hold no TRUNCATE, REFERENCES or TRIGGER on public tables');

-- ── S2: a table created later does not get them either ──────────────────────
CREATE TABLE public.zz_privilege_probe (id int);
SELECT is(has_table_privilege('anon', 'public.zz_privilege_probe', 'TRUNCATE'), false, 'a new table: anon has no TRUNCATE');
SELECT is(has_table_privilege('authenticated', 'public.zz_privilege_probe', 'TRUNCATE'), false, 'a new table: authenticated has no TRUNCATE');
SELECT is(has_table_privilege('authenticated', 'public.zz_privilege_probe', 'TRIGGER'), false, 'a new table: authenticated has no TRIGGER');
SELECT is(has_table_privilege('authenticated', 'public.zz_privilege_probe', 'REFERENCES'), false, 'a new table: authenticated has no REFERENCES');

-- ── S3: the data privileges are untouched ───────────────────────────────────
SELECT is(has_table_privilege('authenticated', 'public.system_settings', 'SELECT'), true, 'authenticated keeps SELECT on system_settings');
SELECT is(has_table_privilege('authenticated', 'public.system_settings', 'UPDATE'), true, 'authenticated keeps UPDATE on system_settings (RLS decides)');
SELECT is(has_table_privilege('anon', 'public.adhesion_requests', 'INSERT'), true, 'anon keeps INSERT on adhesion_requests (public sign-up form)');
SELECT is(has_table_privilege('authenticated', 'public.prospects', 'SELECT'), true, 'authenticated keeps SELECT on prospects');
SELECT is(has_table_privilege('service_role', 'public.system_settings', 'TRUNCATE'), true, 'service_role is untouched');
SELECT is(has_table_privilege('authenticated', 'public.zz_privilege_probe', 'SELECT'), true, 'a new table still gets the default SELECT for authenticated');

SELECT * FROM finish();
ROLLBACK;
