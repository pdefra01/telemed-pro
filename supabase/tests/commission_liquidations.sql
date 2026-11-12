-- pgTAP tests for commission liquidations (odd/tasks/commercial-crm-commissions.md, D1, S2/S3/S5).
-- Self-contained: BEGIN ... ROLLBACK. Months August-October 2026 are closed months.
--
-- Fixture UUID registry:
--   e8..01  admin
--   e8..02  supervisor (team: advisor 1)
--   e8..03  advisor 1 (code COM-ONE)
--   e8..04  advisor 2 (code COM-TWO)
--   e8..05  supervisor 2 (team: advisor 2; demoted at the end)
--   e8..11  sale of advisor 1, plan A, paid 2026-08-10                         -> August
--   e8..12  sale of advisor 1, plan B, paid 2026-08-20, debit rejected         -> retained in August, released in September
--   e8..13  sale of advisor 1, plan A, never paid                              -> no commission
--   e8..14  sale of advisor 1, no plan, paid 2026-08-05                        -> excluded 'Sin plan identificable'
--   e8..15  sale of advisor 2, plan A, paid 2026-08-12                         -> August
--   e8..16  sale of advisor 2, plan B, payment dated 2026-08-25 recorded late  -> September (August already approved)
--   e8..17  sale of advisor 1, plan A, paid 2026-09-01 02:00 UTC (Aug 31 in AR)-> August
--   e8..18  sale of advisor 1, plan A, paid 2026-09-10                         -> September
--   e8..19  sale of advisor 1, plan B, paid 2026-08-15                         -> August, excluded by the admin
--   e8..06  advisor 6 (code COM-SIX), promoted to supervisor before October
--   e8..1a  sale of advisor 6, plan B, paid 2026-10-05                         -> October (the promoted advisor keeps it)
--   e8..1b  sale of advisor 1, plan A, paid 2026-10-03, debit rejected 10-20   -> retained, excluded, included (still
--           retained), released after a manual payment, retained again at approval after a new rejection

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'com-admin@test.local', '', now(), now(), now(), '{"full_name":"Com Admin"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'com-sup@test.local', '', now(), now(), now(), '{"full_name":"Com Supervisor"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'com-adv-1@test.local', '', now(), now(), now(), '{"full_name":"Com Advisor One"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'com-adv-2@test.local', '', now(), now(), now(), '{"full_name":"Com Advisor Two"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'com-sup-2@test.local', '', now(), now(), now(), '{"full_name":"Com Supervisor Two"}', '{"role":"supervisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'com-aff-11@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 11"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'com-aff-12@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 12"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'com-aff-13@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 13"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'com-aff-14@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 14"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000015', 'authenticated', 'authenticated', 'com-aff-15@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 15"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000016', 'authenticated', 'authenticated', 'com-aff-16@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 16"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000017', 'authenticated', 'authenticated', 'com-aff-17@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 17"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000018', 'authenticated', 'authenticated', 'com-aff-18@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 18"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000019', 'authenticated', 'authenticated', 'com-aff-19@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 19"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'com-adv-6@test.local', '', now(), now(), now(), '{"full_name":"Com Advisor Six"}', '{"role":"advisor"}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-00000000001a', 'authenticated', 'authenticated', 'com-aff-1a@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 1a"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'e8e8e8e8-0000-0000-0000-00000000001b', 'authenticated', 'authenticated', 'com-aff-1b@test.local', '', now(), now(), now(), '{"full_name":"Com Affiliate 1b"}', '{}');

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited, advisor_commission_amount)
VALUES
  ('e8e8e8e8-0000-0000-0000-0000000000a1', 'Com Plan A', 1000, 0, 4, 1, 0, true, 500),
  ('e8e8e8e8-0000-0000-0000-0000000000a2', 'Com Plan B', 2500, 0, 4, 1, 0, true, 800);

INSERT INTO public.producers (id, name, producer_code, email, commission_rate, status, links_shared_count)
VALUES
  ('e8e8e8e8-0000-0000-0000-000000000003', 'Com Advisor One', 'COM-ONE', 'com-adv-1@test.local', 10, 'active', 0),
  ('e8e8e8e8-0000-0000-0000-000000000004', 'Com Advisor Two', 'COM-TWO', 'com-adv-2@test.local', 10, 'active', 0),
  ('e8e8e8e8-0000-0000-0000-000000000006', 'Com Advisor Six', 'COM-SIX', 'com-adv-6@test.local', 10, 'active', 0);

UPDATE public.profiles SET promoter_code = 'COM-ONE', supervisor_id = 'e8e8e8e8-0000-0000-0000-000000000002' WHERE id = 'e8e8e8e8-0000-0000-0000-000000000003';
UPDATE public.profiles SET promoter_code = 'COM-TWO', supervisor_id = 'e8e8e8e8-0000-0000-0000-000000000005' WHERE id = 'e8e8e8e8-0000-0000-0000-000000000004';
UPDATE public.profiles SET promoter_code = 'COM-SIX' WHERE id = 'e8e8e8e8-0000-0000-0000-000000000006';
UPDATE public.profiles SET plan_id = 'e8e8e8e8-0000-0000-0000-0000000000a2' WHERE id = 'e8e8e8e8-0000-0000-0000-00000000001a';
UPDATE public.profiles SET plan_id = 'e8e8e8e8-0000-0000-0000-0000000000a1' WHERE id = 'e8e8e8e8-0000-0000-0000-00000000001b';
UPDATE public.profiles SET plan_id = 'e8e8e8e8-0000-0000-0000-0000000000a1'
 WHERE id IN ('e8e8e8e8-0000-0000-0000-000000000011', 'e8e8e8e8-0000-0000-0000-000000000013', 'e8e8e8e8-0000-0000-0000-000000000015',
              'e8e8e8e8-0000-0000-0000-000000000017', 'e8e8e8e8-0000-0000-0000-000000000018');
UPDATE public.profiles SET plan_id = 'e8e8e8e8-0000-0000-0000-0000000000a2'
 WHERE id IN ('e8e8e8e8-0000-0000-0000-000000000012', 'e8e8e8e8-0000-0000-0000-000000000016', 'e8e8e8e8-0000-0000-0000-000000000019');
UPDATE public.profiles SET plan_id = NULL WHERE id = 'e8e8e8e8-0000-0000-0000-000000000014';

INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality, titular_neighborhood,
  titular_email, titular_phone, titular_civil_status, payment_method, signature_base64, status, promoter_id, approved_profile_id, activated_at, created_at)
