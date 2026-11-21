-- pgTAP tests: a sign-up checkout payment never reactivates a cancelled or
-- suspended affiliate (odd/tasks/cancelled-affiliate-checkout-payment.md, S2).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   d0..  plan (monthly 50000, paid 1, bonus 1)
--   d1..01  cancelled affiliate (plan_status cancelled, cancellation applied)   request d2..01
--   d1..02  scheduled cancellation (plan_status active, effective in future)   request d2..02
--   d1..03  suspended affiliate                                                request d2..03
--   d1..04  regular affiliate (plan_status pending)                            request d2..04

BEGIN;
SELECT no_plan();

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'd1d1d1d1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cxl-done@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1d1d1d1-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cxl-sched@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1d1d1d1-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cxl-susp@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1d1d1d1-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'cxl-regular@test.local', '', now(), now(), now());

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES ('d0d0d0d0-0000-0000-0000-000000000000', 'Cxl Plan', 50000.00, 4, 0, 1, 1, false);

INSERT INTO public.profiles (id, role, full_name, plan_id, plan_status, is_active)
VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'patient', 'Cxl Done', 'd0d0d0d0-0000-0000-0000-000000000000', 'cancelled', false),
  ('d1d1d1d1-0000-0000-0000-000000000002', 'patient', 'Cxl Scheduled', 'd0d0d0d0-0000-0000-0000-000000000000', 'active', true),
  ('d1d1d1d1-0000-0000-0000-000000000003', 'patient', 'Cxl Suspended', 'd0d0d0d0-0000-0000-0000-000000000000', 'suspended', false),
  ('d1d1d1d1-0000-0000-0000-000000000004', 'patient', 'Cxl Regular', 'd0d0d0d0-0000-0000-0000-000000000000', 'pending', true)
ON CONFLICT (id) DO UPDATE SET plan_id = EXCLUDED.plan_id, full_name = EXCLUDED.full_name,
  plan_status = EXCLUDED.plan_status, is_active = EXCLUDED.is_active;

INSERT INTO public.affiliate_cancellations (profile_id, titular_id, requested_at, effective_at, applied_at)
VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'd1d1d1d1-0000-0000-0000-000000000001', now() - interval '2 days', now() - interval '1 day', now() - interval '1 day'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 'd1d1d1d1-0000-0000-0000-000000000002', now() - interval '1 day', now() + interval '20 days', NULL);

CREATE OR REPLACE FUNCTION pg_temp.mk_request(p_id UUID, p_dni TEXT, p_profile UUID, p_pay_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.adhesion_requests
    (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality,
     titular_neighborhood, titular_email, titular_phone, titular_civil_status, payment_method, signature_base64,
     status, approved_profile_id, payment_status, mp_payment_id, mp_paid_amount, paid_at)
  VALUES
    (p_id, 'Cxl Titular', p_dni, '1980-01-01', 'Calle 1', 'Loc',
     'Barrio', p_dni || '@example.com', '1155551234', 'single', 'cash', 'sig',
     'approved', p_profile, 'approved', p_pay_id, 50000.00, now());
END;
$$;

SELECT pg_temp.mk_request('d2d2d2d2-0000-0000-0000-000000000001', '32000001', 'd1d1d1d1-0000-0000-0000-000000000001', 'mp-cxl-1');
SELECT pg_temp.mk_request('d2d2d2d2-0000-0000-0000-000000000002', '32000002', 'd1d1d1d1-0000-0000-0000-000000000002', 'mp-cxl-2');
SELECT pg_temp.mk_request('d2d2d2d2-0000-0000-0000-000000000003', '32000003', 'd1d1d1d1-0000-0000-0000-000000000003', 'mp-cxl-3');
SELECT pg_temp.mk_request('d2d2d2d2-0000-0000-0000-000000000004', '32000004', 'd1d1d1d1-0000-0000-0000-000000000004', 'mp-cxl-4');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
CREATE TEMP TABLE results AS
SELECT r.id AS request_id, public.post_adhesion_checkout_payment(r.id) AS res
FROM (VALUES ('d2d2d2d2-0000-0000-0000-000000000001'::uuid), ('d2d2d2d2-0000-0000-0000-000000000002'::uuid),
             ('d2d2d2d2-0000-0000-0000-000000000003'::uuid), ('d2d2d2d2-0000-0000-0000-000000000004'::uuid)) AS r(id);

CREATE OR REPLACE FUNCTION pg_temp.res(p_request UUID) RETURNS JSONB LANGUAGE sql AS $$
  SELECT res FROM results WHERE request_id = p_request
$$;
CREATE OR REPLACE FUNCTION pg_temp.window_count(p_profile UUID) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT count(*) FROM public.family_coverage_windows WHERE subject_profile_id = p_profile
$$;
CREATE OR REPLACE FUNCTION pg_temp.payment_count(p_profile UUID) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT count(*) FROM public.affiliate_account_movements WHERE entity_id = p_profile AND type = 'payment'
$$;

-- ── S2: cancelled affiliate: payment recorded, stays cancelled, no coverage ──
SELECT is(pg_temp.res('d2d2d2d2-0000-0000-0000-000000000001')->>'posted', 'true', 'cancelled: the payment is posted');
SELECT is(pg_temp.res('d2d2d2d2-0000-0000-0000-000000000001')->>'reason', 'posted', 'cancelled: reason stays posted');
SELECT is(pg_temp.res('d2d2d2d2-0000-0000-0000-000000000001')->>'deferred_reason', 'affiliate_cancelled', 'cancelled: deferred_reason affiliate_cancelled');
SELECT is(pg_temp.payment_count('d1d1d1d1-0000-0000-0000-000000000001'), 1::bigint, 'cancelled: one payment movement recorded');
SELECT is((SELECT status FROM public.invoices WHERE entity_id = 'd1d1d1d1-0000-0000-0000-000000000001'), 'paid', 'cancelled: invoice marked paid');
SELECT isnt((SELECT ledger_posted_at FROM public.adhesion_requests WHERE id = 'd2d2d2d2-0000-0000-0000-000000000001'), NULL, 'cancelled: ledger_posted_at set');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'd1d1d1d1-0000-0000-0000-000000000001'), 'cancelled', 'cancelled: plan_status stays cancelled');
SELECT is((SELECT is_active FROM public.profiles WHERE id = 'd1d1d1d1-0000-0000-0000-000000000001'), false, 'cancelled: login stays blocked');
SELECT is(pg_temp.window_count('d1d1d1d1-0000-0000-0000-000000000001'), 0::bigint, 'cancelled: no coverage window opened');

