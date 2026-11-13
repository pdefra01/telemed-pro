-- pgTAP tests: affiliate cancellation, "Dar de baja" (odd/tasks/affiliate-cancellation.md, S1, S2).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   c4..01  patient, individual, coverage paid until the future
--   c4..02  patient, individual, coverage expired
--   c4..03  titular of a family group (coverage in the future)
--   c4..04  family member with own login (same group)
--   c4..05  doctor
--   c4..06  patient under an agreement (convenio)
--   c4..07  patient, suspended
--   c4..08  patient, pending first payment
--   c4..a1  plan
--   c4..f1  family group

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', ('c4c4c4c4-0000-0000-0000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'cancel-' || n || '@test.local', '', now(), now(), now(), ('{"full_name":"Cancel ' || n || '"}')::jsonb, '{}'::jsonb
  FROM generate_series(1, 8) AS n;

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES ('c4c4c4c4-0000-0000-0000-0000000000a1', 'Cancel Plan', 1000, 2, 4, 1, 0, false);

UPDATE public.profiles SET role = 'doctor', is_active = true WHERE id = 'c4c4c4c4-0000-0000-0000-000000000005';
UPDATE public.profiles SET role = 'patient', is_active = true, plan_status = 'active', plan_id = 'c4c4c4c4-0000-0000-0000-0000000000a1'
 WHERE id IN ('c4c4c4c4-0000-0000-0000-000000000001', 'c4c4c4c4-0000-0000-0000-000000000002',
              'c4c4c4c4-0000-0000-0000-000000000003', 'c4c4c4c4-0000-0000-0000-000000000004',
              'c4c4c4c4-0000-0000-0000-000000000006');
UPDATE public.profiles SET role = 'patient', is_active = false, plan_status = 'suspended', plan_id = 'c4c4c4c4-0000-0000-0000-0000000000a1'
 WHERE id = 'c4c4c4c4-0000-0000-0000-000000000007';
UPDATE public.profiles SET role = 'patient', is_active = false, plan_status = 'pending', plan_id = 'c4c4c4c4-0000-0000-0000-0000000000a1'
 WHERE id = 'c4c4c4c4-0000-0000-0000-000000000008';

INSERT INTO public.agreements (id, name)
VALUES ('c4c4c4c4-0000-0000-0000-0000000000b1', 'Cancel Convenio');
UPDATE public.profiles SET agreement_id = 'c4c4c4c4-0000-0000-0000-0000000000b1' WHERE id = 'c4c4c4c4-0000-0000-0000-000000000006';

INSERT INTO public.family_groups (id, primary_affiliate_id, name)
VALUES ('c4c4c4c4-0000-0000-0000-0000000000f1', 'c4c4c4c4-0000-0000-0000-000000000003', 'Cancel Family');
UPDATE public.profiles SET family_group_id = 'c4c4c4c4-0000-0000-0000-0000000000f1'
 WHERE id IN ('c4c4c4c4-0000-0000-0000-000000000003', 'c4c4c4c4-0000-0000-0000-000000000004');