VALUES
  ('e8e8e8e8-0000-0000-0000-0000000000b1', 'Com 11', '91000011', '1990-01-01', 'x', 'x', 'x', 'c11@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-000000000011', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b2', 'Com 12', '91000012', '1990-01-01', 'x', 'x', 'x', 'c12@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-000000000012', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b3', 'Com 13', '91000013', '1990-01-01', 'x', 'x', 'x', 'c13@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-000000000013', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b4', 'Com 14', '91000014', '1990-01-01', 'x', 'x', 'x', 'c14@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-000000000014', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b5', 'Com 15', '91000015', '1990-01-01', 'x', 'x', 'x', 'c15@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-TWO', 'e8e8e8e8-0000-0000-0000-000000000015', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b6', 'Com 16', '91000016', '1990-01-01', 'x', 'x', 'x', 'c16@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-TWO', 'e8e8e8e8-0000-0000-0000-000000000016', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b7', 'Com 17', '91000017', '1990-01-01', 'x', 'x', 'x', 'c17@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-000000000017', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b8', 'Com 18', '91000018', '1990-01-01', 'x', 'x', 'x', 'c18@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-000000000018', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000b9', 'Com 19', '91000019', '1990-01-01', 'x', 'x', 'x', 'c19@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-000000000019', '2026-08-01 12:00+00', '2026-08-01 12:00+00'),
  -- A pending request is never a sale.
  ('e8e8e8e8-0000-0000-0000-0000000000ba', 'Com 1x', '91000020', '1990-01-01', 'x', 'x', 'x', 'c1x@test.local', '1', 'soltero', 'cash', 'sig', 'pending', 'COM-ONE', NULL, NULL, '2026-08-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000bc', 'Com 1a', '91000021', '1990-01-01', 'x', 'x', 'x', 'c1a@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-SIX', 'e8e8e8e8-0000-0000-0000-00000000001a', '2026-10-01 12:00+00', '2026-10-01 12:00+00'),
  ('e8e8e8e8-0000-0000-0000-0000000000bd', 'Com 1b', '91000022', '1990-01-01', 'x', 'x', 'x', 'c1b@test.local', '1', 'soltero', 'cash', 'sig', 'approved', 'COM-ONE', 'e8e8e8e8-0000-0000-0000-00000000001b', '2026-10-01 12:00+00', '2026-10-01 12:00+00');

INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000011', 'charge',  1000, '2026-08-01 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000011', 'payment', 1000, '2026-08-10 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000011', 'payment', 1000, '2026-09-10 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000012', 'payment', 2500, '2026-08-20 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000013', 'charge',  1000, '2026-08-01 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000014', 'payment', 1000, '2026-08-05 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000015', 'payment', 1000, '2026-08-12 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000017', 'payment', 1000, '2026-09-01 02:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000018', 'payment', 1000, '2026-09-10 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000019', 'payment', 2500, '2026-08-15 12:00+00');

