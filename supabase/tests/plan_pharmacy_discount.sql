-- pgTAP tests for the plan-driven pharmacy discount (odd/tasks/plan-pharmacy-discount.md, T1, S1-S4).
-- Self-contained: BEGIN ... ROLLBACK.
--
-- Fixture UUID registry:
--   a7..01  plan 25%            a7..02  plan 0%
--   b7..01  patient, plan 25%, active
--   b7..02  patient, plan 0%
--   b7..03  patient, no plan
--   b7..04  patient, plan 25%, suspended
--   b7..05  titular of group c7..01, plan 25%
--   b7..06  family-group profile without its own plan (group c7..01)
--   b7..07  patient, plan 25%, profile inactive
--   d7..01  product, price 1000

BEGIN;
SELECT no_plan();

-- ── Schema (S2, S3) ─────────────────────────────────────────────────────────
SELECT has_column('public', 'plans', 'pharmacy_discount_percent', 'plans has pharmacy_discount_percent');
SELECT col_not_null('public', 'plans', 'pharmacy_discount_percent', 'pharmacy_discount_percent is NOT NULL');
SELECT col_default_is('public', 'plans', 'pharmacy_discount_percent', '40', 'new plans start at 40%');

-- ── Fixtures (owner role) ───────────────────────────────────────────────────
INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited, pharmacy_discount_percent)
VALUES
  ('a7a7a7a7-0000-0000-0000-000000000001', 'Disc 25', 1000, 0, 4, 1, 0, true, 25),
  ('a7a7a7a7-0000-0000-0000-000000000002', 'Disc 0', 1000, 0, 4, 1, 0, true, 0);

SELECT throws_ok(
  $$UPDATE public.plans SET pharmacy_discount_percent = 101 WHERE id = 'a7a7a7a7-0000-0000-0000-000000000001'$$,
  '23514', NULL, 'a percent above 100 is rejected');
SELECT throws_ok(
  $$UPDATE public.plans SET pharmacy_discount_percent = -1 WHERE id = 'a7a7a7a7-0000-0000-0000-000000000001'$$,
  '23514', NULL, 'a negative percent is rejected');

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', ('b7b7b7b7-0000-0000-0000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'disc' || n || '@test.local', '', now(), now(), now()
FROM generate_series(1, 7) AS n;

INSERT INTO public.profiles (id, role, full_name, plan_id, plan_status, is_active)
VALUES
  ('b7b7b7b7-0000-0000-0000-000000000001', 'patient', 'P25', 'a7a7a7a7-0000-0000-0000-000000000001', 'active', true),
  ('b7b7b7b7-0000-0000-0000-000000000002', 'patient', 'P0', 'a7a7a7a7-0000-0000-0000-000000000002', 'active', true),
  ('b7b7b7b7-0000-0000-0000-000000000003', 'patient', 'PNone', NULL, 'active', true),
  ('b7b7b7b7-0000-0000-0000-000000000004', 'patient', 'PSusp', 'a7a7a7a7-0000-0000-0000-000000000001', 'suspended', true),
  ('b7b7b7b7-0000-0000-0000-000000000005', 'patient', 'PTitular', 'a7a7a7a7-0000-0000-0000-000000000001', 'active', true),
  ('b7b7b7b7-0000-0000-0000-000000000006', 'patient', 'PMember', NULL, 'active', true),
  ('b7b7b7b7-0000-0000-0000-000000000007', 'patient', 'PInactive', 'a7a7a7a7-0000-0000-0000-000000000001', 'active', false)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, plan_id = EXCLUDED.plan_id,
  plan_status = EXCLUDED.plan_status, is_active = EXCLUDED.is_active;

INSERT INTO public.family_groups (id, primary_affiliate_id, name)
VALUES ('c7c7c7c7-0000-0000-0000-000000000001', 'b7b7b7b7-0000-0000-0000-000000000005', 'Familia PTitular');
UPDATE public.profiles SET family_group_id = 'c7c7c7c7-0000-0000-0000-000000000001'
WHERE id IN ('b7b7b7b7-0000-0000-0000-000000000005', 'b7b7b7b7-0000-0000-0000-000000000006');

INSERT INTO public.pharmacy_products (id, name, active_ingredient, presentation, laboratory, price)
VALUES ('d7d7d7d7-0000-0000-0000-000000000001', 'Disc Product', 'X', 'Caja', 'Lab', 1000);
INSERT INTO public.pharmacy_inventory (product_id, batch_number, expiration_date, stock_quantity)
VALUES ('d7d7d7d7-0000-0000-0000-000000000001', 'L1', current_date + 365, 100);

