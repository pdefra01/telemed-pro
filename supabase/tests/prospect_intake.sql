-- pgTAP tests for automatic prospect intake (odd/tasks/commercial-crm.md, S15-S18).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c6..01  admin          c6..02  advisor 1 (code INT-ONE)     c6..03  advisor 2 (code INT-TWO)
--   c6..11  affiliate created by an approved adhesion (P)       c6..12  second affiliate (P2)   c6..13  third affiliate (P3)
--   c6..a1..  adhesion requests     c6..e1.. lead survey responses     c6..f1.. manual prospects

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c6c6c6c6-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'int-admin@test.local', '', now(), now(), now(), '{"full_name":"Int Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c6c6c6c6-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'int-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Int Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c6c6c6c6-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'int-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Int Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c6c6c6c6-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'int-aff-1@test.local', '', now(), now(), now(), '{"full_name":"Int Affiliate 1"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c6c6c6c6-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'int-aff-2@test.local', '', now(), now(), now(), '{"full_name":"Int Affiliate 2"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c6c6c6c6-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'int-aff-3@test.local', '', now(), now(), now(), '{"full_name":"Int Affiliate 3"}', '{}');

UPDATE public.profiles SET promoter_code = 'INT-ONE' WHERE id = 'c6c6c6c6-0000-0000-0000-000000000002';
UPDATE public.profiles SET promoter_code = 'INT-TWO' WHERE id = 'c6c6c6c6-0000-0000-0000-000000000003';

-- ── Lead surveys (S16) ──────────────────────────────────────────────────────
INSERT INTO public.lead_survey_responses (id, promoter_code, full_name, whatsapp, pain_point, who_gets_sick_more, knew_remote_care,
  interested_in_easier_access, fair_monthly_value, consent_contact, created_at)
VALUES
  ('c6c6c6c6-0000-0000-0000-0000000000e1', 'INT-ONE', 'Lead Uno',   '+54 9 387 400-0001', 'pain one', 'kids', true,  true,  5000, true,  '2026-10-05 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000e2', 'INT-ONE', 'No Consent', '3874000002',         'pain two', 'kids', false, true,  5000, false, '2026-10-06 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000e3', 'INT-TWO', 'Lead Tres',  '3874000003',         'pain three', 'me', false, false, 4000, true,  '2026-10-07 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000e4', NULL,      'No Advisor', '3874000004',         'pain four', 'me', false, false, 4000, true,  '2026-10-08 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000e5', 'NOPE',    'Unknown',    '3874000005',         'pain five', 'me', false, false, 4000, true,  '2026-10-09 12:00+00');

-- ── Manual prospects that adhesions can convert (S17) ───────────────────────
INSERT INTO public.prospects (id, advisor_id, full_name, phone, email, status, created_at) VALUES
  ('c6c6c6c6-0000-0000-0000-0000000000f1', 'c6c6c6c6-0000-0000-0000-000000000002', 'Maria Phone',  '3875111222', NULL,                  'new',        '2026-09-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f2', 'c6c6c6c6-0000-0000-0000-000000000002', 'Maria Mail',   NULL,         'maria@test.local',    'contacted',  '2026-09-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f3', 'c6c6c6c6-0000-0000-0000-000000000002', 'Rejected One', '3875999999', NULL,                  'new',        '2026-09-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f4', 'c6c6c6c6-0000-0000-0000-000000000003', 'Other Advisor','3875111222', NULL,                  'new',        '2026-09-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f5', 'c6c6c6c6-0000-0000-0000-000000000002', 'Contacted',    '3870000005', NULL,                  'contacted',  '2026-09-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f6', 'c6c6c6c6-0000-0000-0000-000000000002', 'Lost',         '3870000006', NULL,                  'lost',       '2026-09-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f7', 'c6c6c6c6-0000-0000-0000-000000000002', 'Twin Early',   '3870000008', NULL,                  'new',        '2026-01-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f8', 'c6c6c6c6-0000-0000-0000-000000000002', 'Twin Late',    '3870000008', NULL,                  'new',        '2026-02-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000f9', 'c6c6c6c6-0000-0000-0000-000000000002', 'No Advisor Req','3870000009', NULL,                 'new',        '2026-09-01 12:00+00'),
  ('c6c6c6c6-0000-0000-0000-0000000000fa', 'c6c6c6c6-0000-0000-0000-000000000002', 'Short Phone',  '12345',      NULL,                  'new',        '2026-09-01 12:00+00');

-- ── Adhesion requests (owner role: exempt from the public-insert guards) ────
INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, approved_profile_id)
VALUES
  -- a1 pending, same advisor, phone matches Maria Phone (country code and separators differ)
  ('c6c6c6c6-0000-0000-0000-0000000000a1', 'A1', '92000001', '1990-01-01', 'x', 'x', 'x', 'a1@test.local',      '+54 9 387 511-1222', 'soltero', 'cash', 'sig', 'pending',  'INT-ONE', NULL),
  -- a2 approved, email matches Maria Mail (case differs)
  ('c6c6c6c6-0000-0000-0000-0000000000a2', 'A2', '92000002', '1990-01-01', 'x', 'x', 'x', 'MARIA@test.local',   '3879999990',         'soltero', 'cash', 'sig', 'approved', 'INT-ONE', 'c6c6c6c6-0000-0000-0000-000000000011'),
  -- a3 approved for the OTHER advisor with the same phone as Maria Phone (only one pending request per phone is allowed):
  -- it must convert the other advisor's prospect and never touch advisor 1's Maria Phone
  ('c6c6c6c6-0000-0000-0000-0000000000a3', 'A3', '92000003', '1990-01-01', 'x', 'x', 'x', 'a3@test.local',      '3875111222',         'soltero', 'cash', 'sig', 'approved', 'INT-TWO', 'c6c6c6c6-0000-0000-0000-000000000011'),
  -- a4 rejected: changes nothing
  ('c6c6c6c6-0000-0000-0000-0000000000a4', 'A4', '92000004', '1990-01-01', 'x', 'x', 'x', 'a4@test.local',      '3875999999',         'soltero', 'cash', 'sig', 'rejected', 'INT-ONE', NULL),
  -- a5 pending matches a contacted prospect; a6 pending matches a lost one (must stay lost)
  ('c6c6c6c6-0000-0000-0000-0000000000a5', 'A5', '92000005', '1990-01-01', 'x', 'x', 'x', 'a5@test.local',      '3870000005',         'soltero', 'cash', 'sig', 'pending',  'INT-ONE', NULL),
  ('c6c6c6c6-0000-0000-0000-0000000000a6', 'A6', '92000006', '1990-01-01', 'x', 'x', 'x', 'a6@test.local',      '3870000006',         'soltero', 'cash', 'sig', 'pending',  'INT-ONE', NULL),
  -- a8 approved matches two prospects with the same phone: only the earliest converts
  ('c6c6c6c6-0000-0000-0000-0000000000a8', 'A8', '92000008', '1990-01-01', 'x', 'x', 'x', 'a8@test.local',      '3870000008',         'soltero', 'cash', 'sig', 'approved', 'INT-ONE', 'c6c6c6c6-0000-0000-0000-000000000012'),
  -- a9 has no advisor code; a10 has a too-short phone: neither may match
  ('c6c6c6c6-0000-0000-0000-0000000000a9', 'A9', '92000009', '1990-01-01', 'x', 'x', 'x', 'a9@test.local',      '3870000009',         'soltero', 'cash', 'sig', 'pending',  NULL,      NULL),
  ('c6c6c6c6-0000-0000-0000-0000000000aa', 'A10','92000010', '1990-01-01', 'x', 'x', 'x', 'a10@test.local',     '12345',              'soltero', 'cash', 'sig', 'pending',  'INT-ONE', NULL);