-- Affiliate 12: the debit of late August was rejected and nothing was paid since.
INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status, status_changed_at, created_at, last_failure_at, failure_count) VALUES
  ('e8e8e8e8-0000-0000-0000-000000000012', 'com-pre-12', 'payment_failed', '2026-08-28 12:00+00', '2026-08-01 12:00+00', '2026-08-28 12:00+00', 1),
  ('e8e8e8e8-0000-0000-0000-00000000001b', 'com-pre-1b', 'payment_failed', '2026-10-20 12:00+00', '2026-10-01 12:00+00', '2026-10-20 12:00+00', 1);
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'e8e8e8e8-0000-0000-0000-00000000001a', 'payment', 2500, '2026-10-05 12:00+00'),
  ('affiliate', 'e8e8e8e8-0000-0000-0000-00000000001b', 'payment', 1000, '2026-10-03 12:00+00');

-- Invariant, checked after every write (as the admin, who reads every row): a liquidation's total equals the sum of
-- its included lines, and every attached line has a status that matches its liquidation's status.
PREPARE commission_invariant AS
  SELECT l.id, 'total' AS problem FROM public.commission_liquidations l
   WHERE l.total_amount <> COALESCE((SELECT sum(c.amount) FROM public.advisor_commissions c
                                      WHERE c.liquidation_id = l.id AND c.status IN ('generated', 'approved', 'paid')), 0)
  UNION ALL
  SELECT l.id, c.status FROM public.advisor_commissions c JOIN public.commission_liquidations l ON l.id = c.liquidation_id
   WHERE (l.status = 'draft'    AND c.status NOT IN ('generated', 'excluded'))
      OR (l.status = 'approved' AND c.status NOT IN ('approved', 'excluded'))
      OR (l.status = 'paid'     AND c.status NOT IN ('paid', 'excluded'));

-- ── Every write function serializes on the same lock before reading state ──
-- pgTAP runs in one session and cannot race two transactions, so the lock is pinned in the function source:
-- it must be present and taken before the first table read.
SELECT ok(strpos(prosrc, 'pg_advisory_xact_lock(hashtext(''public.commission_writes''))') > 0
          AND strpos(prosrc, 'pg_advisory_xact_lock(hashtext(''public.commission_writes''))') < strpos(prosrc, 'FROM public.'),
          proname || ' takes the commission write lock before reading state')
  FROM pg_proc
 WHERE oid IN ('public.generate_commission_liquidations(date)'::regprocedure,
               'public.exclude_commission(uuid,text)'::regprocedure,
               'public.include_commission(uuid)'::regprocedure,
               'public.approve_commission_liquidation(uuid)'::regprocedure,
               'public.pay_commission_liquidation(uuid,date,text,text)'::regprocedure)
 ORDER BY proname;

