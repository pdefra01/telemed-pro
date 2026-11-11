-- pgTAP tests for the CRM review fixes (odd/tasks/commercial-crm-commissions.md, S6).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c7..01  supervisor (role supervisor)          c7..02  advisor 1 (code REV-ONE, on c7..01's team)
--   c7..03  former supervisor (role patient)      c7..04  advisor 2 (code REV-TWO, stale supervisor_id -> c7..03)
--   c7..11/12/13  ledger entities for confirmed_affiliate_ids
--   c7..d1..  prospects     c7..a1..  adhesion requests     c7..e1  lead survey

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c7c7c7c7-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rev-sup@test.local', '', now(), now(), now(), '{"full_name":"Rev Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c7c7c7c7-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rev-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Rev Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c7c7c7c7-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rev-former@test.local', '', now(), now(), now(), '{"full_name":"Rev Former Supervisor"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c7c7c7c7-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'rev-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Rev Advisor Two"}', '{"role":"advisor"}');

UPDATE public.profiles SET promoter_code = 'REV-ONE', supervisor_id = 'c7c7c7c7-0000-0000-0000-000000000001' WHERE id = 'c7c7c7c7-0000-0000-0000-000000000002';
UPDATE public.profiles SET promoter_code = 'REV-TWO' WHERE id = 'c7c7c7c7-0000-0000-0000-000000000004';

-- ── S6.3: status_changed_at tracks the last STATUS change only ──────────────
INSERT INTO public.prospects (id, advisor_id, full_name, phone, status, created_at) VALUES
  ('c7c7c7c7-0000-0000-0000-0000000000d1', 'c7c7c7c7-0000-0000-0000-000000000002', 'Contact Logged', '3881000001', 'contacted',  now() - interval '40 days'),
  ('c7c7c7c7-0000-0000-0000-0000000000d2', 'c7c7c7c7-0000-0000-0000-000000000002', 'Status Reset',   '3881000002', 'interested', now() - interval '40 days'),
  ('c7c7c7c7-0000-0000-0000-0000000000d3', 'c7c7c7c7-0000-0000-0000-000000000002', 'Late Request',   '3881000003', 'new',        now() - interval '40 days');

SELECT is((SELECT status_changed_at FROM public.prospects WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d1'), NULL::timestamptz,
  'a new prospect has no status change yet');

-- "Registrar contacto": notes and last contact change, the status does not
UPDATE public.prospects SET last_contact_at = now(), notes = 'Llamado' WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d1';
SELECT is((SELECT status_changed_at FROM public.prospects WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d1'), NULL::timestamptz,
  'registering a contact does not count as a status change');

-- The advisor resets an interested prospect
UPDATE public.prospects SET status = 'new' WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d2';
SELECT is((SELECT status_changed_at FROM public.prospects WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d2'), now(),
  'a status change stamps status_changed_at');

-- ── S6.8: backdated survey; S6.3: the new prospect advances in the same run ─
INSERT INTO public.lead_survey_responses (id, promoter_code, full_name, whatsapp, pain_point, who_gets_sick_more, knew_remote_care,
  interested_in_easier_access, fair_monthly_value, consent_contact, created_at)
VALUES ('c7c7c7c7-0000-0000-0000-0000000000e1', 'REV-ONE', 'Backdated Lead', '3881000009', 'x', 'me', false, true, 5000, true, '2020-01-01 12:00+00');

INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, created_at)
VALUES
  -- matches the prospect the survey creates in this same run
  ('c7c7c7c7-0000-0000-0000-0000000000a1', 'R1', '93100001', '1990-01-01', 'x', 'x', 'x', 'r1@test.local', '3881000009', 'soltero', 'cash', 'sig', 'pending', 'REV-ONE', now() - interval '1 hour'),
  -- matches the prospect whose contact was registered after this request
  ('c7c7c7c7-0000-0000-0000-0000000000a2', 'R2', '93100002', '1990-01-01', 'x', 'x', 'x', 'r2@test.local', '3881000001', 'soltero', 'cash', 'sig', 'pending', 'REV-ONE', now() - interval '1 day'),
  -- matches the prospect whose status the advisor reset after this request
  ('c7c7c7c7-0000-0000-0000-0000000000a3', 'R3', '93100003', '1990-01-01', 'x', 'x', 'x', 'r3@test.local', '3881000002', 'soltero', 'cash', 'sig', 'pending', 'REV-ONE', now() - interval '1 day');

SELECT results_eq($$SELECT prospects_created::int, prospects_interested::int, prospects_converted::int FROM public.sync_prospects_intake()$$,
  $$VALUES (1, 2, 0)$$, 'one survey prospect created; it and the contacted prospect advance, the reset one does not');

SELECT is((SELECT created_at FROM public.prospects WHERE full_name = 'Backdated Lead'), now(),
  'a survey prospect is dated when it enters the CRM, not with the client-settable survey date');
SELECT is((SELECT status FROM public.prospects WHERE full_name = 'Backdated Lead'), 'interested',
  'a prospect just created by the intake advances with a pending request in the same run');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d1'), 'interested',
  'registering a contact after the request does not block the advance');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d2'), 'new',
  'a status reset by the advisor after the request is not overruled');

SELECT results_eq($$SELECT source, source_ref::text, outcome FROM public.prospect_intake_log
                     WHERE source LIKE 'adhesion%' ORDER BY source_ref::text$$,
  $$VALUES ('adhesion_pending', 'c7c7c7c7-0000-0000-0000-0000000000a1', 'processed'),
           ('adhesion_pending', 'c7c7c7c7-0000-0000-0000-0000000000a2', 'processed'),
           ('adhesion_pending', 'c7c7c7c7-0000-0000-0000-0000000000a3', 'processed')$$,
  'every handled pending request is logged, matched or not');

-- ── S6.2: already handled requests never starve a new one ───────────────────
INSERT INTO public.adhesion_requests (titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, created_at)
SELECT 'Bulk ' || n, '94' || lpad(n::text, 6, '0'), '1990-01-01', 'x', 'x', 'x', 'bulk' || n || '@test.local', '39' || lpad(n::text, 8, '0'),
       'soltero', 'cash', 'sig', 'pending', 'REV-ONE', now() - interval '80 days' + (n || ' seconds')::interval
  FROM generate_series(1, 600) AS n;

INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, created_at)
VALUES ('c7c7c7c7-0000-0000-0000-0000000000a4', 'R4', '93100004', '1990-01-01', 'x', 'x', 'x', 'r4@test.local', '3881000003', 'soltero', 'cash', 'sig', 'pending', 'REV-ONE', now() - interval '1 minute');

