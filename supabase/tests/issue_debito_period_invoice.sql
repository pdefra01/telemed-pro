-- pgTAP tests for issue_debito_period_invoice (odd/debito-charge-invoice, T1).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   d0..  débito plan (monthly 14999, paid 1, bonus 0, unlimited)
--   e1..01  happy path, no window          (preapproval PA-HAPPY)
--   e1..02  existing window                (preapproval PA-WINDOW)
--   e1..03  no plan                        (preapproval PA-NOPLAN)
--   e1..04  family titular, no window      (preapproval PA-FAMILY, group f1..01)
--   (none)  unlinked subscription          (preapproval PA-UNLINKED)

BEGIN;
SELECT no_plan();

-- ── Fixtures (owner role) ───────────────────────────────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'deb-happy@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'deb-window@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'deb-noplan@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1e1e1e1-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'deb-family@test.local', '', now(), now(), now());

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES ('d0d0d0d0-0000-0000-0000-000000000000', 'Debito Plan', 14999.00, 0, 4, 1, 0, true);

INSERT INTO public.profiles (id, role, full_name, plan_id)
VALUES
  ('e1e1e1e1-0000-0000-0000-000000000001', 'patient', 'Deb Happy', 'd0d0d0d0-0000-0000-0000-000000000000'),
  ('e1e1e1e1-0000-0000-0000-000000000002', 'patient', 'Deb Window', 'd0d0d0d0-0000-0000-0000-000000000000'),
  ('e1e1e1e1-0000-0000-0000-000000000003', 'patient', 'Deb NoPlan', NULL),
  ('e1e1e1e1-0000-0000-0000-000000000004', 'patient', 'Deb Family', 'd0d0d0d0-0000-0000-0000-000000000000')
ON CONFLICT (id) DO UPDATE SET plan_id = EXCLUDED.plan_id, full_name = EXCLUDED.full_name;

INSERT INTO public.family_groups (id, primary_affiliate_id, name)
VALUES ('f1f1f1f1-0000-0000-0000-000000000001', 'e1e1e1e1-0000-0000-0000-000000000004', 'Familia Deb');
UPDATE public.profiles SET family_group_id = 'f1f1f1f1-0000-0000-0000-000000000001'
 WHERE id = 'e1e1e1e1-0000-0000-0000-000000000004';

INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id, discounted_monthly_cost, billing_day)
VALUES
  ('e1e1e1e1-0000-0000-0000-000000000001', 'authorized', 'PA-HAPPY', 14999.00, 10),
  ('e1e1e1e1-0000-0000-0000-000000000002', 'authorized', 'PA-WINDOW', 14999.00, 10),
  ('e1e1e1e1-0000-0000-0000-000000000003', 'authorized', 'PA-NOPLAN', 14999.00, 10),
  ('e1e1e1e1-0000-0000-0000-000000000004', 'authorized', 'PA-FAMILY', 39999.00, 10),
  (NULL, 'pending', 'PA-UNLINKED', 14999.00, 10);

-- Existing window for e1..02: the function must leave it untouched.
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('e1e1e1e1-0000-0000-0000-000000000002', 'd0d0d0d0-0000-0000-0000-000000000000',
   '2026-10-09 12:00:00+00', '2026-11-09 12:00:00+00', NULL, true, 1, 0, 14999.00);

-- ── Authorization ───────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.issue_debito_period_invoice('PA-HAPPY', '2026-11-09 20:46:56+00')$$,
  'forbidden',
  'rejects callers that are not the service role'
);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Non-issuable states return a reason ─────────────────────────────────────
SELECT is(
  public.issue_debito_period_invoice('PA-MISSING', '2026-11-09 20:46:56+00') ->> 'reason',
  'not_found', 'unknown preapproval: reason not_found');
SELECT is(
  public.issue_debito_period_invoice('PA-UNLINKED', '2026-11-09 20:46:56+00') ->> 'reason',
  'not_linked', 'subscription without profile: reason not_linked');
SELECT is(
  public.issue_debito_period_invoice('PA-NOPLAN', '2026-11-09 20:46:56+00') ->> 'reason',
  'no_plan', 'profile without plan: reason no_plan');