-- ── Privileges (checked, never called, as anon) ─────────────────────────────
SELECT is(has_function_privilege('anon', 'public.generate_commission_liquidations(date)', 'execute'), false, 'anon cannot generate liquidations');
SELECT is(has_function_privilege('anon', 'public.exclude_commission(uuid,text)', 'execute'), false, 'anon cannot exclude commissions');
SELECT is(has_function_privilege('anon', 'public.include_commission(uuid)', 'execute'), false, 'anon cannot include commissions');
SELECT is(has_function_privilege('anon', 'public.approve_commission_liquidation(uuid)', 'execute'), false, 'anon cannot approve liquidations');
SELECT is(has_function_privilege('anon', 'public.pay_commission_liquidation(uuid,date,text,text)', 'execute'), false, 'anon cannot pay liquidations');
SELECT is(has_function_privilege('anon', 'public.advisor_commission_summary()', 'execute'), false, 'anon cannot read the summary');
SELECT is(has_function_privilege('anon', 'public.advisor_commission_list(uuid)', 'execute'), false, 'anon cannot read the commission list');
SELECT is(has_function_privilege('authenticated', 'public.generate_commission_liquidations(date)', 'execute'), true, 'authenticated may call generation (the function checks is_admin)');
SELECT is(has_function_privilege('authenticated', 'public.advisor_commission_summary()', 'execute'), true, 'authenticated may read the summary');
SELECT ok(NOT has_table_privilege('anon', 'public.advisor_commissions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'anon has no privilege on advisor_commissions');
SELECT ok(NOT has_table_privilege('anon', 'public.commission_liquidations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'anon has no privilege on commission_liquidations');
SELECT ok(NOT has_table_privilege('authenticated', 'public.advisor_commissions', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'authenticated cannot write advisor_commissions');
SELECT ok(NOT has_table_privilege('authenticated', 'public.commission_liquidations', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'authenticated cannot write commission_liquidations');
SELECT ok(has_table_privilege('authenticated', 'public.advisor_commissions', 'SELECT'), 'authenticated reads advisor_commissions through RLS');

-- ── Who may generate, and which months ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT throws_ok($$SELECT * FROM public.generate_commission_liquidations('2026-08-01')$$, '42501', NULL, 'an advisor cannot generate liquidations');
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT throws_ok($$SELECT * FROM public.generate_commission_liquidations('2026-08-01')$$, '42501', NULL, 'a supervisor cannot generate liquidations');

SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT throws_ok($$SELECT * FROM public.generate_commission_liquidations(date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)$$,
  'P0001', NULL, 'the current month (Argentina time) is not closed yet');
SELECT throws_ok($$SELECT * FROM public.generate_commission_liquidations((date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + interval '1 month')::date)$$,
  'P0001', NULL, 'a future month cannot be generated');
SELECT throws_ok($$SELECT * FROM public.generate_commission_liquidations(NULL)$$, 'P0001', NULL, 'the month is required');

-- ── August: generation ──────────────────────────────────────────────────────
SELECT results_eq($$SELECT advisors, commissions_attached, retained_count, total_amount FROM public.generate_commission_liquidations('2026-08-17')$$,
  $$VALUES (2, 4, 1, 2300::numeric)$$,
  'August: 2 advisors, 4 commissions attached (11, 17, 19 and 15), 1 retained (12), total 2300');

SELECT results_eq($$
  SELECT c.affiliate_profile_id::text, c.amount, c.status, c.exclusion_reason, c.retained_reason, l.month
    FROM public.advisor_commissions c LEFT JOIN public.commission_liquidations l ON l.id = c.liquidation_id
   ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000011', 500.00::numeric, 'generated', NULL, NULL, '2026-08-01'::date),
           ('e8e8e8e8-0000-0000-0000-000000000012', 800.00::numeric, 'retained',  NULL, 'Débito rechazado', NULL::date),
           ('e8e8e8e8-0000-0000-0000-000000000014',   0.00::numeric, 'excluded',  'Sin plan identificable', NULL, '2026-08-01'::date),
           ('e8e8e8e8-0000-0000-0000-000000000015', 500.00::numeric, 'generated', NULL, NULL, '2026-08-01'::date),
           ('e8e8e8e8-0000-0000-0000-000000000017', 500.00::numeric, 'generated', NULL, NULL, '2026-08-01'::date),
           ('e8e8e8e8-0000-0000-0000-000000000019', 800.00::numeric, 'generated', NULL, NULL, '2026-08-01'::date)$$,
  'August: one commission per confirmed sale up to the end of August in Argentina time; unconfirmed (13) and September (18) sales get none');

SELECT is((SELECT confirmed_at FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000011'),
  '2026-08-10 12:00+00'::timestamptz, 'confirmed_at is the first positive payment');
SELECT is((SELECT advisor_id::text FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000015'),
  'e8e8e8e8-0000-0000-0000-000000000004', 'the sale belongs to the advisor whose promoter_code is on the request');

SELECT results_eq($$
  SELECT advisor_id::text, status, total_amount, retained_amount, retained_count
    FROM public.commission_liquidations ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000003', 'draft', 1800.00::numeric, 800.00::numeric, 1),
           ('e8e8e8e8-0000-0000-0000-000000000004', 'draft',  500.00::numeric,   0.00::numeric, 0)$$,
  'August: one draft liquidation per advisor; the retained commission is informative only');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after the August generation');

-- ── Amount snapshot and idempotent regeneration of a draft ──────────────────
RESET ROLE;
UPDATE public.plans SET advisor_commission_amount = 999 WHERE id = 'e8e8e8e8-0000-0000-0000-0000000000a1';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisors, commissions_attached, retained_count, total_amount FROM public.generate_commission_liquidations('2026-08-01')$$,
  $$VALUES (2, 4, 1, 2300::numeric)$$, 'regenerating a draft month gives the same result');
SELECT is((SELECT count(*)::int FROM public.advisor_commissions), 6, 'regeneration creates no duplicate commissions');
SELECT is((SELECT count(*)::int FROM public.commission_liquidations), 2, 'regeneration creates no duplicate liquidations');
SELECT is((SELECT amount FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000011'),
  500.00::numeric, 'the amount is a snapshot: a later plan change does not alter it');
RESET ROLE;
UPDATE public.plans SET advisor_commission_amount = 500 WHERE id = 'e8e8e8e8-0000-0000-0000-0000000000a1';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ── Exclusion (admin, with a reason, only on a draft) ───────────────────────
SELECT throws_ok($$SELECT public.exclude_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'), '  ')$$,
  'P0001', NULL, 'an exclusion needs a reason');
SELECT throws_ok($$SELECT public.exclude_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'), NULL)$$,
  'P0001', NULL, 'an exclusion needs a non-null reason');
SELECT lives_ok($$SELECT public.exclude_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'), 'Venta duplicada')$$,
  'the admin excludes a sale with a reason');
SELECT results_eq($$SELECT status, exclusion_reason FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'$$,
  $$VALUES ('excluded', 'Venta duplicada')$$, 'the excluded commission keeps its reason');
SELECT is((SELECT total_amount FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'),
  1000.00::numeric, 'the exclusion recomputes the total');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after an exclusion');
SELECT lives_ok($$SELECT public.include_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'))$$,
  'the admin can undo an exclusion while the liquidation is a draft');
SELECT is((SELECT total_amount FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'),
  1800.00::numeric, 'including it back recomputes the total');
SELECT throws_ok($$SELECT public.include_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000014'))$$,
  'P0001', NULL, 'a commission without a plan cannot be included');
SELECT lives_ok($$SELECT public.exclude_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'), 'Venta duplicada')$$,
  'the admin excludes it again');
SELECT results_eq($$SELECT advisors, commissions_attached, retained_count, total_amount FROM public.generate_commission_liquidations('2026-08-01')$$,
  $$VALUES (2, 3, 1, 1500::numeric)$$, 'regeneration keeps the exclusion');
SELECT results_eq($$SELECT status, exclusion_reason FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'$$,
  $$VALUES ('excluded', 'Venta duplicada')$$, 'the exclusion survives regeneration');

-- ── Non-admins cannot act on liquidations ───────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'))$$,
  '42501', NULL, 'an advisor cannot approve their liquidation');
SELECT throws_ok($$SELECT public.exclude_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000011'), 'x')$$,
  '42501', NULL, 'an advisor cannot exclude commissions');
SELECT throws_ok($$SELECT public.include_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'))$$,
  '42501', NULL, 'an advisor cannot include commissions');
SELECT throws_ok($$SELECT public.pay_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'), '2026-09-05', 'transferencia', 'x')$$,
  '42501', NULL, 'an advisor cannot pay a liquidation');
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'))$$,
  '42501', NULL, 'a supervisor cannot approve their team''s liquidation');

-- ── No direct writes by API roles, not even the admin ───────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT throws_ok($$UPDATE public.advisor_commissions SET amount = 1$$, '42501', NULL, 'the admin cannot update commissions directly');
SELECT throws_ok($$DELETE FROM public.advisor_commissions$$, '42501', NULL, 'the admin cannot delete commissions directly');
SELECT throws_ok($$INSERT INTO public.advisor_commissions (advisor_id, adhesion_request_id, affiliate_profile_id, amount, confirmed_at, status)
  VALUES ('e8e8e8e8-0000-0000-0000-000000000003', 'e8e8e8e8-0000-0000-0000-0000000000b3', 'e8e8e8e8-0000-0000-0000-000000000013', 1, now(), 'generated')$$,
  '42501', NULL, 'the admin cannot insert commissions directly');
SELECT throws_ok($$UPDATE public.commission_liquidations SET status = 'paid'$$, '42501', NULL, 'the admin cannot update liquidations directly');
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT throws_ok($$UPDATE public.advisor_commissions SET amount = 1$$, '42501', NULL, 'an advisor cannot update commissions directly');
SELECT throws_ok($$DELETE FROM public.commission_liquidations$$, '42501', NULL, 'an advisor cannot delete liquidations directly');

-- ── Approval ────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.pay_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000004'), '2026-09-05', 'transferencia', 'x')$$,
  'P0001', NULL, 'a draft liquidation cannot be paid');
SELECT lives_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'))$$,
  'the admin approves advisor 1''s August liquidation');
SELECT results_eq($$SELECT status, approved_by::text, approved_at IS NOT NULL, total_amount FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'$$,
  $$VALUES ('approved', 'e8e8e8e8-0000-0000-0000-000000000001', true, 1000.00::numeric)$$, 'approval records who and when');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after an approval');
SELECT results_eq($$
  SELECT affiliate_profile_id::text, status FROM public.advisor_commissions
   WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000011', 'approved'), ('e8e8e8e8-0000-0000-0000-000000000012', 'retained'),
           ('e8e8e8e8-0000-0000-0000-000000000014', 'excluded'), ('e8e8e8e8-0000-0000-0000-000000000017', 'approved'),
           ('e8e8e8e8-0000-0000-0000-000000000019', 'excluded')$$,
  'approval marks the included commissions approved; excluded and retained ones are unchanged');
SELECT throws_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003'))$$,
  'P0001', NULL, 'an approved liquidation cannot be approved again');
SELECT throws_ok($$SELECT public.exclude_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000011'), 'Tarde')$$,
  'P0001', NULL, 'a commission of an approved liquidation cannot be excluded');
SELECT throws_ok($$SELECT public.include_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000019'))$$,
  'P0001', NULL, 'an exclusion of an approved liquidation cannot be undone');
SELECT throws_ok($$SELECT public.approve_commission_liquidation('e8e8e8e8-0000-0000-0000-0000000000ff')$$,
  'P0002', NULL, 'an unknown liquidation raises');
SELECT lives_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000004'))$$,
  'the admin approves advisor 2''s August liquidation');

-- ── Late confirmation: frozen month, next month gets it ─────────────────────
RESET ROLE;
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000016', 'payment', 2500, '2026-08-25 12:00+00');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisors, commissions_attached, total_amount FROM public.generate_commission_liquidations('2026-08-01')$$,
  $$VALUES (0, 0, 0::numeric)$$, 'regenerating an approved month changes nothing');
SELECT results_eq($$SELECT advisor_id::text, status, total_amount FROM public.commission_liquidations ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000003', 'approved', 1000.00::numeric),
           ('e8e8e8e8-0000-0000-0000-000000000004', 'approved',  500.00::numeric)$$,
  'approved liquidations are frozen');
SELECT results_eq($$SELECT status, liquidation_id IS NULL FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000016'$$,
  $$VALUES ('generated', true)$$, 'the late-confirmed August sale is recorded but waits for the next month');

-- ── September: the rejection is resolved, the late sale arrives ─────────────
RESET ROLE;
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'e8e8e8e8-0000-0000-0000-000000000012', 'payment', 2500, '2026-09-15 12:00+00');
UPDATE public.affiliate_payment_subscriptions SET status = 'authorized', status_changed_at = '2026-09-15 12:00+00' WHERE mp_preapproval_id = 'com-pre-12';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisors, commissions_attached, retained_count, total_amount FROM public.generate_commission_liquidations('2026-09-01')$$,
  $$VALUES (2, 3, 0, 2100::numeric)$$, 'September: 12 released and 18 for advisor 1, the late 16 for advisor 2');
SELECT results_eq($$
  SELECT l.advisor_id::text, l.month, l.status, l.total_amount, l.retained_count
    FROM public.commission_liquidations l WHERE l.month = '2026-09-01' ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000003', '2026-09-01'::date, 'draft', 1300.00::numeric, 0),
           ('e8e8e8e8-0000-0000-0000-000000000004', '2026-09-01'::date, 'draft',  800.00::numeric, 0)$$,
  'September drafts');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after the September generation');
SELECT results_eq($$SELECT status, retained_reason FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000012'$$,
  $$VALUES ('generated', NULL::text)$$, 'the released commission is no longer retained');

-- ── Payment ─────────────────────────────────────────────────────────────────
SELECT throws_ok($$SELECT public.pay_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-08-01'), '2026-09-05', '  ', 'TRX-1')$$,
  'P0001', NULL, 'a payment needs a method');
SELECT throws_ok($$SELECT public.pay_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-08-01'), NULL, 'transferencia', 'TRX-1')$$,
  'P0001', NULL, 'a payment needs a date');
SELECT lives_ok($$SELECT public.pay_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-08-01'), '2026-09-05', 'transferencia', 'TRX-1')$$,
  'the admin records the payment');
SELECT results_eq($$
  SELECT status, paid_at, paid_by::text, payment_method, payment_reference FROM public.commission_liquidations
   WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-08-01'$$,
  $$VALUES ('paid', '2026-09-05'::date, 'e8e8e8e8-0000-0000-0000-000000000001', 'transferencia', 'TRX-1')$$, 'the payment is recorded');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after a payment');
SELECT results_eq($$
  SELECT affiliate_profile_id::text, status FROM public.advisor_commissions
   WHERE affiliate_profile_id IN ('e8e8e8e8-0000-0000-0000-000000000011', 'e8e8e8e8-0000-0000-0000-000000000017', 'e8e8e8e8-0000-0000-0000-000000000019') ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000011', 'paid'), ('e8e8e8e8-0000-0000-0000-000000000017', 'paid'),
           ('e8e8e8e8-0000-0000-0000-000000000019', 'excluded')$$,
  'payment marks the approved commissions paid');
SELECT throws_ok($$SELECT public.pay_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-08-01'), '2026-09-06', 'efectivo', NULL)$$,
  'P0001', NULL, 'a paid liquidation cannot be paid again');
SELECT throws_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-08-01'))$$,
  'P0001', NULL, 'a paid liquidation cannot be approved');