SELECT results_eq($$SELECT prospects_interested::int FROM public.sync_prospects_intake()$$, $$VALUES (0)$$,
  'the first run handles the 500 oldest unhandled requests');
SELECT is((SELECT count(*)::int FROM public.prospect_intake_log WHERE source = 'adhesion_pending'), 503,
  'and logs them');
SELECT results_eq($$SELECT prospects_interested::int FROM public.sync_prospects_intake()$$, $$VALUES (1)$$,
  'the next run skips the handled ones and reaches the new request');
SELECT is((SELECT status FROM public.prospects WHERE id = 'c7c7c7c7-0000-0000-0000-0000000000d3'), 'interested',
  'so the new request advances its prospect');

-- ── S6.5: no statement_timeout promise on the function ──────────────────────
SELECT is((SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE oid = 'public.sync_prospects_intake()'::regprocedure), 'search_path=public',
  'sync_prospects_intake keeps only its search_path setting (no statement_timeout)');

-- ── Consistency: metrics scope the team with is_supervisor_of() ─────────────
-- (owner role writes a stale pointer directly, bypassing the validation and release triggers)
ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET supervisor_id = 'c7c7c7c7-0000-0000-0000-000000000003' WHERE id = 'c7c7c7c7-0000-0000-0000-000000000004';
ALTER TABLE public.profiles ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c7c7c7c7-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_monthly_metrics('2026-11-01', now())), 0,
  'a stale supervisor_id without the supervisor role gets no metrics');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c7c7c7c7-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisor_id::text FROM public.advisor_monthly_metrics('2026-11-01', now())$$,
  $$VALUES ('c7c7c7c7-0000-0000-0000-000000000002')$$, 'a real supervisor still gets their team');
RESET ROLE;

SELECT is(has_function_privilege('anon', 'public.advisor_monthly_metrics(date, timestamptz)', 'execute'), false, 'anonymous callers cannot read metrics');
SELECT is(has_function_privilege('authenticated', 'public.advisor_monthly_metrics(date, timestamptz)', 'execute'), true, 'signed-in users can');
SELECT is(has_function_privilege('service_role', 'public.advisor_monthly_metrics(date, timestamptz)', 'execute'), true, 'and the service role');

-- ── S6.4: confirmed_affiliate_ids returns each confirmed id once ────────────
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'c7c7c7c7-0000-0000-0000-000000000011', 'payment', 1000, '2026-10-16 12:00+00'),
  ('affiliate', 'c7c7c7c7-0000-0000-0000-000000000011', 'payment', 1000, '2026-11-16 12:00+00'),
  ('affiliate', 'c7c7c7c7-0000-0000-0000-000000000012', 'charge',  1000, '2026-10-16 12:00+00'),
  ('affiliate', 'c7c7c7c7-0000-0000-0000-000000000013', 'payment', 0,    '2026-10-16 12:00+00');

SELECT results_eq($$SELECT id::text FROM public.confirmed_affiliate_ids(ARRAY[
    'c7c7c7c7-0000-0000-0000-000000000011', 'c7c7c7c7-0000-0000-0000-000000000012',
    'c7c7c7c7-0000-0000-0000-000000000013', 'c7c7c7c7-0000-0000-0000-000000000099']::uuid[]) AS t(id)$$,
  $$VALUES ('c7c7c7c7-0000-0000-0000-000000000011')$$,
  'only ids with a positive payment are returned, once each');
SELECT is((SELECT count(*)::int FROM public.confirmed_affiliate_ids('{}'::uuid[])), 0, 'an empty list returns nothing');
SELECT is(has_function_privilege('service_role', 'public.confirmed_affiliate_ids(uuid[])', 'execute'), true, 'the server can call confirmed_affiliate_ids');
SELECT is(has_function_privilege('authenticated', 'public.confirmed_affiliate_ids(uuid[])', 'execute'), false, 'signed-in users cannot');
SELECT is(has_function_privilege('anon', 'public.confirmed_affiliate_ids(uuid[])', 'execute'), false, 'anonymous callers cannot');

-- ── S6.1: the session policy covers supervisors ─────────────────────────────
SELECT results_eq($$SELECT (value->'supervisor'->>'timeoutMinutes')::int, (value->'supervisor'->>'persistent')::boolean
                      FROM public.system_settings WHERE key = 'session_security_policy'$$,
  $$VALUES (15, false)$$, 'supervisors get a 15-minute inactivity timeout and a non-persistent session');
SELECT ok((SELECT value ?& ARRAY['admin', 'doctor', 'advisor', 'patient'] FROM public.system_settings WHERE key = 'session_security_policy'),
  'the other roles of the policy are kept');

SELECT * FROM finish();
ROLLBACK;