SELECT is(
  (SELECT count(*)::int FROM public.invoices WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000003'),
  0, 'no_plan issues no invoice');

-- ── Happy path: invoice + charge + window anchored at the first debit ───────
SELECT is(
  public.issue_debito_period_invoice('PA-HAPPY', '2026-11-09 20:46:56+00') ->> 'issued',
  'true', 'happy path: issued');

SELECT results_eq(
  $$SELECT period, total_amount, net_amount, tax_amount, status FROM public.invoices
     WHERE entity_type = 'affiliate' AND entity_id = 'e1e1e1e1-0000-0000-0000-000000000001'$$,
  $$VALUES ('2026-11'::text, 14999.00::numeric(12,2), 14999.00::numeric(12,2), 0::numeric(12,2), 'issued'::text)$$,
  'invoice for the debit month, amount = what MP debits, status issued');

SELECT results_eq(
  $$SELECT type, amount, external_ref FROM public.affiliate_account_movements
     WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000001'$$,
  $$VALUES ('charge'::text, 14999.00::numeric(12,2), 'charge:affiliate:e1e1e1e1-0000-0000-0000-000000000001:2026-11'::text)$$,
  'one charge movement with the billing-cycle external_ref');

SELECT results_eq(
  $$SELECT period_start, paid_through, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot, is_unlimited, granted_quota IS NULL
      FROM public.family_coverage_windows WHERE subject_profile_id = 'e1e1e1e1-0000-0000-0000-000000000001'$$,
  $$VALUES ('2026-11-09 20:46:56+00'::timestamptz, '2026-11-09 20:46:56+00'::timestamptz, 0, 0, 14999.00::numeric(12,2), true, true)$$,
  'window opened at the first debit date with no paid months yet');

-- ── Idempotent ──────────────────────────────────────────────────────────────
SELECT is(
  public.issue_debito_period_invoice('PA-HAPPY', '2026-11-09 21:00:00+00') ->> 'invoice_id',
  (SELECT id::text FROM public.invoices WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  'second call returns the same invoice');
SELECT is(
  (SELECT count(*)::int FROM public.invoices WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  1, 'second call does not duplicate the invoice');
SELECT is(
  (SELECT count(*)::int FROM public.affiliate_account_movements WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  1, 'second call does not duplicate the charge');
SELECT is(
  (SELECT count(*)::int FROM public.family_coverage_windows WHERE subject_profile_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  1, 'second call does not open a second window');

-- ── End to end with the existing webhook RPC: first debit covers one month ──
SELECT is(
  (public.post_payment_movement_from_webhook(
     (SELECT id FROM public.invoices WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
     'affiliate', 'e1e1e1e1-0000-0000-0000-000000000001', 14999.00,
     'payment:mercadopago:999001', 'mercadopago', '2026-11-09 20:46:56+00')).coverage_extended,
  true, 'webhook RPC extends the new window');
SELECT is(
  (SELECT paid_through FROM public.family_coverage_windows WHERE subject_profile_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  '2026-12-09 20:46:56+00'::timestamptz, 'paid coverage runs one month from the first debit');
SELECT is(
  (SELECT status FROM public.invoices WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  'paid', 'invoice is paid by the debit');
SELECT ok(
  (SELECT receipt_number IS NOT NULL FROM public.affiliate_account_movements
    WHERE external_ref = 'payment:mercadopago:999001'),
  'payment movement carries a receipt number');

-- ── Existing window is never modified ───────────────────────────────────────
SELECT is(
  public.issue_debito_period_invoice('PA-WINDOW', '2026-11-09 20:46:56+00') ->> 'issued',
  'true', 'existing window: invoice still issued');
SELECT results_eq(
  $$SELECT period_start, paid_through, paid_months_snapshot FROM public.family_coverage_windows
     WHERE subject_profile_id = 'e1e1e1e1-0000-0000-0000-000000000002'$$,
  $$VALUES ('2026-10-09 12:00:00+00'::timestamptz, '2026-11-09 12:00:00+00'::timestamptz, 1)$$,
  'existing window is left untouched');

-- ── Family titular: window keyed by the family group ────────────────────────
SELECT is(
  public.issue_debito_period_invoice('PA-FAMILY', '2026-11-09 20:46:56+00') ->> 'issued',
  'true', 'family titular: issued');
SELECT results_eq(
  $$SELECT subject_profile_id IS NULL, paid_through FROM public.family_coverage_windows
     WHERE family_group_id = 'f1f1f1f1-0000-0000-0000-000000000001'$$,
  $$VALUES (true, '2026-11-09 20:46:56+00'::timestamptz)$$,
  'family window keyed by family_group_id, anchored at the debit');
SELECT is(
  (SELECT total_amount FROM public.invoices WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000004'),
  39999.00::numeric(12,2), 'family invoice amount = the subscription amount');

-- ── Missing payment date falls back to now() instead of failing ─────────────
UPDATE public.affiliate_payment_subscriptions SET profile_id = 'e1e1e1e1-0000-0000-0000-000000000003'
 WHERE mp_preapproval_id = 'PA-UNLINKED';
UPDATE public.profiles SET plan_id = 'd0d0d0d0-0000-0000-0000-000000000000'
 WHERE id = 'e1e1e1e1-0000-0000-0000-000000000003';
SELECT is(
  public.issue_debito_period_invoice('PA-UNLINKED', NULL) ->> 'issued',
  'true', 'NULL occurred_at: issued with the current date');
SELECT is(
  (SELECT period FROM public.invoices WHERE entity_id = 'e1e1e1e1-0000-0000-0000-000000000003'),
  to_char(now(), 'YYYY-MM'), 'NULL occurred_at: invoice for the current month');

SELECT * FROM finish();
ROLLBACK;