-- No clawback: the paid affiliate is rejected later; the paid commission stays paid.
RESET ROLE;
UPDATE public.affiliate_payment_subscriptions SET status = 'payment_failed', last_failure_at = '2026-10-10 12:00+00' WHERE mp_preapproval_id = 'com-pre-12';
INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status, status_changed_at, created_at, last_failure_at, failure_count) VALUES
  ('e8e8e8e8-0000-0000-0000-000000000011', 'com-pre-11', 'payment_failed', '2026-10-10 12:00+00', '2026-08-01 12:00+00', '2026-10-10 12:00+00', 1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT lives_ok($$SELECT * FROM public.generate_commission_liquidations('2026-09-01')$$, 'September is regenerated after new rejections');
SELECT is((SELECT status FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000011'),
  'paid', 'no clawback: a paid commission stays paid');
SELECT results_eq($$SELECT status, retained_reason, liquidation_id IS NULL FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-000000000012'$$,
  $$VALUES ('retained', 'Débito rechazado', true)$$, 'a draft regeneration retains a commission whose debit is rejected again');
SELECT is((SELECT total_amount FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-09-01'),
  500.00::numeric, 'the September draft total drops the retained commission');
-- Back to the paid state for the summary below.
RESET ROLE;
UPDATE public.affiliate_payment_subscriptions SET status = 'authorized' WHERE mp_preapproval_id = 'com-pre-12';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisors, commissions_attached, retained_count, total_amount FROM public.generate_commission_liquidations('2026-09-01')$$,
  $$VALUES (2, 3, 0, 2100::numeric)$$, 'September regenerated again once the debit recovers');

-- ── Summary per role ────────────────────────────────────────────────────────
-- advisor 1: generated = September draft (12: 800, 18: 500), collected = August (11 + 17).
-- advisor 2: generated = September draft (16: 800), to collect = August approved (15: 500).
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT results_eq($$
  SELECT advisor_id::text, advisor_name, generated_amount, generated_count, retained_amount, retained_count,
         to_collect_amount, to_collect_count, collected_amount, collected_count
    FROM public.advisor_commission_summary() ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000003', 'Com Advisor One', 1300.00::numeric, 2::bigint, 0.00::numeric, 0::bigint, 0.00::numeric, 0::bigint, 1000.00::numeric, 2::bigint)$$,
  'the advisor sees only their own summary');
SELECT is((SELECT count(*)::int FROM public.advisor_commissions), 6, 'the advisor reads only their commissions');
SELECT is((SELECT count(*)::int FROM public.commission_liquidations), 2, 'the advisor reads only their liquidations');
SELECT is((SELECT count(*)::int FROM public.advisor_commission_list(NULL)), 6, 'the advisor lists only their commissions');
SELECT results_eq($$
  SELECT affiliate_name, plan_name, amount, status, liquidation_month, liquidation_status
    FROM public.advisor_commission_list((SELECT id FROM public.commission_liquidations WHERE month = '2026-09-01')) ORDER BY 1$$,
  $$VALUES ('Com Affiliate 12', 'Com Plan B', 800.00::numeric, 'generated', '2026-09-01'::date, 'draft'),
           ('Com Affiliate 18', 'Com Plan A', 500.00::numeric, 'generated', '2026-09-01'::date, 'draft')$$,
  'the list of one liquidation, with affiliate and plan names');

SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisor_id::text FROM public.advisor_commission_summary() ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000003')$$, 'the supervisor sees their team''s summary');
SELECT is((SELECT count(*)::int FROM public.advisor_commissions), 6, 'the supervisor reads their team''s commissions');
SELECT is((SELECT count(*)::int FROM public.commission_liquidations), 2, 'the supervisor reads their team''s liquidations');

SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT results_eq($$
  SELECT advisor_id::text, generated_amount, generated_count, to_collect_amount, to_collect_count, collected_amount
    FROM public.advisor_commission_summary() ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000004', 800.00::numeric, 1::bigint, 500.00::numeric, 1::bigint, 0.00::numeric)$$,
  'supervisor 2 sees advisor 2: generated, approved to collect, collected');
SELECT is((SELECT count(*)::int FROM public.advisor_commissions), 2, 'supervisor 2 reads advisor 2''s commissions');

SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisor_id::text FROM public.advisor_commission_summary()
                     WHERE advisor_id IN ('e8e8e8e8-0000-0000-0000-000000000003', 'e8e8e8e8-0000-0000-0000-000000000004') ORDER BY 1$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000003'), ('e8e8e8e8-0000-0000-0000-000000000004')$$, 'the admin sees every advisor''s summary');
SELECT is((SELECT count(*)::int FROM public.advisor_commissions), 8, 'the admin reads every commission');
SELECT is((SELECT count(*)::int FROM public.commission_liquidations), 4, 'the admin reads every liquidation');
RESET ROLE;

-- ── A demoted supervisor loses the team's commissions ───────────────────────
UPDATE public.profiles SET role = 'patient' WHERE id = 'e8e8e8e8-0000-0000-0000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_commissions), 0, 'a demoted supervisor reads no commissions');
SELECT is((SELECT count(*)::int FROM public.commission_liquidations), 0, 'a demoted supervisor reads no liquidations');
SELECT is((SELECT count(*)::int FROM public.advisor_commission_summary()), 0, 'a demoted supervisor gets no summary');
SELECT is((SELECT count(*)::int FROM public.advisor_commission_list(NULL)), 0, 'a demoted supervisor lists no commissions');
-- A patient sees nothing.
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000011","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.advisor_commissions), 0, 'an affiliate reads no commissions');
RESET ROLE;

