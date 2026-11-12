-- pgTAP tests for the commission visibility switch (odd/tasks/commission-visibility-toggle.md, S3, S4).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   cb..01  admin
--   cb..02  supervisor
--   cb..03  advisor (on the supervisor's team)
--   cb..11  affiliate profile of the sale
--   cb..b1  adhesion request id of the commission (no FK)
--   cb..c1  commission of the advisor
--   cb..d1  liquidation of the advisor

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'cbcbcbcb-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cv-admin@test.local', '', now(), now(), now(), '{"full_name":"Cv Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'cbcbcbcb-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cv-sup@test.local', '', now(), now(), now(), '{"full_name":"Cv Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'cbcbcbcb-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cv-adv@test.local', '', now(), now(), now(), '{"full_name":"Cv Advisor"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'cbcbcbcb-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'cv-aff@test.local', '', now(), now(), now(), '{"full_name":"Cv Affiliate"}', '{}');

UPDATE public.profiles SET supervisor_id = 'cbcbcbcb-0000-0000-0000-000000000002'
 WHERE id = 'cbcbcbcb-0000-0000-0000-000000000003';

INSERT INTO public.commission_liquidations (id, advisor_id, month)
VALUES ('cbcbcbcb-0000-0000-0000-0000000000d1', 'cbcbcbcb-0000-0000-0000-000000000003', date_trunc('month', now())::date);
INSERT INTO public.advisor_commissions (id, advisor_id, adhesion_request_id, affiliate_profile_id, amount, confirmed_at, liquidation_id)
VALUES ('cbcbcbcb-0000-0000-0000-0000000000c1', 'cbcbcbcb-0000-0000-0000-000000000003', 'cbcbcbcb-0000-0000-0000-0000000000b1',
        'cbcbcbcb-0000-0000-0000-000000000011', 500, now(), 'cbcbcbcb-0000-0000-0000-0000000000d1');

-- ── S4: the switch exists and starts off ────────────────────────────────────
SELECT results_eq($$SELECT value FROM public.system_settings WHERE key = 'commission_visibility'$$,
  $$VALUES ('{"visible": false}'::jsonb)$$, 'the switch is seeded off');
SELECT is(public.commissions_visible(), false, 'commissions_visible() is false while the switch is off');

-- ── S3: switch off, advisor and supervisor read nothing ─────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cbcbcbcb-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is(public.commissions_visible(), false, 'an advisor reads the switch as off');
SELECT is((SELECT count(*) FROM public.advisor_commissions), 0::bigint, 'switch off: an advisor reads no commission rows');
SELECT is((SELECT count(*) FROM public.commission_liquidations), 0::bigint, 'switch off: an advisor reads no liquidation rows');
SELECT is((SELECT count(*) FROM public.advisor_commission_summary()), 0::bigint, 'switch off: an advisor gets no summary');
SELECT is((SELECT count(*) FROM public.advisor_commission_list()), 0::bigint, 'switch off: an advisor gets no commission list');
-- RLS: an advisor's update touches no row, an upsert is refused
UPDATE public.system_settings SET value = '{"visible": true}' WHERE key = 'commission_visibility';
SELECT throws_ok($$INSERT INTO public.system_settings (key, value) VALUES ('commission_visibility', '{"visible": true}')
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value$$,
  '42501', NULL, 'an advisor cannot upsert the switch');
RESET ROLE;
SELECT is(public.commissions_visible(), false, 'an advisor cannot turn the switch on');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cbcbcbcb-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.advisor_commissions), 0::bigint, 'switch off: a supervisor reads no team commission rows');
SELECT is((SELECT count(*) FROM public.commission_liquidations), 0::bigint, 'switch off: a supervisor reads no team liquidation rows');
SELECT is((SELECT count(*) FROM public.advisor_commission_summary() WHERE advisor_id = 'cbcbcbcb-0000-0000-0000-000000000003'), 0::bigint,
  'switch off: a supervisor gets no team summary');
SELECT is((SELECT count(*) FROM public.advisor_commission_list()), 0::bigint, 'switch off: a supervisor gets no team commission list');
RESET ROLE;

-- the admin always sees everything
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cbcbcbcb-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.advisor_commissions WHERE advisor_id = 'cbcbcbcb-0000-0000-0000-000000000003'), 1::bigint,
  'switch off: the admin still reads the commission');
SELECT is((SELECT count(*) FROM public.commission_liquidations WHERE advisor_id = 'cbcbcbcb-0000-0000-0000-000000000003'), 1::bigint,
  'switch off: the admin still reads the liquidation');
SELECT is((SELECT to_collect_amount + generated_amount FROM public.advisor_commission_summary() WHERE advisor_id = 'cbcbcbcb-0000-0000-0000-000000000003'), 500::numeric,
  'switch off: the admin still gets the summary');
SELECT is((SELECT count(*) FROM public.advisor_commission_list(NULL, 'cbcbcbcb-0000-0000-0000-000000000003')), 1::bigint,
  'switch off: the admin still gets the commission list');
-- the admin turns it on from Configuración (same write the settings screen does)
SELECT lives_ok($$INSERT INTO public.system_settings (key, value) VALUES ('commission_visibility', '{"visible": true}')
                  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value$$,
  'the admin turns the switch on');
RESET ROLE;

-- ── S3: switch on, the previous scope is back ───────────────────────────────
SELECT is(public.commissions_visible(), true, 'commissions_visible() is true once the switch is on');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cbcbcbcb-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.advisor_commissions), 1::bigint, 'switch on: an advisor reads their commission');
SELECT is((SELECT count(*) FROM public.commission_liquidations), 1::bigint, 'switch on: an advisor reads their liquidation');
SELECT is((SELECT count(*) FROM public.advisor_commission_summary()), 1::bigint, 'switch on: an advisor gets their own summary only');
SELECT is((SELECT count(*) FROM public.advisor_commission_list()), 1::bigint, 'switch on: an advisor gets their commission list');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cbcbcbcb-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.advisor_commissions), 1::bigint, 'switch on: a supervisor reads the team commission');
SELECT is((SELECT count(*) FROM public.advisor_commission_list()), 1::bigint, 'switch on: a supervisor gets the team commission list');
RESET ROLE;

-- ── S4: a missing or malformed value means off ──────────────────────────────
UPDATE public.system_settings SET value = '"yes"' WHERE key = 'commission_visibility';
SELECT is(public.commissions_visible(), false, 'a malformed value means off');
UPDATE public.system_settings SET value = '{"visible": "true"}' WHERE key = 'commission_visibility';
SELECT is(public.commissions_visible(), false, 'a non-boolean visible means off');
DELETE FROM public.system_settings WHERE key = 'commission_visibility';
SELECT is(public.commissions_visible(), false, 'a missing switch means off');

-- Privileges are checked with has_function_privilege (calling a denied function as anon inside the test
-- transaction crashes the local backend, see advisor_goals_metrics.sql).
SELECT is(has_function_privilege('anon', 'public.commissions_visible()', 'execute'), false, 'anon cannot call commissions_visible()');
SELECT is(has_function_privilege('authenticated', 'public.commissions_visible()', 'execute'), true, 'authenticated can call commissions_visible()');

SELECT * FROM finish();
ROLLBACK;