INSERT INTO public.family_coverage_windows (subject_profile_id, family_group_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited,
                                            paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('c4c4c4c4-0000-0000-0000-000000000001', NULL, 'c4c4c4c4-0000-0000-0000-0000000000a1', now() - interval '20 days', now() + interval '10 days', 2, false, 1, 0, 1000),
  ('c4c4c4c4-0000-0000-0000-000000000002', NULL, 'c4c4c4c4-0000-0000-0000-0000000000a1', now() - interval '60 days', now() - interval '30 days', 2, false, 1, 0, 1000),
  (NULL, 'c4c4c4c4-0000-0000-0000-0000000000f1', 'c4c4c4c4-0000-0000-0000-0000000000a1', now() - interval '5 days', now() + interval '25 days', 2, false, 1, 0, 1000),
  ('c4c4c4c4-0000-0000-0000-000000000007', NULL, 'c4c4c4c4-0000-0000-0000-0000000000a1', now() - interval '5 days', now() + interval '25 days', 2, false, 1, 0, 1000),
  ('c4c4c4c4-0000-0000-0000-000000000008', NULL, 'c4c4c4c4-0000-0000-0000-0000000000a1', now() - interval '5 days', now() + interval '25 days', 2, false, 1, 0, 1000);

-- ── Grants ──────────────────────────────────────────────────────────────────
SELECT is(has_function_privilege('authenticated', 'public.cancel_affiliate(uuid, uuid)', 'EXECUTE'), false, 'cancel_affiliate is not exposed to the API');
SELECT is(has_function_privilege('authenticated', 'public.apply_due_affiliate_cancellations()', 'EXECUTE'), false, 'the sweep is not exposed to the API');
SELECT is(has_table_privilege('authenticated', 'public.affiliate_cancellations', 'INSERT'), false, 'clients cannot write cancellations');
SELECT is(has_table_privilege('authenticated', 'public.affiliate_cancellations', 'UPDATE'), false, 'clients cannot change cancellations');

-- ── S1: coverage paid until the future -> scheduled, still active ───────────
SELECT is((SELECT immediate FROM public.cancel_affiliate('c4c4c4c4-0000-0000-0000-000000000001', NULL)), false,
  'a paid-up affiliate is not cancelled at once');
SELECT is((SELECT effective_at FROM public.affiliate_cancellations WHERE profile_id = 'c4c4c4c4-0000-0000-0000-000000000001'),
  (SELECT paid_through FROM public.family_coverage_windows WHERE subject_profile_id = 'c4c4c4c4-0000-0000-0000-000000000001'),
  'the cancellation takes effect at the end of the paid period');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000001'), true, 'and keeps the login until then');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000001'), 'active', 'and the plan until then');
SELECT is(public.apply_due_affiliate_cancellations(), 0, 'the sweep leaves a cancellation that is not due yet');
SELECT is((SELECT effective_at FROM public.cancel_affiliate('c4c4c4c4-0000-0000-0000-000000000001', NULL)),
  (SELECT effective_at FROM public.affiliate_cancellations WHERE profile_id = 'c4c4c4c4-0000-0000-0000-000000000001'),
  'cancelling again is idempotent');

UPDATE public.affiliate_cancellations SET effective_at = now() - interval '1 minute' WHERE profile_id = 'c4c4c4c4-0000-0000-0000-000000000001';
SELECT is(public.apply_due_affiliate_cancellations(), 1, 'the sweep applies a due cancellation');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000001'), false, 'a due cancellation blocks the login');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000001'), 'cancelled', 'and marks the plan cancelled');
SELECT isnt((SELECT applied_at FROM public.affiliate_cancellations WHERE profile_id = 'c4c4c4c4-0000-0000-0000-000000000001'), NULL::timestamptz, 'and records when');
SELECT is(public.apply_due_affiliate_cancellations(), 0, 'the sweep never applies a cancellation twice');

-- ── S1: expired coverage -> immediate ───────────────────────────────────────
SELECT is((SELECT immediate FROM public.cancel_affiliate('c4c4c4c4-0000-0000-0000-000000000002', NULL)), true,
  'an affiliate with expired coverage is cancelled at once');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000002'), false, 'and loses the login at once');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000002'), 'cancelled', 'and is marked cancelled at once');

-- ── S1: family group ────────────────────────────────────────────────────────
SELECT throws_ok($$ SELECT * FROM public.cancel_affiliate('c4c4c4c4-0000-0000-0000-000000000004', NULL) $$,
  '22023', 'affiliate_not_titular', 'a family member cannot be cancelled on their own');
SELECT is((SELECT profiles_cancelled FROM public.cancel_affiliate('c4c4c4c4-0000-0000-0000-000000000003', NULL)), 2,
  'cancelling the titular cancels the whole group');