-- ── October: promoted advisor, manual catch-up, retention at inclusion and at approval ──
-- Advisor 6 is promoted: the sales made with their code keep generating commissions.
UPDATE public.profiles SET role = 'supervisor' WHERE id = 'e8e8e8e8-0000-0000-0000-000000000006';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT results_eq($$SELECT advisors, commissions_attached, retained_count, total_amount FROM public.generate_commission_liquidations('2026-10-01')$$,
  $$VALUES (1, 1, 1, 800::numeric)$$, 'October: the promoted advisor''s sale is liquidated; 1b is retained');
SELECT results_eq($$SELECT advisor_id::text, amount, status FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001a'$$,
  $$VALUES ('e8e8e8e8-0000-0000-0000-000000000006', 800.00::numeric, 'generated')$$, 'a promoted advisor keeps the commission of a sale made with their code');
SELECT results_eq($$SELECT advisor_name, generated_amount FROM public.advisor_commission_summary() WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000006'$$,
  $$VALUES ('Com Advisor Six', 800.00::numeric)$$, 'the admin still sees the promoted advisor in the summary');
SELECT results_eq($$SELECT advisor_name, affiliate_name FROM public.advisor_commission_list(NULL) WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000006'$$,
  $$VALUES ('Com Advisor Six', 'Com Affiliate 1a')$$, 'the list still shows the promoted advisor''s commission');