-- ── First run ───────────────────────────────────────────────────────────────
SELECT results_eq($$SELECT prospects_created::int, prospects_interested::int, prospects_converted::int FROM public.sync_prospects_intake()$$,
  $$VALUES (2, 2, 3)$$, 'first run: 2 survey prospects created, 2 prospects moved to interested, 3 converted');

SELECT results_eq($$
  SELECT advisor_id::text, full_name, phone, status, source, created_at, notes LIKE '%pain one%'
    FROM public.prospects WHERE full_name = 'Lead Uno'$$,
  $$VALUES ('c6c6c6c6-0000-0000-0000-000000000002', 'Lead Uno', '+54 9 387 400-0001', 'new', 'lead_survey', '2026-10-05 12:00+00'::timestamptz, true)$$,
  'a consenting survey lead becomes a new prospect of its advisor, with the survey date and an answers summary');
SELECT is((SELECT advisor_id::text FROM public.prospects WHERE full_name = 'Lead Tres'), 'c6c6c6c6-0000-0000-0000-000000000003',
  'the second advisor gets their own lead');
SELECT is((SELECT count(*)::int FROM public.prospects WHERE source = 'lead_survey'), 2,
  'no prospect for a lead without consent, without an advisor code or with an unknown one');

-- ── Conversions (S17) ───────────────────────────────────────────────────────
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f1'), 'interested',
  'a pending adhesion from the same phone makes the prospect interested');