-- ── Resolver (S4) ───────────────────────────────────────────────────────────
SELECT is(public.pharmacy_discount_percent_for('b7b7b7b7-0000-0000-0000-000000000001'), 25::numeric, 'active plan: its percent');
SELECT is(public.pharmacy_discount_percent_for('b7b7b7b7-0000-0000-0000-000000000002'), 0::numeric, 'plan at 0%: no discount');
SELECT is(public.pharmacy_discount_percent_for('b7b7b7b7-0000-0000-0000-000000000003'), 0::numeric, 'no plan: 0%');
SELECT is(public.pharmacy_discount_percent_for('b7b7b7b7-0000-0000-0000-000000000004'), 0::numeric, 'suspended plan: 0%');
SELECT is(public.pharmacy_discount_percent_for('b7b7b7b7-0000-0000-0000-000000000006'), 25::numeric, 'family profile without a plan: the titular''s percent');
SELECT is(public.pharmacy_discount_percent_for('b7b7b7b7-0000-0000-0000-000000000007'), 0::numeric, 'inactive profile: 0%');
SELECT is(public.pharmacy_discount_percent_for('b7b7b7b7-0000-0000-0000-0000000000ff'), 0::numeric, 'unknown profile: 0%');

-- ── Grants ──────────────────────────────────────────────────────────────────
SELECT ok(NOT has_function_privilege('authenticated', 'public.pharmacy_discount_percent_for(uuid)', 'EXECUTE'),
  'authenticated cannot call the resolver for an arbitrary profile');
SELECT ok(has_function_privilege('authenticated', 'public.get_my_pharmacy_discount_percent()', 'EXECUTE'),
  'authenticated can read its own percent');
SELECT ok(NOT has_function_privilege('anon', 'public.get_my_pharmacy_discount_percent()', 'EXECUTE'),
  'anon cannot read a percent');

-- ── As the patients (S1, S4) ────────────────────────────────────────────────
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"b7b7b7b7-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is(public.get_my_pharmacy_discount_percent(), 25::numeric, 'get_my_pharmacy_discount_percent returns the caller''s plan percent');
SELECT lives_ok($$SELECT public.create_pharmacy_order('b7b7b7b7-0000-0000-0000-000000000001',
  '[{"product_id":"d7d7d7d7-0000-0000-0000-000000000001","quantity":2}]'::jsonb, NULL, 'Calle 1')$$, 'order with a 25% plan');

SELECT set_config('request.jwt.claims', '{"sub":"b7b7b7b7-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is(public.get_my_pharmacy_discount_percent(), 0::numeric, 'no plan: get_my returns 0');
SELECT lives_ok($$SELECT public.create_pharmacy_order('b7b7b7b7-0000-0000-0000-000000000003',
  '[{"product_id":"d7d7d7d7-0000-0000-0000-000000000001","quantity":1}]'::jsonb, NULL, 'Calle 3')$$, 'order without a plan');

SELECT set_config('request.jwt.claims', '{"sub":"b7b7b7b7-0000-0000-0000-000000000006","role":"authenticated"}', true);
SELECT lives_ok($$SELECT public.create_pharmacy_order('b7b7b7b7-0000-0000-0000-000000000006',
  '[{"product_id":"d7d7d7d7-0000-0000-0000-000000000001","quantity":1}]'::jsonb, NULL, 'Calle 6')$$, 'order by a family profile');

RESET ROLE;

SELECT results_eq(
  $$SELECT subtotal, coverage_discount, total FROM public.pharmacy_orders WHERE patient_id = 'b7b7b7b7-0000-0000-0000-000000000001'$$,
  $$VALUES (2000.00::numeric(10,2), 500.00::numeric(10,2), 1500.00::numeric(10,2))$$,
  '25% plan: discount 500 on 2000');
SELECT results_eq(
  $$SELECT subtotal, coverage_discount, total FROM public.pharmacy_orders WHERE patient_id = 'b7b7b7b7-0000-0000-0000-000000000003'$$,
  $$VALUES (1000.00::numeric(10,2), 0.00::numeric(10,2), 1000.00::numeric(10,2))$$,
  'no plan: no discount');
SELECT results_eq(
  $$SELECT coverage_discount, total FROM public.pharmacy_orders WHERE patient_id = 'b7b7b7b7-0000-0000-0000-000000000006'$$,
  $$VALUES (250.00::numeric(10,2), 750.00::numeric(10,2))$$,
  'family profile: the titular''s 25%');
SELECT is((SELECT stock_quantity FROM public.pharmacy_inventory WHERE product_id = 'd7d7d7d7-0000-0000-0000-000000000001'), 96,
  'stock still deducted at checkout (2 + 1 + 1)');

SELECT * FROM finish();
ROLLBACK;