SELECT results_eq($$SELECT status, retained_reason, liquidation_id IS NULL FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'$$,
  $$VALUES ('retained', 'Débito rechazado', true)$$, '1b is retained in October');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after the October generation');

-- retained -> excluded -> included while the debit is still rejected: back to retained, never to generated.
SELECT lives_ok($$SELECT public.exclude_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'), 'Revisión')$$,
  'a retained commission can be excluded');
SELECT results_eq($$SELECT status, exclusion_reason, retained_reason FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'$$,
  $$VALUES ('excluded', 'Revisión', NULL::text)$$, 'the retained commission is excluded');
SELECT lives_ok($$SELECT public.include_commission((SELECT id FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'))$$,
  'the exclusion is undone');
SELECT results_eq($$SELECT status, exclusion_reason, retained_reason, liquidation_id IS NULL FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'$$,
  $$VALUES ('retained', NULL::text, 'Débito rechazado', true)$$, 'including a commission whose debit is still rejected retains it');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after an inclusion');

-- A 0-amount payment after the rejection is not a catch-up: the debit stays rejected (both branches of the rule).
RESET ROLE;
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'e8e8e8e8-0000-0000-0000-00000000001b', 'payment', 0, '2026-10-25 12:00+00');
SELECT ok(public.commission_debit_pending('e8e8e8e8-0000-0000-0000-00000000001b'),
  'a 0-amount payment after the rejection does not release the retention');
SELECT ok(public.debit_rejection_pending('e8e8e8e8-0000-0000-0000-00000000001b', 'payment_failed', '2026-10-20 12:00+00'),
  'payment_failed: a 0-amount payment is not a catch-up');
SELECT ok(public.debit_rejection_pending('e8e8e8e8-0000-0000-0000-00000000001b', 'cancelled', '2026-10-20 12:00+00'),
  'cancelled: a 0-amount payment is not a catch-up');

-- Manual catch-up: a payment after the rejection releases it, although the subscription stays payment_failed.
INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, created_at) VALUES
  ('affiliate', 'e8e8e8e8-0000-0000-0000-00000000001b', 'payment', 1000, '2026-10-28 12:00+00');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.admin_debit_rejections() WHERE profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'), 0,
  'a payment after the rejection clears the Débito rechazado mark');