SELECT is((SELECT effective_at FROM public.affiliate_cancellations WHERE profile_id = 'c4c4c4c4-0000-0000-0000-000000000004'),
  (SELECT paid_through FROM public.family_coverage_windows WHERE family_group_id = 'c4c4c4c4-0000-0000-0000-0000000000f1'),
  'the member keeps the group coverage until its end');

-- ── S1: out of scope ────────────────────────────────────────────────────────
SELECT throws_ok($$ SELECT * FROM public.cancel_affiliate('c4c4c4c4-0000-0000-0000-000000000005', NULL) $$,
  'P0002', 'affiliate_not_found', 'a doctor cannot be cancelled as an affiliate');
SELECT throws_ok($$ SELECT * FROM public.cancel_affiliate('c4c4c4c4-0000-0000-0000-000000000006', NULL) $$,
  '22023', 'affiliate_has_agreement', 'an agreement affiliate is not cancelled here');

-- ── RLS: who reads a cancellation ───────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c4c4c4c4-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.affiliate_cancellations), 1, 'an affiliate reads only their own cancellation');
SELECT throws_ok($$ UPDATE public.affiliate_cancellations SET effective_at = now() + interval '1 year' $$,
  '42501', NULL, 'an affiliate cannot postpone their cancellation');
RESET ROLE;

-- ── S2: a late payment never reactivates nor extends ────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES
  ('c4c4c4c4-0000-0000-0000-0000000000e3', 'affiliate', 'c4c4c4c4-0000-0000-0000-000000000003', to_char(now(), 'YYYY-MM'), 1000, 0, 1000, 'issued'),
  ('c4c4c4c4-0000-0000-0000-0000000000e7', 'affiliate', 'c4c4c4c4-0000-0000-0000-000000000007', to_char(now(), 'YYYY-MM'), 1000, 0, 1000, 'issued'),
  ('c4c4c4c4-0000-0000-0000-0000000000e8', 'affiliate', 'c4c4c4c4-0000-0000-0000-000000000008', to_char(now(), 'YYYY-MM'), 1000, 0, 1000, 'issued');

SELECT is((public.post_payment_movement_from_webhook('c4c4c4c4-0000-0000-0000-0000000000e3', 'affiliate', 'c4c4c4c4-0000-0000-0000-000000000003',
  1000, 'payment:mercadopago:c4-3', 'mercadopago', now())).deferred_reason, 'affiliate_cancelled',
  'a payment after the cancellation request is deferred as affiliate_cancelled');
SELECT is((SELECT count(*)::int FROM public.affiliate_account_movements WHERE external_ref = 'payment:mercadopago:c4-3'), 1,
  'the money is still recorded');
SELECT is((SELECT paid_through FROM public.family_coverage_windows WHERE family_group_id = 'c4c4c4c4-0000-0000-0000-0000000000f1'),
  (SELECT effective_at FROM public.affiliate_cancellations WHERE profile_id = 'c4c4c4c4-0000-0000-0000-000000000003'),
  'and the coverage is not extended');

SELECT is((public.post_payment_movement_from_webhook('c4c4c4c4-0000-0000-0000-0000000000e7', 'affiliate', 'c4c4c4c4-0000-0000-0000-000000000007',
  1000, 'payment:mercadopago:c4-7', 'mercadopago', now())).posted, true, 'a payment of a suspended affiliate is posted');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000007'), 'suspended',
  'but never reactivates the suspended affiliate');

SELECT is((public.post_payment_movement_from_webhook('c4c4c4c4-0000-0000-0000-0000000000e8', 'affiliate', 'c4c4c4c4-0000-0000-0000-000000000008',
  1000, 'payment:mercadopago:c4-8', 'mercadopago', now())).coverage_extended, true, 'a pending affiliate''s first payment still extends coverage');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'c4c4c4c4-0000-0000-0000-000000000008'), 'active',
  'and still activates the plan (previous behavior)');

SELECT * FROM finish();
ROLLBACK;
