-- pgTAP tests for 20260920020000_new_plan_catalog.sql
-- (odd/new-plans-pricing, T1). Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

-- ================================================================
-- 1. The five sellable plans exist with the agreed prices
-- ================================================================
SELECT is((SELECT count(*)::int FROM public.plans WHERE is_offered), 5, 'exactly 5 plans are offered');

SELECT is((SELECT monthly_cost FROM public.plans WHERE name = 'Plan Individual'), 14999.00::numeric, 'Individual costs 14.999');
SELECT is((SELECT monthly_cost FROM public.plans WHERE name = 'Plan Familiar'), 49999.00::numeric, 'Familiar standard costs 49.999');
SELECT is((SELECT monthly_cost FROM public.plans WHERE name = 'Plan Familiar Débito Tarjeta'), 39999.00::numeric, 'Familiar card debit costs 39.999');
SELECT is((SELECT monthly_cost FROM public.plans WHERE name = 'Plan Familiar Semestral'), 39999.00::numeric, 'Semester monthly price is 39.999');
SELECT is((SELECT monthly_cost FROM public.plans WHERE name = 'Plan Familiar Anual'), 39999.00::numeric, 'Annual monthly price is 39.999');

-- Prepaid totals = monthly_cost x paid_months, with the gift months on top.
SELECT is((SELECT monthly_cost * paid_months FROM public.plans WHERE name = 'Plan Familiar Semestral'), 239994.00::numeric, 'semester total is 239.994');
SELECT is((SELECT paid_months + bonus_months FROM public.plans WHERE name = 'Plan Familiar Semestral'), 7, 'semester covers 6 + 1 months');
SELECT is((SELECT monthly_cost * paid_months FROM public.plans WHERE name = 'Plan Familiar Anual'), 479988.00::numeric, 'annual total is 479.988');
SELECT is((SELECT paid_months + bonus_months FROM public.plans WHERE name = 'Plan Familiar Anual'), 14, 'annual covers 12 + 2 months');

-- Month-to-month plans are billed one month at a time, no gift months.
SELECT is(
  (SELECT count(*)::int FROM public.plans
   WHERE name IN ('Plan Individual', 'Plan Familiar', 'Plan Familiar Débito Tarjeta')
     AND paid_months = 1 AND bonus_months = 0),
  3, 'month-to-month plans have paid_months = 1 and no bonus');

-- ================================================================
-- 2. Coverage and consultations
-- ================================================================
SELECT is((SELECT max_family_members FROM public.plans WHERE name = 'Plan Individual'), 0, 'Individual covers only the titular');
SELECT is(
  (SELECT count(*)::int FROM public.plans WHERE plan_kind = 'familiar' AND is_offered AND max_family_members = 4),
  4, 'every Familiar plan allows titular + 4');
SELECT is((SELECT count(*)::int FROM public.plans WHERE is_offered AND is_unlimited), 5, 'every offered plan has unlimited consultations');

-- ================================================================
-- 3. Kind / payment option mapping and advisor commissions
-- ================================================================
SELECT is((SELECT plan_kind || '/' || payment_option FROM public.plans WHERE name = 'Plan Individual'), 'individual/standard', 'Individual mapping');
SELECT is((SELECT plan_kind || '/' || payment_option FROM public.plans WHERE name = 'Plan Familiar'), 'familiar/standard', 'Familiar standard mapping');
SELECT is((SELECT plan_kind || '/' || payment_option FROM public.plans WHERE name = 'Plan Familiar Débito Tarjeta'), 'familiar/card_debit', 'card debit mapping');
SELECT is((SELECT plan_kind || '/' || payment_option FROM public.plans WHERE name = 'Plan Familiar Semestral'), 'familiar/prepaid_6', 'semester mapping');
SELECT is((SELECT plan_kind || '/' || payment_option FROM public.plans WHERE name = 'Plan Familiar Anual'), 'familiar/prepaid_12', 'annual mapping');