SELECT results_eq($$SELECT advisors, commissions_attached, retained_count, total_amount FROM public.generate_commission_liquidations('2026-10-01')$$,
  $$VALUES (2, 2, 0, 1300::numeric)$$, 'October regenerated: 1b is released after the manual payment');
SELECT results_eq($$SELECT status, retained_reason FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'$$,
  $$VALUES ('generated', NULL::text)$$, 'the caught-up commission is released');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after the October regeneration');

-- A new rejection after the generation: the approval re-checks every line and retains it.
RESET ROLE;
UPDATE public.affiliate_payment_subscriptions SET last_failure_at = '2026-10-30 12:00+00', failure_count = 2 WHERE mp_preapproval_id = 'com-pre-1b';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e8e8e8e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT lives_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-10-01'))$$,
  'the admin approves advisor 1''s October liquidation');
SELECT results_eq($$SELECT status, retained_reason, liquidation_id IS NULL FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001b'$$,
  $$VALUES ('retained', 'Débito rechazado', true)$$, 'the approval retains a line whose debit was rejected after the generation');
SELECT results_eq($$SELECT status, total_amount FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000003' AND month = '2026-10-01'$$,
  $$VALUES ('approved', 0.00::numeric)$$, 'the approved total leaves the retained line out');
SELECT is_empty('EXECUTE commission_invariant', 'invariant after an approval with a retained line');
SELECT lives_ok($$SELECT public.approve_commission_liquidation((SELECT id FROM public.commission_liquidations WHERE advisor_id = 'e8e8e8e8-0000-0000-0000-000000000006' AND month = '2026-10-01'))$$,
  'the promoted advisor''s October liquidation is approved');
SELECT is((SELECT status FROM public.advisor_commissions WHERE affiliate_profile_id = 'e8e8e8e8-0000-0000-0000-00000000001a'), 'approved',
  'a line with no rejection is approved');
SELECT is_empty('EXECUTE commission_invariant', 'invariant at the end');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
