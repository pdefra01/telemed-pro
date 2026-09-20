-- pgTAP tests for 20260920060000_post_adhesion_checkout_payment.sql
-- (odd/checkout-payment-ledger, L1). Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   a0..  plan (monthly 50000, paid 1, bonus 1)
--   b1..  happy path        (profile b1..01, request c1..01)
--   b2..  not approved      (request c1..02)
--   b3..  not paid          (request c1..03)
--   b4..  partial payment   (profile b1..04, request c1..04)
--   b5..  existing window   (profile b1..05, request c1..05)
--   b6..  no payment id     (request c1..06)
--   b7..  no profile        (request c1..07)

BEGIN;
SELECT no_plan();

SELECT has_column('public', 'adhesion_requests', 'mp_paid_amount', 'has mp_paid_amount');
SELECT has_column('public', 'adhesion_requests', 'ledger_posted_at', 'has ledger_posted_at');

-- ── Fixtures (owner role) ───────────────────────────────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'b1b1b1b1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'l1happy@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1b1b1b1-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'l1partial@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1b1b1b1-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'l1window@test.local', '', now(), now(), now());

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES ('a0a0a0a0-0000-0000-0000-000000000000', 'L1 Plan', 50000.00, 4, 0, 1, 1, false);

INSERT INTO public.profiles (id, role, full_name, plan_id)
VALUES
  ('b1b1b1b1-0000-0000-0000-000000000001', 'patient', 'L1 Happy', 'a0a0a0a0-0000-0000-0000-000000000000'),
  ('b1b1b1b1-0000-0000-0000-000000000004', 'patient', 'L1 Partial', 'a0a0a0a0-0000-0000-0000-000000000000'),
  ('b1b1b1b1-0000-0000-0000-000000000005', 'patient', 'L1 Window', 'a0a0a0a0-0000-0000-0000-000000000000')
ON CONFLICT (id) DO UPDATE SET plan_id = EXCLUDED.plan_id, full_name = EXCLUDED.full_name;

-- Pre-existing window for the profile ...05 (must never be extended)
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited,
   paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('b1b1b1b1-0000-0000-0000-000000000005', 'a0a0a0a0-0000-0000-0000-000000000000',
   '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z', 8, false, 1, 1, 50000.00);

CREATE OR REPLACE FUNCTION pg_temp.mk_request(p_id UUID, p_dni TEXT, p_status TEXT, p_profile UUID,
                                              p_pay_status TEXT, p_pay_id TEXT, p_amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.adhesion_requests
    (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality,
     titular_neighborhood, titular_email, titular_phone, titular_civil_status, payment_method, signature_base64,
     status, approved_profile_id, payment_status, mp_payment_id, mp_paid_amount, paid_at)
  VALUES
    (p_id, 'L1 Titular', p_dni, '1980-01-01', 'Calle 1', 'Loc',
     'Barrio', p_dni || '@example.com', '1155551234', 'single', 'cash', 'sig',
     p_status, p_profile, p_pay_status, p_pay_id, p_amount,
     CASE WHEN p_pay_status = 'approved' THEN '2026-09-20T12:00:00Z'::timestamptz END);
END;
$$;

SELECT pg_temp.mk_request('c1c1c1c1-0000-0000-0000-000000000001', '31000001', 'approved', 'b1b1b1b1-0000-0000-0000-000000000001', 'approved', 'mp-l1-1', 100000.00);
SELECT pg_temp.mk_request('c1c1c1c1-0000-0000-0000-000000000002', '31000002', 'pending',  NULL,                                   'approved', 'mp-l1-2', 100000.00);
SELECT pg_temp.mk_request('c1c1c1c1-0000-0000-0000-000000000003', '31000003', 'approved', 'b1b1b1b1-0000-0000-0000-000000000001', 'pending',  NULL,      NULL);
SELECT pg_temp.mk_request('c1c1c1c1-0000-0000-0000-000000000004', '31000004', 'approved', 'b1b1b1b1-0000-0000-0000-000000000004', 'approved', 'mp-l1-4', 30000.00);
SELECT pg_temp.mk_request('c1c1c1c1-0000-0000-0000-000000000005', '31000005', 'approved', 'b1b1b1b1-0000-0000-0000-000000000005', 'approved', 'mp-l1-5', 100000.00);
SELECT pg_temp.mk_request('c1c1c1c1-0000-0000-0000-000000000006', '31000006', 'approved', 'b1b1b1b1-0000-0000-0000-000000000004', 'approved', NULL,      100000.00);
SELECT pg_temp.mk_request('c1c1c1c1-0000-0000-0000-000000000007', '31000007', 'approved', NULL,                                   'approved', 'mp-l1-7', 100000.00);

-- ── Authorization ───────────────────────────────────────────────────────────
SELECT ok(NOT has_function_privilege('anon', 'public.post_adhesion_checkout_payment(uuid)', 'EXECUTE'),
  'anon has NO EXECUTE');
SELECT ok(NOT has_function_privilege('authenticated', 'public.post_adhesion_checkout_payment(uuid)', 'EXECUTE'),
  'authenticated has NO EXECUTE');
SELECT ok(has_function_privilege('service_role', 'public.post_adhesion_checkout_payment(uuid)', 'EXECUTE'),
  'service_role HAS EXECUTE');

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000001')$$,
  'P0001'::char(5), NULL, 'rejected by the in-body is_service_role() guard when claims disagree');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Non-postable requests: no error, posted=false with a reason ─────────────