SELECT is((SELECT advisor_commission_amount FROM public.plans WHERE name = 'Plan Individual'), 7500.00::numeric, 'Individual commission 7.500');
SELECT is((SELECT advisor_commission_amount FROM public.plans WHERE name = 'Plan Familiar'), 25000.00::numeric, 'Familiar commission 25.000');
SELECT is((SELECT advisor_commission_amount FROM public.plans WHERE name = 'Plan Familiar Débito Tarjeta'), 25000.00::numeric, 'card debit commission 25.000');
SELECT is((SELECT advisor_commission_amount FROM public.plans WHERE name = 'Plan Familiar Semestral'), 30000.00::numeric, 'semester commission 30.000 (25 + 5)');
SELECT is((SELECT advisor_commission_amount FROM public.plans WHERE name = 'Plan Familiar Anual'), 35000.00::numeric, 'annual commission 35.000 (25 + 10)');

-- ================================================================
-- 4. Default plan and the legacy plan
-- ================================================================
SELECT is((SELECT count(*)::int FROM public.plans WHERE is_default), 1, 'exactly one default plan');
SELECT is((SELECT name FROM public.plans WHERE is_default), 'Plan Familiar', 'the default fallback plan is Plan Familiar');
SELECT is((SELECT count(*)::int FROM public.plans WHERE name = 'Plan Familiar Medinex' AND is_offered), 0, 'the legacy plan is not offered');

-- ================================================================
-- 5. Constraints: one offered plan per (kind, option); valid enum values
-- ================================================================
SELECT lives_ok(
  $$INSERT INTO public.plans (name, monthly_cost, plan_kind, payment_option, is_offered)
    VALUES ('Individual v2 offered', 16999, 'individual', 'standard', true)$$,
  'offering a new version of the same kind+option is accepted');

SELECT is(
  (SELECT string_agg(name, ',') FROM public.plans WHERE plan_kind = 'individual' AND payment_option = 'standard' AND is_offered),
  'Individual v2 offered', 'the new version replaces the previous offered plan');

SELECT is((SELECT is_offered FROM public.plans WHERE name = 'Plan Individual'), false, 'the previous version is withdrawn, not deleted');

SELECT is((SELECT count(*)::int FROM public.plans WHERE is_offered), 5, 'there are still exactly 5 offered plans');

SELECT lives_ok(
  $$INSERT INTO public.plans (name, monthly_cost, plan_kind, payment_option, is_offered)
    VALUES ('Individual next version', 16999, 'individual', 'standard', false)$$,
  'a non-offered newer version of the same option can coexist');

SELECT throws_ok(
  $$INSERT INTO public.plans (name, monthly_cost, plan_kind, payment_option) VALUES ('Bad kind', 1, 'gold', 'standard')$$,
  '23514', NULL, 'plan_kind only accepts individual / familiar');

SELECT throws_ok(
  $$INSERT INTO public.plans (name, monthly_cost, plan_kind, payment_option) VALUES ('Bad option', 1, 'familiar', 'bitcoin')$$,
  '23514', NULL, 'payment_option only accepts the known options');

-- ================================================================
-- 6. A plan in use keeps its terms (price changes = new plan versions)
-- ================================================================
INSERT INTO public.profiles (id, role, full_name, plan_id)
VALUES ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'patient', 'Plan In Use Test',
        (SELECT id FROM public.plans WHERE name = 'Plan Familiar'));

SELECT throws_ok(
  $$UPDATE public.plans SET monthly_cost = 55555 WHERE name = 'Plan Familiar'$$,
  'P0001', NULL, 'cannot change the price of a plan assigned to an affiliate');

SELECT throws_ok(
  $$UPDATE public.plans SET paid_months = 3 WHERE name = 'Plan Familiar'$$,
  'P0001', NULL, 'cannot change the paid months of a plan in use');

SELECT throws_ok(
  $$UPDATE public.plans SET max_family_members = 9 WHERE name = 'Plan Familiar'$$,
  'P0001', NULL, 'cannot change the family size of a plan in use');

SELECT lives_ok(
  $$UPDATE public.plans SET is_offered = false WHERE name = 'Plan Familiar'$$,
  'a plan in use can still be withdrawn from sale');

SELECT lives_ok(
  $$UPDATE public.plans SET monthly_cost = 17999 WHERE name = 'Individual next version'$$,
  'the price of a plan nobody uses can still be edited');

SELECT * FROM finish();
ROLLBACK;