SELECT results_eq($$SELECT status, converted_profile_id::text FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f2'$$,
  $$VALUES ('affiliated', 'c6c6c6c6-0000-0000-0000-000000000011')$$,
  'an approved adhesion matching by email (any case) converts the prospect and links the new profile');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f3'), 'new', 'a rejected adhesion changes nothing');
SELECT results_eq($$SELECT status, converted_profile_id::text FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f4'$$,
  $$VALUES ('affiliated', 'c6c6c6c6-0000-0000-0000-000000000011')$$,
  'the other advisor''s prospect is converted by the other advisor''s adhesion, and advisor 1''s prospect with the same phone is not (it stays interested above)');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f5'), 'interested', 'a contacted prospect becomes interested');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f6'), 'lost', 'a pending adhesion does not revive a lost prospect');
SELECT results_eq($$SELECT status, converted_profile_id::text FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f7'$$,
  $$VALUES ('affiliated', 'c6c6c6c6-0000-0000-0000-000000000012')$$, 'one request converts the earliest of two matching prospects');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f8'), 'new', 'and leaves the later one alone');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f9'), 'new', 'a request with no advisor code matches nothing');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000fa'), 'new', 'a phone with too few digits never matches');

-- ── Idempotency and a request that gets approved later ──────────────────────
SELECT results_eq($$SELECT prospects_created::int, prospects_interested::int, prospects_converted::int FROM public.sync_prospects_intake()$$,
  $$VALUES (0, 0, 0)$$, 'running again changes nothing');

UPDATE public.adhesion_requests SET status = 'approved', approved_profile_id = 'c6c6c6c6-0000-0000-0000-000000000013' WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000a1';
SELECT results_eq($$SELECT prospects_created::int, prospects_interested::int, prospects_converted::int FROM public.sync_prospects_intake()$$,
  $$VALUES (0, 0, 1)$$, 'a pending request that is later approved converts its prospect');
SELECT results_eq($$SELECT status, converted_profile_id::text FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f1'$$,
  $$VALUES ('affiliated', 'c6c6c6c6-0000-0000-0000-000000000013')$$, 'the interested prospect is now affiliated, linked to the profile');

-- ── An affiliated prospect is never downgraded, a deleted automatic prospect is not recreated ──
INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id)
VALUES ('c6c6c6c6-0000-0000-0000-0000000000ab', 'A11', '92000011', '1990-01-01', 'x', 'x', 'x', 'maria@test.local', '3875111222', 'soltero', 'cash', 'sig', 'pending', 'INT-ONE');
SELECT lives_ok($$SELECT * FROM public.sync_prospects_intake()$$, 'a later request matching only affiliated prospects is harmless');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f1'), 'affiliated', 'an affiliated prospect is never downgraded');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c6c6c6c6-0000-0000-0000-0000000000f2'), 'affiliated', 'not even by a pending request with the same email');

-- ── Who sees the automatic prospects (existing RLS) ─────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c6c6c6c6-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT results_eq($$SELECT full_name FROM public.prospects WHERE source = 'lead_survey'$$, $$VALUES ('Lead Uno')$$,
  'an advisor sees only their own survey prospect');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c6c6c6c6-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT results_eq($$SELECT full_name FROM public.prospects WHERE source = 'lead_survey'$$, $$VALUES ('Lead Tres')$$,
  'and the other advisor only theirs');
RESET ROLE;

-- ── A deleted automatic prospect is not recreated ───────────────────────────
DELETE FROM public.prospects WHERE full_name = 'Lead Uno';
SELECT results_eq($$SELECT prospects_created::int FROM public.sync_prospects_intake()$$, $$VALUES (0)$$,
  'the intake log remembers processed surveys');
SELECT is((SELECT count(*)::int FROM public.prospects WHERE full_name = 'Lead Uno'), 0, 'so the advisor''s deletion sticks');

-- ── Privileges: only the server (service role) can run the intake ───────────
SELECT is(has_function_privilege('authenticated', 'public.sync_prospects_intake()', 'execute'), false, 'signed-in users cannot run the intake');
SELECT is(has_function_privilege('anon', 'public.sync_prospects_intake()', 'execute'), false, 'anonymous callers cannot run the intake');
SELECT is(has_function_privilege('service_role', 'public.sync_prospects_intake()', 'execute'), true, 'the service role can');
SELECT is(has_table_privilege('authenticated', 'public.prospect_intake_log', 'SELECT'), false, 'API roles cannot read the intake log');
SELECT is(has_table_privilege('anon', 'public.prospect_intake_log', 'INSERT'), false, 'nor write it');

SELECT * FROM finish();
ROLLBACK;