-- ── S2: scheduled cancellation: recorded, status untouched, no coverage ─────
SELECT is(pg_temp.res('d2d2d2d2-0000-0000-0000-000000000002')->>'deferred_reason', 'affiliate_cancelled', 'scheduled: deferred_reason affiliate_cancelled');
SELECT is(pg_temp.payment_count('d1d1d1d1-0000-0000-0000-000000000002'), 1::bigint, 'scheduled: one payment movement recorded');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'd1d1d1d1-0000-0000-0000-000000000002'), 'active', 'scheduled: plan_status unchanged');
SELECT is(pg_temp.window_count('d1d1d1d1-0000-0000-0000-000000000002'), 0::bigint, 'scheduled: no coverage window opened');

-- ── S2: suspended affiliate: recorded, stays suspended (webhook rule) ───────
SELECT is(pg_temp.res('d2d2d2d2-0000-0000-0000-000000000003')->>'deferred_reason', 'affiliate_suspended', 'suspended: deferred_reason affiliate_suspended');
SELECT is(pg_temp.payment_count('d1d1d1d1-0000-0000-0000-000000000003'), 1::bigint, 'suspended: one payment movement recorded');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'd1d1d1d1-0000-0000-0000-000000000003'), 'suspended', 'suspended: plan_status stays suspended');
SELECT is(pg_temp.window_count('d1d1d1d1-0000-0000-0000-000000000003'), 1::bigint, 'suspended: coverage window still opened (webhook parity)');

-- ── S2: a replay for a cancelled affiliate changes nothing ──────────────────
SELECT is(public.post_adhesion_checkout_payment('d2d2d2d2-0000-0000-0000-000000000001')->>'reason', 'already_posted', 'cancelled: replay returns already_posted');
SELECT is(pg_temp.payment_count('d1d1d1d1-0000-0000-0000-000000000001'), 1::bigint, 'cancelled: replay adds no movement');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'd1d1d1d1-0000-0000-0000-000000000001'), 'cancelled', 'cancelled: replay keeps cancelled');

-- ── S2: a cancelled titular with a family group gets no group coverage ──────
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'd1d1d1d1-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'cxl-fam@test.local', '', now(), now(), now());
INSERT INTO public.profiles (id, role, full_name, plan_id, plan_status, is_active)
VALUES ('d1d1d1d1-0000-0000-0000-000000000005', 'patient', 'Cxl Fam', 'd0d0d0d0-0000-0000-0000-000000000000', 'cancelled', false)
ON CONFLICT (id) DO UPDATE SET plan_id = EXCLUDED.plan_id, plan_status = EXCLUDED.plan_status, is_active = EXCLUDED.is_active;
INSERT INTO public.family_groups (id, primary_affiliate_id, name)
VALUES ('d3d3d3d3-0000-0000-0000-000000000001', 'd1d1d1d1-0000-0000-0000-000000000005', 'Familia Cxl');
UPDATE public.profiles SET family_group_id = 'd3d3d3d3-0000-0000-0000-000000000001' WHERE id = 'd1d1d1d1-0000-0000-0000-000000000005';
INSERT INTO public.affiliate_cancellations (profile_id, titular_id, requested_at, effective_at, applied_at)
VALUES ('d1d1d1d1-0000-0000-0000-000000000005', 'd1d1d1d1-0000-0000-0000-000000000005', now() - interval '2 days', now() - interval '1 day', now() - interval '1 day');
SELECT pg_temp.mk_request('d2d2d2d2-0000-0000-0000-000000000005', '32000005', 'd1d1d1d1-0000-0000-0000-000000000005', 'mp-cxl-5');
SELECT is(public.post_adhesion_checkout_payment('d2d2d2d2-0000-0000-0000-000000000005')->>'deferred_reason', 'affiliate_cancelled', 'family: deferred_reason affiliate_cancelled');
SELECT is((SELECT count(*) FROM public.family_coverage_windows WHERE family_group_id = 'd3d3d3d3-0000-0000-0000-000000000001'), 0::bigint, 'family: no group coverage window opened');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'd1d1d1d1-0000-0000-0000-000000000005'), 'cancelled', 'family: titular stays cancelled');

-- ── Regression: a regular affiliate is still activated with coverage ────────
SELECT is(pg_temp.res('d2d2d2d2-0000-0000-0000-000000000004')->>'reason', 'posted', 'regular: posted');
SELECT ok(NOT (pg_temp.res('d2d2d2d2-0000-0000-0000-000000000004') ? 'deferred_reason'), 'regular: no deferred_reason');
SELECT is((SELECT plan_status FROM public.profiles WHERE id = 'd1d1d1d1-0000-0000-0000-000000000004'), 'active', 'regular: plan_status becomes active');
SELECT is(pg_temp.window_count('d1d1d1d1-0000-0000-0000-000000000004'), 1::bigint, 'regular: coverage window opened');

SELECT * FROM finish();
ROLLBACK;