SELECT is((public.post_adhesion_checkout_payment('deadbeef-0000-0000-0000-00000000dead')) ->> 'reason', 'not_found', 'unknown id -> not_found');
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000002')) ->> 'reason', 'not_approved', 'request not approved -> not_approved');
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000003')) ->> 'reason', 'not_paid', 'payment pending -> not_paid');
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000006')) ->> 'reason', 'not_paid', 'approved payment without mp_payment_id -> not_paid');
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000007')) ->> 'reason', 'no_profile', 'approved request without approved_profile_id -> no_profile');
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000002')) ->> 'posted', 'false', 'non-postable -> posted=false');
SELECT is((SELECT count(*)::int FROM public.affiliate_account_movements
  WHERE entity_id = 'b1b1b1b1-0000-0000-0000-000000000001'), 0, 'non-postable calls wrote no movements');

-- ── Happy path ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE l1_res AS
  SELECT public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000001') AS r;
GRANT ALL ON l1_res TO PUBLIC;

SELECT is((SELECT r ->> 'posted' FROM l1_res), 'true', 'happy: posted=true');
SELECT is((SELECT r ->> 'reason' FROM l1_res), 'posted', 'happy: reason=posted');

SELECT is((SELECT status FROM public.invoices WHERE id = (SELECT (r ->> 'invoice_id')::uuid FROM l1_res)),
  'paid', 'happy: invoice is paid');
SELECT is((SELECT total_amount FROM public.invoices WHERE id = (SELECT (r ->> 'invoice_id')::uuid FROM l1_res)),
  50000.00::numeric, 'happy: invoice total = monthly_cost x paid_months');
SELECT is((SELECT period FROM public.invoices WHERE id = (SELECT (r ->> 'invoice_id')::uuid FROM l1_res)),
  to_char(now(), 'YYYY-MM'), 'happy: invoice period = current month');
SELECT is((SELECT amount FROM public.affiliate_account_movements
  WHERE external_ref = 'charge:affiliate:b1b1b1b1-0000-0000-0000-000000000001:' || to_char(now(), 'YYYY-MM') AND type = 'charge'),
  50000.00::numeric, 'happy: charge movement posted');
SELECT is((SELECT amount FROM public.affiliate_account_movements
  WHERE external_ref = 'payment:mercadopago:mp-l1-1' AND type = 'payment'),
  100000.00::numeric, 'happy: payment movement posted for mp_paid_amount');
SELECT is((SELECT source FROM public.affiliate_account_movements WHERE external_ref = 'payment:mercadopago:mp-l1-1'),
  'mercadopago', 'happy: payment source = mercadopago');
SELECT ok((SELECT receipt_number IS NOT NULL FROM public.affiliate_account_movements WHERE external_ref = 'payment:mercadopago:mp-l1-1'),
  'happy: payment movement got a receipt number');
SELECT is((SELECT created_at FROM public.affiliate_account_movements WHERE external_ref = 'payment:mercadopago:mp-l1-1'),
  '2026-09-20T12:00:00Z'::timestamptz, 'happy: payment movement is dated at paid_at');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  'active', 'happy: plan_status active');
