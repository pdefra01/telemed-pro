-- pgTAP tests for the CRM follow-ups (odd/tasks/commercial-crm-followups.md, S1).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c9..01  admin
--   c9..02  supervisor
--   c9..03  advisor (on the supervisor's team)
--   c9..11  affiliate profile used as a conversion target
--   c9..a1  prospect of the advisor

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'fu-admin@test.local', '', now(), now(), now(), '{"full_name":"Fu Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'fu-sup@test.local', '', now(), now(), now(), '{"full_name":"Fu Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'fu-adv@test.local', '', now(), now(), now(), '{"full_name":"Fu Advisor"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'c9c9c9c9-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'fu-aff@test.local', '', now(), now(), now(), '{"full_name":"Fu Affiliate"}', '{}');

UPDATE public.profiles SET supervisor_id = 'c9c9c9c9-0000-0000-0000-000000000002'
 WHERE id = 'c9c9c9c9-0000-0000-0000-000000000003';

INSERT INTO public.prospects (id, advisor_id, full_name) VALUES
  ('c9c9c9c9-0000-0000-0000-0000000000a1', 'c9c9c9c9-0000-0000-0000-000000000003', 'Followup Prospect');

-- ── S1: the system-set columns are not writable through the API ─────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000003","role":"authenticated"}', true);

SELECT lives_ok($$INSERT INTO public.prospects (advisor_id, full_name, phone, email, notes, status, last_contact_at)
                  VALUES ('c9c9c9c9-0000-0000-0000-000000000003', 'Editable Columns', '1122334455', 'a@b.c', 'n', 'contacted', now())$$,
  'an advisor still creates a prospect with every editable column');
SELECT lives_ok($$UPDATE public.prospects SET full_name = 'Renamed', phone = '1199887766', email = 'x@y.z', notes = 'edited',
                         status = 'interested', last_contact_at = now()
                   WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  'an advisor still edits every editable column');

SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name, source) VALUES ('c9c9c9c9-0000-0000-0000-000000000003', 'Forged', 'lead_survey')$$,
  '42501', NULL, 'an advisor cannot forge the source of a prospect');
SELECT throws_ok($$INSERT INTO public.prospects (advisor_id, full_name, created_at) VALUES ('c9c9c9c9-0000-0000-0000-000000000003', 'Backdated', now() - interval '1 year')$$,
  '42501', NULL, 'an advisor cannot backdate a prospect');
SELECT throws_ok($$UPDATE public.prospects SET converted_profile_id = 'c9c9c9c9-0000-0000-0000-000000000011' WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  '42501', NULL, 'an advisor cannot set the converted affiliate');
SELECT throws_ok($$UPDATE public.prospects SET status_changed_at = now() + interval '1 year' WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  '42501', NULL, 'an advisor cannot set the status change stamp');
SELECT throws_ok($$UPDATE public.prospects SET source = 'adhesion' WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  '42501', NULL, 'an advisor cannot change the source');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT throws_ok($$UPDATE public.prospects SET converted_profile_id = 'c9c9c9c9-0000-0000-0000-000000000011' WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  '42501', NULL, 'a supervisor cannot set the converted affiliate');
SELECT lives_ok($$UPDATE public.prospects SET status = 'contacted' WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  'a supervisor still edits the status of a team prospect');
RESET ROLE;

SELECT results_eq($$SELECT source, converted_profile_id IS NULL, status_changed_at <= now() FROM public.prospects WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  $$VALUES ('manual'::text, true, true)$$, 'the system-set columns kept their values');

-- the automatic intake (service role) still writes them
SET LOCAL ROLE service_role;
SELECT lives_ok($$UPDATE public.prospects SET status = 'affiliated', converted_profile_id = 'c9c9c9c9-0000-0000-0000-000000000011' WHERE id = 'c9c9c9c9-0000-0000-0000-0000000000a1'$$,
  'the service role still records a conversion');
RESET ROLE;

-- ── S3: a collection action carries its author's name ───────────────────────
INSERT INTO public.producers (id, name, producer_code, email, commission_rate, status, links_shared_count)
VALUES ('c9c9c9c9-0000-0000-0000-000000000003', 'Fu Advisor', 'FU-ADV', 'fu-adv@test.local', 10, 'active', 0);
UPDATE public.profiles SET producer_id = 'c9c9c9c9-0000-0000-0000-000000000003' WHERE id = 'c9c9c9c9-0000-0000-0000-000000000011';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT lives_ok($$INSERT INTO public.collection_actions (affiliate_id, action_type, note, created_by_name)
                  VALUES ('c9c9c9c9-0000-0000-0000-000000000011', 'note', 'by the supervisor', 'Someone Else')$$,
  'a supervisor logs a collection action');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = 'c9c9c9c9-0000-0000-0000-000000000002'), 0,
  'the advisor cannot read the supervisor profile');
SELECT results_eq($$SELECT created_by_name FROM public.collection_actions WHERE affiliate_id = 'c9c9c9c9-0000-0000-0000-000000000011'$$,
  $$VALUES ('Fu Supervisor'::text)$$, 'the advisor still sees the supervisor as the author, not a forged name');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
