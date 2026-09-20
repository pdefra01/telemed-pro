-- pgTAP tests for 20260920030000_identity_guards.sql
-- (odd/new-plans-pricing, T2). Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

-- ================================================================
-- 1. normalize_ar_phone mirrors server/whatsapp.js normalizeArgentinePhone
-- ================================================================
SELECT is(public.normalize_ar_phone('+54 9 11 5555-1234'), '5491155551234', 'international format');
SELECT is(public.normalize_ar_phone('011 15 5555 1234'), '5491155551234', 'national format with 0 and 15');
SELECT is(public.normalize_ar_phone('1155551234'), '5491155551234', 'bare 10-digit number');
SELECT is(public.normalize_ar_phone('0054 9 11 5555 1234'), '5491155551234', '00 international prefix');
SELECT is(public.normalize_ar_phone('+1 415 555 2671'), '14155552671', 'foreign numbers are kept as digits');
SELECT is(public.normalize_ar_phone('abc'), NULL, 'no digits gives NULL');
SELECT is(public.normalize_ar_phone(NULL), NULL, 'NULL gives NULL');
SELECT is(public.normalize_ar_phone('12345'), NULL, 'too short gives NULL');

-- ================================================================
-- Fixtures: an Individual titular and a Familiar titular
-- ================================================================
INSERT INTO public.profiles (id, role, full_name, plan_id, dni, phone) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'patient', 'Individual Titular',
   (SELECT id FROM public.plans WHERE name = 'Plan Individual'), '30111222', '+54 9 11 5555-1234'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'patient', 'Familiar Titular',
   (SELECT id FROM public.plans WHERE name = 'Plan Familiar'), '30111333', '11 6666 0000');

INSERT INTO public.family_groups (id, primary_affiliate_id, name) VALUES
  ('b1b1b1b1-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', 'Individual group'),
  ('b1b1b1b1-0000-0000-0000-000000000002', 'a1a1a1a1-0000-0000-0000-000000000002', 'Familiar group');

-- ================================================================
-- 2. Titular phone is unique (normalized)
-- ================================================================
SELECT throws_ok(
  $$INSERT INTO public.profiles (id, role, full_name, phone)
    VALUES ('a1a1a1a1-0000-0000-0000-000000000003', 'patient', 'Same phone other format', '011 15 5555 1234')$$,
  '23505', NULL, 'the same phone written another way is rejected');

SELECT lives_ok(
  $$INSERT INTO public.profiles (id, role, full_name, phone)
    VALUES ('a1a1a1a1-0000-0000-0000-000000000004', 'patient', 'Different phone', '11 7777 0000')$$,
  'a different phone is accepted');

SELECT lives_ok(
  $$INSERT INTO public.profiles (id, role, full_name) VALUES ('a1a1a1a1-0000-0000-0000-000000000005', 'patient', 'No phone A'),
                                                            ('a1a1a1a1-0000-0000-0000-000000000006', 'patient', 'No phone B')$$,
  'profiles without a phone never collide');

-- ================================================================
-- 3. A DNI / CUIL belongs to one person in one place only
-- ================================================================
SELECT throws_ok(
  $$INSERT INTO public.profiles (id, role, full_name, dni)
    VALUES ('a1a1a1a1-0000-0000-0000-000000000007', 'patient', 'Dup dni', '30.111.222')$$,
  '23505', NULL, 'a profile cannot reuse another profile DNI (formatting ignored)');

SELECT throws_ok(
  $$INSERT INTO public.family_members (family_group_id, full_name, relation, dni)
    VALUES ('b1b1b1b1-0000-0000-0000-000000000002', 'Member with titular DNI', 'hijo/a', '30111222')$$,
  '23505', NULL, 'a family member cannot use the DNI of an affiliate in another plan');

SELECT lives_ok(
  $$INSERT INTO public.family_members (id, family_group_id, full_name, relation, dni, cuil)
    VALUES ('c1c1c1c1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-000000000002', 'Member 1', 'hijo/a', '40000001', '20-40000001-5')$$,
  'a member with a fresh DNI/CUIL is accepted');

SELECT throws_ok(
  $$INSERT INTO public.family_members (family_group_id, full_name, relation, dni)
    VALUES ('b1b1b1b1-0000-0000-0000-000000000001', 'Same DNI other group', 'hijo/a', '40.000.001')$$,
  '23505', NULL, 'a DNI already in one family group cannot join another');

SELECT throws_ok(
  $$INSERT INTO public.family_members (family_group_id, full_name, relation, cuil)
    VALUES ('b1b1b1b1-0000-0000-0000-000000000001', 'Same CUIL other group', 'hijo/a', '20400000015')$$,
  '23505', NULL, 'a CUIL already in one family group cannot join another');

SELECT throws_ok(
  $$INSERT INTO public.profiles (id, role, full_name, dni)
    VALUES ('a1a1a1a1-0000-0000-0000-000000000008', 'patient', 'Titular with member DNI', '40000001')$$,
  '23505', NULL, 'a profile cannot take the DNI of an existing family member');

SELECT throws_ok(
  $$UPDATE public.profiles SET dni = '30111222' WHERE id = 'a1a1a1a1-0000-0000-0000-000000000002'$$,
  '23505', NULL, 'updating a DNI to an existing one is rejected');

SELECT lives_ok(
  $$UPDATE public.profiles SET full_name = 'Renamed Titular' WHERE id = 'a1a1a1a1-0000-0000-0000-000000000002'$$,
  'unrelated updates on a profile are not blocked by its own DNI');

-- ================================================================
-- 4. Family size limit follows the titular plan
-- ================================================================
SELECT throws_ok(
  $$INSERT INTO public.family_members (family_group_id, full_name, relation, dni)
    VALUES ('b1b1b1b1-0000-0000-0000-000000000001', 'Member of Individual', 'hijo/a', '40000010')$$,
  'P0001', NULL, 'an Individual plan admits no additional members');

INSERT INTO public.family_members (family_group_id, full_name, relation, dni) VALUES
  ('b1b1b1b1-0000-0000-0000-000000000002', 'Member 2', 'hijo/a', '40000002'),
  ('b1b1b1b1-0000-0000-0000-000000000002', 'Member 3', 'hijo/a', '40000003'),
  ('b1b1b1b1-0000-0000-0000-000000000002', 'Member 4', 'hijo/a', '40000004');

SELECT throws_ok(
  $$INSERT INTO public.family_members (family_group_id, full_name, relation, dni)
    VALUES ('b1b1b1b1-0000-0000-0000-000000000002', 'Member 5', 'hijo/a', '40000005')$$,
  'P0001', NULL, 'a Familiar plan admits titular + 4, the fifth member is rejected');

-- ================================================================
-- 5. Pending adhesion requests: one per phone
-- ================================================================
SELECT has_index('public', 'adhesion_requests', 'uq_adhesion_pending_titular_phone', 'pending adhesion phone is unique');

SELECT * FROM finish();
ROLLBACK;