SELECT is((SELECT paid_months_snapshot || ':' || bonus_months_snapshot || ':' || monthly_cost_snapshot || ':' || granted_quota
  FROM public.family_coverage_windows WHERE subject_profile_id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  '1:1:50000.00:8', 'happy: coverage window opened with plan snapshots');
SELECT ok((SELECT paid_through > now() + interval '1 month 27 days' AND paid_through < now() + interval '2 months 1 day'
  FROM public.family_coverage_windows WHERE subject_profile_id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  'happy: paid_through = now + (paid + bonus) months');
SELECT ok((SELECT ledger_posted_at IS NOT NULL FROM public.adhesion_requests WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  'happy: ledger_posted_at set');
SELECT is((SELECT balance FROM public.affiliate_account_balances WHERE entity_id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  -50000.00::numeric, 'happy: balance = charge - payment (overpayment shows as credit)');

-- ── Idempotent second call ──────────────────────────────────────────────────
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000001')) ->> 'reason', 'already_posted', 'second call -> already_posted');
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000001')) ->> 'posted', 'false', 'second call -> posted=false');
SELECT is((SELECT count(*)::int FROM public.affiliate_account_movements WHERE entity_id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  2, 'second call added no movements');
SELECT is((SELECT count(*)::int FROM public.invoices WHERE entity_id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  1, 'second call added no invoice');
SELECT is((SELECT count(*)::int FROM public.family_coverage_windows WHERE subject_profile_id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  1, 'second call added no window');

-- ── Partial payment leaves the invoice issued ───────────────────────────────
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000004')) ->> 'posted', 'true', 'partial: posted=true');
SELECT is((SELECT status FROM public.invoices WHERE entity_id = 'b1b1b1b1-0000-0000-0000-000000000004'),
  'issued', 'partial: invoice stays issued');
SELECT is((SELECT balance FROM public.affiliate_account_balances WHERE entity_id = 'b1b1b1b1-0000-0000-0000-000000000004'),
  20000.00::numeric, 'partial: balance = 20000 outstanding');

-- ── Existing window is not extended ─────────────────────────────────────────
SELECT is((public.post_adhesion_checkout_payment('c1c1c1c1-0000-0000-0000-000000000005')) ->> 'posted', 'true', 'window: posted=true');
SELECT is((SELECT paid_through FROM public.family_coverage_windows WHERE subject_profile_id = 'b1b1b1b1-0000-0000-0000-000000000005'),
  '2026-03-01T00:00:00Z'::timestamptz, 'window: existing paid_through untouched');
SELECT is((SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = 'b1b1b1b1-0000-0000-0000-000000000005'),
  1, 'window: existing snapshot untouched');
SELECT is((SELECT count(*)::int FROM public.family_coverage_windows WHERE subject_profile_id = 'b1b1b1b1-0000-0000-0000-000000000005'),
  1, 'window: still exactly one window');

-- ── Write protection on the new columns ─────────────────────────────────────
SET LOCAL ROLE anon;
UPDATE public.adhesion_requests SET mp_paid_amount = 1, ledger_posted_at = NULL
  WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001';
RESET ROLE;
SELECT is((SELECT mp_paid_amount FROM public.adhesion_requests WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  100000.00::numeric, 'anon update leaves mp_paid_amount untouched');
SELECT ok((SELECT ledger_posted_at IS NOT NULL FROM public.adhesion_requests WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  'anon update leaves ledger_posted_at untouched');

SET LOCAL ROLE anon;
INSERT INTO public.adhesion_requests
  (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality,
   titular_neighborhood, titular_email, titular_phone, titular_civil_status, payment_method, signature_base64,
   mp_paid_amount, ledger_posted_at)
VALUES
  ('c1c1c1c1-0000-0000-0000-000000000009', 'Forger', '31000009', '1980-01-01', 'Calle 1', 'Loc',
   'Barrio', 'f@example.com', '1155559999', 'single', 'cash', 'sig', 999, now());
RESET ROLE;
SELECT is((SELECT coalesce(mp_paid_amount::text, '') || coalesce(ledger_posted_at::text, '')
  FROM public.adhesion_requests WHERE id = 'c1c1c1c1-0000-0000-0000-000000000009'),
  '', 'anon insert cannot set mp_paid_amount or ledger_posted_at');

SELECT * FROM finish();
ROLLBACK;
