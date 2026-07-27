-- pgTAP suite: Mercado Pago DB foundation (Phase 1 / PR1)
-- Run with: supabase test db supabase/tests/mercadopago.sql --local
--
-- Covers (see design-appendix Testing Strategy, pgTAP row): I1-I10, R2, R8-R11,
-- R12/R13, R14, R17, R18 (lock-ordering proxy), R19, R21, R23, the full
-- authorization block (GRANT layer + in-body guard for all 7 functions), and
-- RLS self-scoping on both new tables plus the new `invoices` policy.
--
-- Scope note on concurrency (R8/R9/R18/R19/R22): pgTAP runs sequentially on a
-- single connection. Rows here test the STATE-MACHINE guarantee (what the
-- guard does when called twice in sequence with known prior state) — this is
-- exactly what the design's own Testing Strategy table assigns to the pgTAP
-- layer ("two claim_subscription_enrollment calls..." / "...twice..."). TRUE
-- overlapping-transaction concurrency is explicitly the job of Phase 3's
-- integration tests (tasks 3.11, 4.15, 4.16), not this suite.
--
-- Fixture UUID registry (all fixed literals, grouped by leading hex digit so
-- collisions are easy to spot):
--   00000000-...-000000000000  plan
--   11111111-...                I1  (month-anchor extension, 3 consecutive)
--   22222222-...-...221 / ...222  I7  (balance guard: block / grace_period)
--   33333333-...                I8  (no coverage window)
--   44444444-...                I9  (partial payment)
--   55555555-...                I10 (already-paid invoice, second distinct payment)
--   5a5a5a5a-...                 R-JD5 (already-paid invoice, profile reactivation on early-return path)
--   66666666-...                R17 (window_reset)
--   77777777-...                R12/R13 (dedup / redelivery)
--   88888888-...-...881 / ...882  RLS (affiliate A / affiliate B)
--   99999999-...                admin
--   aaaaaaaa-...                subscription-event tests
--   bbbbbbbb-...                enrollment RPC tests
--   dddddddd-...                Fix 1 (cumulative partial payments complete an invoice)
--   eeeeeeee-...                Fix 2 (cancelled invoice never resurrected to paid)
--   ffffffff-...-...0001/...0002  Fix 3 (shared family window extended once per period)
--   cccccccc-...                Fix 4 (renew_coverage_window resets last_extended_period)

BEGIN;
SELECT no_plan();

-- ================================================================
-- Fixtures: auth.users + profiles + one plan, shared by every group below.
-- ================================================================
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'i1@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222221', 'authenticated', 'authenticated', 'i7block@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'i7grace@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'i8@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'i9@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'i10@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a', 'authenticated', 'authenticated', 'rjd5@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'r17@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'r1213@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888881', 'authenticated', 'authenticated', 'rlsa@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888882', 'authenticated', 'authenticated', 'rlsb@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'admin@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'authenticated', 'authenticated', 'sublinked@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'authenticated', 'authenticated', 'enrollfresh@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'authenticated', 'authenticated', 'enrollstale@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'authenticated', 'authenticated', 'enrollauth@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'authenticated', 'authenticated', 'enrollrelease@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'fix1@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'fix2@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffff0001', 'authenticated', 'authenticated', 'fix3member1@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffff0002', 'authenticated', 'authenticated', 'fix3member2@test.local', '', now(), now(), now());

-- Inserting into auth.users above already auto-created a matching public.profiles
-- row per user via the repo's existing signup trigger — a plain INSERT here would
-- collide on the PK. UPDATE the auto-created rows instead (ON CONFLICT DO UPDATE
-- so this file stays idempotent if the trigger's shape ever changes).
INSERT INTO public.profiles (id, role, full_name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'patient', 'I1 Test Affiliate'),
  ('22222222-2222-2222-2222-222222222221', 'patient', 'I7 Block Affiliate'),
  ('22222222-2222-2222-2222-222222222222', 'patient', 'I7 Grace Affiliate'),
  ('33333333-3333-3333-3333-333333333333', 'patient', 'I8 No Window Affiliate'),
  ('44444444-4444-4444-4444-444444444444', 'patient', 'I9 Partial Affiliate'),
  ('55555555-5555-5555-5555-555555555555', 'patient', 'I10 Already Paid Affiliate'),
  ('5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a', 'patient', 'R-JD5 Already Paid Reactivation Affiliate'),
  ('66666666-6666-6666-6666-666666666666', 'patient', 'R17 Window Reset Affiliate'),
  ('77777777-7777-7777-7777-777777777777', 'patient', 'R12 R13 Dedup Affiliate'),
  ('88888888-8888-8888-8888-888888888881', 'patient', 'RLS Affiliate A'),
  ('88888888-8888-8888-8888-888888888882', 'patient', 'RLS Affiliate B'),
  ('99999999-9999-9999-9999-999999999999', 'admin',   'Admin Test User'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'patient', 'Subscription Events Affiliate'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'patient', 'Enroll Fresh Affiliate'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'patient', 'Enroll Stale Affiliate'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'patient', 'Enroll Authorized Affiliate'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'patient', 'Enroll Release Affiliate'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'patient', 'Fix 1 Cumulative Payment Affiliate'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'patient', 'Fix 2 Cancelled Invoice Affiliate'),
  ('ffffffff-ffff-ffff-ffff-ffffffff0001', 'patient', 'Fix 3 Family Member 1'),
  ('ffffffff-ffff-ffff-ffff-ffffffff0002', 'patient', 'Fix 3 Family Member 2')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
  -- The 'admin' row's UPDATE fires the pre-existing sync_user_role trigger,
  -- which populates public.user_roles(user_id, role) automatically — no
  -- manual user_roles insert needed for is_admin() to resolve true.

INSERT INTO public.plans (id, name, monthly_cost, bonified_consultations, max_family_members, paid_months, bonus_months, is_unlimited)
VALUES ('00000000-0000-0000-0000-000000000000', 'Plan Test', 50000.00, 4, 0, 1, 0, false);

SELECT pass('pgTAP harness is wired and runs against the local database');

-- ================================================================
-- Group: is_service_role()
-- ================================================================
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT ok(public.is_service_role(), 'is_service_role(): true when jwt claims role=service_role');

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT ok(NOT public.is_service_role(), 'is_service_role(): false when jwt claims role=authenticated');

SELECT set_config('request.jwt.claims', '', true);
SELECT ok(NOT public.is_service_role(), 'is_service_role(): false when jwt claims are absent');

-- ================================================================
-- Group: schema structural / behavioral checks
-- ================================================================
SELECT has_table('public', 'affiliate_payment_subscriptions', 'affiliate_payment_subscriptions exists');
SELECT has_table('public', 'mercadopago_events', 'mercadopago_events exists');
SELECT has_column('public', 'adhesion_requests', 'approved_profile_id', 'adhesion_requests.approved_profile_id exists');

-- CHECK on status (4 values only)
-- NOTE: pgTAP 3.36's 3-arg throws_ok(sql, code, description) wrapper here has a
-- genuine argument-order bug — it forwards the description into the 4-arg
-- form's errmsg slot instead of its description slot, so it silently requires
-- SQLERRM to equal the description verbatim (always false). Verified directly
-- against a plain `SELECT 1/0` before concluding this, not assumed. Using the
-- 4-arg form explicitly with errmsg=NULL (skip message matching, code only).
SELECT throws_ok(
  $$INSERT INTO public.affiliate_payment_subscriptions (profile_id, status) VALUES ('11111111-1111-1111-1111-111111111111', 'paused')$$,
  '23514'::char(5),
  NULL,
  'affiliate_payment_subscriptions.status rejects an unmodelled value (paused)'
);

-- Partial UNIQUE on mp_preapproval_id: two NULLs coexist, two equal non-NULLs conflict
INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id) VALUES ('11111111-1111-1111-1111-111111111111', 'pending', NULL);
INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id) VALUES ('22222222-2222-2222-2222-222222222221', 'pending', NULL);
SELECT is(
  (SELECT count(*)::int FROM public.affiliate_payment_subscriptions
    WHERE mp_preapproval_id IS NULL
      AND profile_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221')),
  2,
  'two affiliate_payment_subscriptions rows with mp_preapproval_id IS NULL coexist (partial index does not block NULLs)'
);
INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id) VALUES ('33333333-3333-3333-3333-333333333333', 'authorized', 'dup-preapproval-check');
SELECT throws_ok(
  $$INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id) VALUES ('44444444-4444-4444-4444-444444444444', 'authorized', 'dup-preapproval-check')$$,
  '23505'::char(5),
  NULL,
  'a second row with the same non-NULL mp_preapproval_id violates the partial UNIQUE index'
);
DELETE FROM public.affiliate_payment_subscriptions
 WHERE mp_preapproval_id = 'dup-preapproval-check' OR (mp_preapproval_id IS NULL AND profile_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221'));

-- mercadopago_events composite UNIQUE (event_type, mp_resource_id) — not bare mp_resource_id
SELECT has_column('public', 'mercadopago_events', 'resolution_state', 'mercadopago_events.resolution_state exists');
INSERT INTO public.mercadopago_events (event_type, mp_resource_id, outcome) VALUES ('schema_check_a', 'schema-check-res-1', 'final');
INSERT INTO public.mercadopago_events (event_type, mp_resource_id, outcome) VALUES ('schema_check_b', 'schema-check-res-1', 'final');
SELECT is(
  (SELECT count(*)::int FROM public.mercadopago_events WHERE mp_resource_id = 'schema-check-res-1'),
  2,
  'two mercadopago_events rows with the SAME mp_resource_id but DIFFERENT event_type both insert (composite key, not bare mp_resource_id)'
);
SELECT throws_ok(
  $$INSERT INTO public.mercadopago_events (event_type, mp_resource_id, outcome) VALUES ('schema_check_a', 'schema-check-res-1', 'final')$$,
  '23505'::char(5),
  NULL,
  'a second row with the SAME (event_type, mp_resource_id) violates the composite UNIQUE constraint'
);
SELECT throws_ok(
  $$INSERT INTO public.mercadopago_events (event_type, mp_resource_id, outcome, resolution_state) VALUES ('schema_check_c', 'schema-check-res-2', 'final', 'bogus_state')$$,
  '23514'::char(5),
  NULL,
  'mercadopago_events.resolution_state rejects an unmodelled value'
);
DELETE FROM public.mercadopago_events WHERE event_type IN ('schema_check_a', 'schema_check_b');

-- ================================================================
-- Group: I1 — day-31 anchor, three consecutive extensions, no drift
-- ================================================================
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  -- paid_through here is period_start + 1 month (paid_months_snapshot), what
  -- assign_plan would have set: Postgres CLAMPS to month-end (2026-02-28),
  -- it does not overflow into March.
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   '2026-01-31 00:00:00+00', '2026-02-28 00:00:00+00', 4, false, 1, 0, 50000.00);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES
  ('11111111-0000-0000-0000-000000000201', 'affiliate', '11111111-1111-1111-1111-111111111111', '2026-02', 50000.00, 0, 50000.00, 'issued'),
  ('11111111-0000-0000-0000-000000000202', 'affiliate', '11111111-1111-1111-1111-111111111111', '2026-03', 50000.00, 0, 50000.00, 'issued'),
  ('11111111-0000-0000-0000-000000000203', 'affiliate', '11111111-1111-1111-1111-111111111111', '2026-04', 50000.00, 0, 50000.00, 'issued');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_i1;
CREATE TEMP TABLE tmp_i1 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '11111111-0000-0000-0000-000000000201', 'affiliate', '11111111-1111-1111-1111-111111111111',
  50000.00, 'payment:mercadopago:i1-ext-1', 'mercadopago', '2026-02-01 00:00:00+00'
) AS r;
SELECT ok((SELECT posted FROM tmp_i1), 'I1 extension 1: posted');
SELECT ok((SELECT coverage_extended FROM tmp_i1), 'I1 extension 1: coverage_extended');
SELECT is((SELECT deferred_reason FROM tmp_i1), NULL, 'I1 extension 1: no deferred_reason');
SELECT is((SELECT invoice_status FROM tmp_i1), 'paid', 'I1 extension 1: invoice flips to paid');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  2, 'I1 extension 1: paid_months_snapshot 1 -> 2'
);
SELECT is(
  (SELECT paid_through FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  '2026-03-31 00:00:00+00'::timestamptz,
  'I1 extension 1: paid_through = period_start + 2 months = 2026-03-31 (fits, no overflow)'
);
SELECT is(
  (SELECT granted_quota FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  8, 'I1 extension 1: granted_quota += bonified_consultations (4 -> 8)'
);
SELECT is(
  (SELECT period_start FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  '2026-01-31 00:00:00+00'::timestamptz,
  'I1 extension 1: period_start never modified'
);

DROP TABLE IF EXISTS tmp_i1;
CREATE TEMP TABLE tmp_i1 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '11111111-0000-0000-0000-000000000202', 'affiliate', '11111111-1111-1111-1111-111111111111',
  50000.00, 'payment:mercadopago:i1-ext-2', 'mercadopago', '2026-03-01 00:00:00+00'
) AS r;
SELECT ok((SELECT coverage_extended FROM tmp_i1), 'I1 extension 2: coverage_extended');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  3, 'I1 extension 2: paid_months_snapshot 2 -> 3'
);
SELECT is(
  (SELECT paid_through FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  '2026-04-30 00:00:00+00'::timestamptz,
  'I1 extension 2: paid_through = period_start + 3 months = 2026-04-30 (Postgres CLAMPS to month-end, it does not overflow; April has 30 days so day 31 clamps down — recomputed from period_start, NOT accumulated onto the prior 2026-03-31 value, which would wrongly clamp to 2026-04-28)'
);
SELECT is(
  (SELECT granted_quota FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  12, 'I1 extension 2: granted_quota 8 -> 12'
);

DROP TABLE IF EXISTS tmp_i1;
CREATE TEMP TABLE tmp_i1 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '11111111-0000-0000-0000-000000000203', 'affiliate', '11111111-1111-1111-1111-111111111111',
  50000.00, 'payment:mercadopago:i1-ext-3', 'mercadopago', '2026-04-01 00:00:00+00'
) AS r;
SELECT ok((SELECT coverage_extended FROM tmp_i1), 'I1 extension 3: coverage_extended');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  4, 'I1 extension 3: paid_months_snapshot 3 -> 4'
);
SELECT is(
  (SELECT paid_through FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  '2026-05-31 00:00:00+00'::timestamptz,
  'I1 extension 3: paid_through = period_start + 4 months = 2026-05-31 (May has 31 days, so day 31 fits exactly here — recomputed fresh from period_start, not accumulated onto the prior 2026-04-30 value, which would wrongly land on 2026-05-30)'
);
SELECT is(
  (SELECT period_start FROM public.family_coverage_windows WHERE subject_profile_id = '11111111-1111-1111-1111-111111111111'),
  '2026-01-31 00:00:00+00'::timestamptz,
  'I1 extension 3: period_start STILL never modified across 3 consecutive extensions'
);

-- ================================================================
-- Group: I7 — balance guard (block vs grace_period), I5 (balance reflects
-- this same-transaction payment)
-- ================================================================
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('22222222-2222-2222-2222-222222222221', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00);

INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, external_ref)
VALUES ('affiliate', '22222222-2222-2222-2222-222222222221', 'charge', 60000.00, 'charge:test:i7-block-prior');

INSERT INTO public.invoices (entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES
  ('affiliate', '22222222-2222-2222-2222-222222222221', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued'),
  ('affiliate', '22222222-2222-2222-2222-222222222222', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

UPDATE public.system_settings SET value = '{"mode":"block"}' WHERE key = 'delinquency_policy';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_i7;
CREATE TEMP TABLE tmp_i7 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  (SELECT id FROM public.invoices WHERE entity_id = '22222222-2222-2222-2222-222222222221' AND period = to_char(now(), 'YYYY-MM')),
  'affiliate', '22222222-2222-2222-2222-222222222221', 50000.00, 'payment:mercadopago:i7-block-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_i7), 'I7 block mode: payment still posts');
SELECT is((SELECT invoice_status FROM tmp_i7), 'paid', 'I7 block mode: invoice still flips to paid (amount covers total)');
SELECT is((SELECT deferred_reason FROM tmp_i7), 'balance_due', 'I7 block mode: deferred_reason=balance_due (residual balance > 0)');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_i7), 'I7 block mode: coverage NOT extended');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '22222222-2222-2222-2222-222222222221'),
  1, 'I7 block mode: paid_months_snapshot unchanged'
);

UPDATE public.system_settings SET value = '{"mode":"grace_period"}' WHERE key = 'delinquency_policy';

DROP TABLE IF EXISTS tmp_i7;
CREATE TEMP TABLE tmp_i7 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  (SELECT id FROM public.invoices WHERE entity_id = '22222222-2222-2222-2222-222222222222' AND period = to_char(now(), 'YYYY-MM')),
  'affiliate', '22222222-2222-2222-2222-222222222222', 50000.00, 'payment:mercadopago:i7-grace-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_i7), 'I7 grace_period mode: payment posts');
SELECT is((SELECT deferred_reason FROM tmp_i7), NULL, 'I7 grace_period mode: no deferred_reason (no residual balance for this affiliate)');
SELECT ok((SELECT coverage_extended FROM tmp_i7), 'I7 grace_period mode: coverage IS extended');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '22222222-2222-2222-2222-222222222222'),
  2, 'I7 grace_period mode: paid_months_snapshot 1 -> 2'
);

-- Restore the default policy so every later group runs under grace_period.
UPDATE public.system_settings SET value = '{"mode":"grace_period"}' WHERE key = 'delinquency_policy';

-- ================================================================
-- Group: I8 — no coverage window
-- ================================================================
INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('33333333-0000-0000-0000-000000000001', 'affiliate', '33333333-3333-3333-3333-333333333333', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

-- Deadlock-fix regression check (Judgment Day Round 4): profiles.plan_status
-- defaults to 'active', so this affiliate is pushed to 'suspended' first —
-- otherwise a no-op UPDATE could pass this assertion even if the profiles
-- UPDATE were never reached.
UPDATE public.profiles SET plan_status = 'suspended' WHERE id = '33333333-3333-3333-3333-333333333333';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_i8;
CREATE TEMP TABLE tmp_i8 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '33333333-0000-0000-0000-000000000001', 'affiliate', '33333333-3333-3333-3333-333333333333',
  50000.00, 'payment:mercadopago:i8-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_i8), 'I8: payment still posts with no coverage window');
SELECT is((SELECT invoice_status FROM tmp_i8), 'paid', 'I8: invoice still flips to paid');
SELECT is((SELECT deferred_reason FROM tmp_i8), 'no_window', 'I8: deferred_reason=no_window');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_i8), 'I8: coverage NOT extended (nothing to extend)');
SELECT is(
  (SELECT plan_status FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333'),
  'active',
  'I8/deadlock-fix: profiles.plan_status is STILL updated to active on a full payment even when NO coverage window exists at all (the profiles UPDATE now runs after the window lock but before the no_window early RETURN, per the AB-BA lock-order fix)'
);

-- ================================================================
-- Group: I9 — partial payment
-- ================================================================
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('44444444-0000-0000-0000-000000000001', 'affiliate', '44444444-4444-4444-4444-444444444444', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_i9;
CREATE TEMP TABLE tmp_i9 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '44444444-0000-0000-0000-000000000001', 'affiliate', '44444444-4444-4444-4444-444444444444',
  30000.00, 'payment:mercadopago:i9-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_i9), 'I9: partial payment posts the real amount');
SELECT is((SELECT invoice_status FROM tmp_i9), 'issued', 'I9: invoice stays issued (amount < total)');
SELECT is((SELECT deferred_reason FROM tmp_i9), 'partial_payment', 'I9: deferred_reason=partial_payment');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_i9), 'I9: coverage NOT extended on a partial payment');
SELECT is(
  (SELECT amount FROM public.affiliate_account_movements WHERE external_ref = 'payment:mercadopago:i9-1'),
  30000.00, 'I9: movement records the ACTUAL partial amount, not the invoice total'
);

-- ================================================================
-- Group: I10 / R15 / R16 — invoice already paid, second distinct payment
-- ================================================================
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('55555555-0000-0000-0000-000000000001', 'affiliate', '55555555-5555-5555-5555-555555555555', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'paid');

INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, external_ref, invoice_id)
VALUES ('affiliate', '55555555-5555-5555-5555-555555555555', 'payment', 50000.00, 'payment:mercadopago:i10-prior', '55555555-0000-0000-0000-000000000001');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_i10;
CREATE TEMP TABLE tmp_i10 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '55555555-0000-0000-0000-000000000001', 'affiliate', '55555555-5555-5555-5555-555555555555',
  50000.00, 'payment:mercadopago:i10-second', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_i10), 'I10/R15: a second, genuinely distinct payment still posts (real credit)');
SELECT is((SELECT deferred_reason FROM tmp_i10), 'invoice_already_paid', 'I10: deferred_reason=invoice_already_paid');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_i10), 'I10: coverage NOT extended a second time');
SELECT is(
  (SELECT count(*)::int FROM public.affiliate_account_movements WHERE invoice_id = '55555555-0000-0000-0000-000000000001'),
  2, 'I10/R15: BOTH the prior and the new distinct payment exist as separate ledger movements'
);
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '55555555-5555-5555-5555-555555555555'),
  1, 'I10: paid_months_snapshot unchanged by the second payment'
);

-- ================================================================
-- Group: R-JD5 — already-paid invoice reactivates a suspended profile via
-- the invoice_was_paid_before early-return branch (Judgment Day Round 5
-- regression: the Round 4 deadlock fix moved the profiles.plan_status
-- UPDATE to AFTER the family_coverage_windows lock, but this branch returns
-- BEFORE that lock is ever reached, so it needs its OWN reactivation UPDATE).
-- ================================================================
INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('5a5a5a5a-0000-0000-0000-000000000001', 'affiliate', '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'paid');

INSERT INTO public.affiliate_account_movements (entity_type, entity_id, type, amount, external_ref, invoice_id)
VALUES ('affiliate', '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a', 'payment', 50000.00, 'payment:mercadopago:rjd5-prior', '5a5a5a5a-0000-0000-0000-000000000001');

-- Suspended beforehand (same pattern as I8): profiles.plan_status defaults
-- to 'active', so a no-op UPDATE could otherwise pass this assertion even
-- if the reactivation UPDATE were never reached.
UPDATE public.profiles SET plan_status = 'suspended' WHERE id = '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_rjd5;
CREATE TEMP TABLE tmp_rjd5 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '5a5a5a5a-0000-0000-0000-000000000001', 'affiliate', '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a',
  50000.00, 'payment:mercadopago:rjd5-second', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_rjd5), 'R-JD5: a second, genuinely distinct payment against an already-paid invoice still posts');
SELECT is((SELECT deferred_reason FROM tmp_rjd5), 'invoice_already_paid', 'R-JD5: deferred_reason=invoice_already_paid (unchanged behavior)');
SELECT is(
  (SELECT plan_status FROM public.profiles WHERE id = '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a'),
  'active',
  'R-JD5: profiles.plan_status IS reactivated to active by the invoice_was_paid_before early-return branch, even though it returns before the window lock'
);

-- ================================================================
-- Group: Fix 1 — cumulative partial payments complete an invoice
-- Two DISTINCT payments (different external_refs), each individually below
-- total_amount, whose SUM covers the invoice in full.
-- ================================================================
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('dddddddd-0000-0000-0000-000000000001', 'affiliate', 'dddddddd-dddd-dddd-dddd-dddddddddddd', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_fix1_a;
CREATE TEMP TABLE tmp_fix1_a AS
SELECT * FROM public.post_payment_movement_from_webhook(
  'dddddddd-0000-0000-0000-000000000001', 'affiliate', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  30000.00, 'payment:mercadopago:fix1-partial-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_fix1_a), 'Fix 1 first partial payment: posted');
SELECT is((SELECT deferred_reason FROM tmp_fix1_a), 'partial_payment', 'Fix 1 first partial payment: deferred_reason=partial_payment');
SELECT is((SELECT invoice_status FROM tmp_fix1_a), 'issued', 'Fix 1 first partial payment: invoice stays issued (30000 < 50000 total)');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_fix1_a), 'Fix 1 first partial payment: coverage NOT extended');

DROP TABLE IF EXISTS tmp_fix1_b;
CREATE TEMP TABLE tmp_fix1_b AS
SELECT * FROM public.post_payment_movement_from_webhook(
  'dddddddd-0000-0000-0000-000000000001', 'affiliate', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  25000.00, 'payment:mercadopago:fix1-partial-2', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_fix1_b), 'Fix 1 second distinct payment: posted');
SELECT ok((SELECT coverage_extended FROM tmp_fix1_b), 'Fix 1 second distinct payment: coverage_extended=true (cumulative 30000+25000=55000 >= 50000 total, even though 25000 alone is still < total)');
SELECT is((SELECT invoice_status FROM tmp_fix1_b), 'paid', 'Fix 1 second distinct payment: invoice flips to paid');
SELECT is((SELECT deferred_reason FROM tmp_fix1_b), NULL, 'Fix 1 second distinct payment: no deferred_reason');
SELECT is(
  (SELECT count(*)::int FROM public.affiliate_account_movements WHERE invoice_id = 'dddddddd-0000-0000-0000-000000000001'),
  2, 'Fix 1: BOTH distinct partial payments exist as separate ledger movements'
);

-- ================================================================
-- Group: Fix 2 — cancelled invoices are never resurrected to 'paid'
-- ================================================================
INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'affiliate', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'cancelled');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_fix2;
CREATE TEMP TABLE tmp_fix2 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  'eeeeeeee-0000-0000-0000-000000000001', 'affiliate', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  50000.00, 'payment:mercadopago:fix2-cancelled-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_fix2), 'Fix 2: a full payment against a cancelled invoice still posts (money received is real)');
SELECT is((SELECT deferred_reason FROM tmp_fix2), 'invoice_cancelled', 'Fix 2: deferred_reason=invoice_cancelled');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_fix2), 'Fix 2: coverage NOT extended');
SELECT is(
  (SELECT status FROM public.invoices WHERE id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'cancelled', 'Fix 2: re-querying the invoice row directly confirms status is STILL cancelled, never resurrected to paid'
);

-- ================================================================
-- Group: Fix 3 — a shared family_coverage_windows row is extended only
-- once per billing period, even when TWO DIFFERENT invoices (two family
-- members, distinct external_refs) each independently satisfy every OTHER
-- guard (per-invoice v_invoice_was_paid_before, R17 window_reset).
-- ================================================================
INSERT INTO public.family_groups (id, primary_affiliate_id, name)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffff0000', 'ffffffff-ffff-ffff-ffff-ffffffff0001', 'Fix 3 Family Group');

UPDATE public.profiles SET family_group_id = 'ffffffff-ffff-ffff-ffff-ffffffff0000'
WHERE id IN ('ffffffff-ffff-ffff-ffff-ffffffff0001', 'ffffffff-ffff-ffff-ffff-ffffffff0002');

INSERT INTO public.family_coverage_windows
  (family_group_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffff0000', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'affiliate', 'ffffffff-ffff-ffff-ffff-ffffffff0001', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued'),
  ('ffffffff-0000-0000-0000-000000000002', 'affiliate', 'ffffffff-ffff-ffff-ffff-ffffffff0002', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_fix3_a;
CREATE TEMP TABLE tmp_fix3_a AS
SELECT * FROM public.post_payment_movement_from_webhook(
  'ffffffff-0000-0000-0000-000000000001', 'affiliate', 'ffffffff-ffff-ffff-ffff-ffffffff0001',
  50000.00, 'payment:mercadopago:fix3-member1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT coverage_extended FROM tmp_fix3_a), 'Fix 3 first family member''s payment: coverage_extended=true');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE family_group_id = 'ffffffff-ffff-ffff-ffff-ffffffff0000'),
  2, 'Fix 3: paid_months_snapshot 1 -> 2 after the first member''s payment'
);

DROP TABLE IF EXISTS tmp_fix3_b;
CREATE TEMP TABLE tmp_fix3_b AS
SELECT * FROM public.post_payment_movement_from_webhook(
  'ffffffff-0000-0000-0000-000000000002', 'affiliate', 'ffffffff-ffff-ffff-ffff-ffffffff0002',
  50000.00, 'payment:mercadopago:fix3-member2', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_fix3_b), 'Fix 3 second family member''s payment: still posts (real credit)');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_fix3_b), 'Fix 3 second family member''s payment: coverage NOT extended a second time for the same period');
SELECT is((SELECT deferred_reason FROM tmp_fix3_b), 'period_already_extended', 'Fix 3: deferred_reason=period_already_extended');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE family_group_id = 'ffffffff-ffff-ffff-ffff-ffffffff0000'),
  2, 'Fix 3: paid_months_snapshot on the shared window incremented only ONCE, not twice'
);

-- ================================================================
-- Group: Fix 4 — renew_coverage_window resets last_extended_period, so a
-- stale value from BEFORE a renewal cannot incorrectly block a legitimate
-- extension AFTER the renewal (regression confirmed in Judgment Day Round 2
-- against the mercadopago-integration PR1 diff).
--
-- Scenario: the window's last webhook-driven extension set
-- last_extended_period to the CURRENT billing period (simulating a payment
-- that already extended it once). The window's paid_through is set in the
-- past so renew_coverage_window's own expiry guard does not reject the
-- renewal. An admin then renews the window (period_start resets to now(),
-- still within the current period). A fresh, legitimate webhook payment for
-- THAT SAME period arrives afterward: without the reset, the stale
-- last_extended_period would incorrectly report period_already_extended;
-- with the reset, it correctly extends coverage.
-- ================================================================
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'fix4@test.local', '', now(), now(), now());

UPDATE public.profiles
SET role = 'patient', full_name = 'Fix 4 Renewal Reset Affiliate', plan_id = '00000000-0000-0000-0000-000000000000'
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot, last_extended_period)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()) - interval '2 months',
   date_trunc('month', now()) - interval '1 day', -- already expired, so renew_coverage_window's own guard does not reject renewal
   4, false, 1, 0, 50000.00,
   to_char(now(), 'YYYY-MM')); -- stale: simulates a prior extension for the period being renewed into

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999"}', true);

DROP TABLE IF EXISTS tmp_fix4_renew;
CREATE TEMP TABLE tmp_fix4_renew AS
SELECT * FROM public.renew_coverage_window('cccccccc-cccc-cccc-cccc-cccccccccccc') AS r;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT last_extended_period FROM public.family_coverage_windows WHERE subject_profile_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  NULL, 'Fix 4: renew_coverage_window resets last_extended_period to NULL'
);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'affiliate', 'cccccccc-cccc-cccc-cccc-cccccccccccc', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_fix4_webhook;
CREATE TEMP TABLE tmp_fix4_webhook AS
SELECT * FROM public.post_payment_movement_from_webhook(
  'cccccccc-0000-0000-0000-000000000001', 'affiliate', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  50000.00, 'payment:mercadopago:fix4-post-renewal', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_fix4_webhook), 'Fix 4: post-renewal payment for the previously-stale period posts');
SELECT ok(
  (SELECT coverage_extended FROM tmp_fix4_webhook),
  'Fix 4: coverage_extended=true — the reset last_extended_period no longer blocks a legitimate post-renewal extension for the same period'
);
SELECT is(
  (SELECT deferred_reason FROM tmp_fix4_webhook), NULL,
  'Fix 4: no deferred_reason (specifically, NOT period_already_extended)'
);

-- ================================================================
-- Group: R17 — window_reset (admin ran a full-term reset after the invoice
-- period was issued)
-- ================================================================
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('66666666-0000-0000-0000-000000000001', 'affiliate', '66666666-6666-6666-6666-666666666666', to_char(now() - interval '3 months', 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_r17;
CREATE TEMP TABLE tmp_r17 AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '66666666-0000-0000-0000-000000000001', 'affiliate', '66666666-6666-6666-6666-666666666666',
  50000.00, 'payment:mercadopago:r17-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_r17), 'R17: payment still posts');
SELECT is((SELECT invoice_status FROM tmp_r17), 'paid', 'R17: invoice still flips to paid');
SELECT is((SELECT deferred_reason FROM tmp_r17), 'window_reset', 'R17: deferred_reason=window_reset (invoice period predates the window''s period_start)');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_r17), 'R17: coverage NOT extended on top of the reset term');
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '66666666-6666-6666-6666-666666666666'),
  1, 'R17: paid_months_snapshot unchanged'
);

-- ================================================================
-- Group: R12/R13/I6 — dedup on external_ref, replay never re-extends
-- ================================================================
INSERT INTO public.family_coverage_windows
  (subject_profile_id, plan_id_snapshot, period_start, paid_through, granted_quota, is_unlimited, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot)
VALUES
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 4, false, 1, 0, 50000.00);

INSERT INTO public.invoices (id, entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES ('77777777-0000-0000-0000-000000000001', 'affiliate', '77777777-7777-7777-7777-777777777777', to_char(now(), 'YYYY-MM'), 50000.00, 0, 50000.00, 'issued');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_r1213_a;
CREATE TEMP TABLE tmp_r1213_a AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '77777777-0000-0000-0000-000000000001', 'affiliate', '77777777-7777-7777-7777-777777777777',
  50000.00, 'payment:mercadopago:r1213-1', 'mercadopago', now()
) AS r;
SELECT ok((SELECT posted FROM tmp_r1213_a), 'R12/R13 first call: posted');
SELECT ok((SELECT coverage_extended FROM tmp_r1213_a), 'R12/R13 first call: coverage_extended');

DROP TABLE IF EXISTS tmp_r1213_b;
CREATE TEMP TABLE tmp_r1213_b AS
SELECT * FROM public.post_payment_movement_from_webhook(
  '77777777-0000-0000-0000-000000000001', 'affiliate', '77777777-7777-7777-7777-777777777777',
  50000.00, 'payment:mercadopago:r1213-1', 'mercadopago', now()
) AS r;
SELECT ok(NOT (SELECT posted FROM tmp_r1213_b), 'R12/R13 replay: posted=false (same external_ref)');
SELECT ok(NOT (SELECT coverage_extended FROM tmp_r1213_b), 'R12/R13 replay: coverage_extended=false, no double extension');
SELECT is(
  (SELECT movement_id FROM tmp_r1213_a), (SELECT movement_id FROM tmp_r1213_b),
  'R12/R13 replay: returns the SAME movement_id as the original call'
);
SELECT is(
  (SELECT paid_months_snapshot FROM public.family_coverage_windows WHERE subject_profile_id = '77777777-7777-7777-7777-777777777777'),
  2, 'R12/R13: paid_months_snapshot advanced exactly once despite the replay'
);
SELECT is(
  (SELECT count(*)::int FROM public.affiliate_account_movements WHERE external_ref = 'payment:mercadopago:r1213-1'),
  1, 'R12/R13: exactly one ledger movement exists for the replayed external_ref'
);

-- ================================================================
-- Group: record_mercadopago_subscription_event
-- ================================================================
INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status, status_changed_at, discounted_monthly_cost)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'mp-preapproval-sub-1', 'authorized', '2026-01-01 00:00:00+00', 40000.00);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Failed débito, then recycling redelivery (absorbed), then recovery, then a
-- genuinely new month's failure (increments again).
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-sub-1', 'subscription_authorized_payment_rejected', 'ap-jan-2026', 'payment_failed', '2026-01-15 00:00:00+00'),
  'status_applied', 'subscription event: first payment_failed applies'
);
SELECT is(
  (SELECT failure_count FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-sub-1'),
  1, 'subscription event: failure_count = 1 after first failure'
);
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-sub-1', 'subscription_authorized_payment_rejected', 'ap-jan-2026', 'payment_failed', '2026-01-16 00:00:00+00'),
  'duplicate_event', 'subscription event: MP recycling redelivery of the SAME authorized_payment id is absorbed'
);
SELECT is(
  (SELECT failure_count FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-sub-1'),
  1, 'subscription event: failure_count NOT double-incremented by the recycling redelivery'
);
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-sub-1', 'subscription_authorized_payment_processed', 'ap-feb-2026', 'authorized', '2026-02-15 00:00:00+00'),
  'status_applied', 'subscription event: recovery to authorized after a successful next charge'
);
SELECT is(
  (SELECT status FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-sub-1'),
  'authorized', 'subscription event: status recovered to authorized'
);
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-sub-1', 'subscription_authorized_payment_rejected', 'ap-mar-2026', 'payment_failed', '2026-03-15 00:00:00+00'),
  'status_applied', 'subscription event: a genuinely NEW month''s failure (distinct authorized_payment id) applies'
);
SELECT is(
  (SELECT failure_count FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-sub-1'),
  2, 'subscription event: failure_count increments a second time for a genuinely distinct occurrence'
);

-- R14: terminal guard — cancelled is never resurrected regardless of recency
INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status, status_changed_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'mp-preapproval-r14-1', 'cancelled', '2026-01-01 00:00:00+00');
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-r14-1', 'subscription_preapproval_authorized_late', 'preapp-r14-res-1', 'authorized', '2026-01-02 00:00:00+00'),
  'transition_ignored', 'R14: a late "authorized" for a cancelled subscription is ignored (terminal guard)'
);
SELECT is(
  (SELECT status FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-r14-1'),
  'cancelled', 'R14: status remains cancelled — never resurrected'
);

-- R14: recency guard — an older occurred_at cannot overwrite a newer state
INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status, status_changed_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'mp-preapproval-r14-2', 'authorized', '2026-02-01 00:00:00+00');
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-r14-2', 'subscription_authorized_payment_rejected', 'ap-r14-stale', 'payment_failed', '2026-01-15 00:00:00+00'),
  'transition_ignored', 'R14: an occurred_at OLDER than status_changed_at is ignored (recency guard)'
);
SELECT is(
  (SELECT status FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-r14-2'),
  'authorized', 'R14: status unaffected by the stale notification'
);
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-r14-2', 'subscription_authorized_payment_rejected', 'ap-r14-fresh', 'payment_failed', '2026-02-15 00:00:00+00'),
  'status_applied', 'R14: a NEWER occurred_at (distinct resource id) is applied normally'
);
SELECT is(
  (SELECT status FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-r14-2'),
  'payment_failed', 'R14: status now reflects the fresh, valid notification'
);

-- R2: unlinked audit leaves the real dedup slot free
INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status)
VALUES (NULL, 'mp-preapproval-r2-1', 'pending');
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-r2-1', 'subscription_preapproval_authorized', 'preapp-r2-res-1', 'authorized', '2026-01-01 00:00:00+00'),
  'subscription_not_linked', 'R2: an unlinked subscription reports subscription_not_linked'
);
SELECT ok(
  EXISTS(SELECT 1 FROM public.mercadopago_events WHERE event_type = 'subscription_preapproval_authorized' AND mp_resource_id = 'preapp-r2-res-1:unlinked'),
  'R2: the audit row uses the :unlinked-suffixed resource id, not the bare one'
);
SELECT ok(
  NOT EXISTS(SELECT 1 FROM public.mercadopago_events WHERE event_type = 'subscription_preapproval_authorized' AND mp_resource_id = 'preapp-r2-res-1'),
  'R2: the REAL (bare) dedup key was never consumed'
);
UPDATE public.affiliate_payment_subscriptions SET profile_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' WHERE mp_preapproval_id = 'mp-preapproval-r2-1';
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-r2-1', 'subscription_preapproval_authorized', 'preapp-r2-res-1', 'authorized', '2026-01-02 00:00:00+00'),
  'status_applied', 'R2: once linked, the SAME real resource id applies successfully — the slot really was free'
);

-- R23: occurred_at NULL fails closed
INSERT INTO public.affiliate_payment_subscriptions (profile_id, mp_preapproval_id, status, status_changed_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'mp-preapproval-r23-1', 'authorized', '2026-01-01 00:00:00+00');
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-r23-1', 'subscription_preapproval_paused', 'preapp-r23-res-1', 'cancelled', NULL),
  'occurred_at_unresolved', 'R23: NULL occurred_at fails closed instead of substituting now()'
);
SELECT is(
  (SELECT status FROM public.affiliate_payment_subscriptions WHERE mp_preapproval_id = 'mp-preapproval-r23-1'),
  'authorized', 'R23: status unchanged when occurred_at could not be resolved'
);
SELECT ok(
  EXISTS(SELECT 1 FROM public.mercadopago_events WHERE mp_resource_id = 'preapp-r23-res-1:noclock' AND resolution_state = 'needs_admin' AND outcome = 'occurred_at_unresolved'),
  'R23: a needs_admin audit row is recorded under the :noclock suffix'
);

-- unknown_subscription
SELECT is(
  public.record_mercadopago_subscription_event('mp-preapproval-does-not-exist', 'subscription_preapproval_authorized', 'preapp-unknown-res-1', 'authorized', now()),
  'unknown_subscription', 'an mp_preapproval_id with no matching row reports unknown_subscription'
);
SELECT ok(
  EXISTS(SELECT 1 FROM public.mercadopago_events WHERE mp_resource_id = 'preapp-unknown-res-1:unknown' AND resolution_state = 'pending'),
  'unknown_subscription: audit row recorded as pending (retryable by the sweep)'
);

-- invalid target status
SELECT throws_ok(
  $$SELECT public.record_mercadopago_subscription_event('mp-preapproval-sub-1', 'bogus_event', 'bogus-res-1', 'pending', now())$$,
  'P0001'::char(5),
  NULL,
  'record_mercadopago_subscription_event rejects p_new_status=pending (not a valid transition target)'
);

-- ================================================================
-- Group: mark_mercadopago_event_resolution (R19)
-- ================================================================
INSERT INTO public.mercadopago_events (event_type, mp_resource_id, outcome, resolution_state, attempt_count)
VALUES ('test_sweep_event', 'test-resource-mmer-1', 'no_open_invoice', 'pending', 3);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_mmer_id;
CREATE TEMP TABLE tmp_mmer_id AS
SELECT id FROM public.mercadopago_events WHERE mp_resource_id = 'test-resource-mmer-1';

SELECT ok(
  public.mark_mercadopago_event_resolution((SELECT id FROM tmp_mmer_id), 'resolved', 'posted', 'payment:mercadopago:xyz-1'),
  'mark_mercadopago_event_resolution: first call on a pending row returns true'
);
SELECT is((SELECT resolution_state FROM public.mercadopago_events WHERE id = (SELECT id FROM tmp_mmer_id)), 'resolved', 'resolution_state now resolved');
SELECT is((SELECT attempt_count FROM public.mercadopago_events WHERE id = (SELECT id FROM tmp_mmer_id)), 4, 'attempt_count incremented from 3 to 4');
SELECT ok((SELECT resolved_at FROM public.mercadopago_events WHERE id = (SELECT id FROM tmp_mmer_id)) IS NOT NULL, 'resolved_at is set');
SELECT is((SELECT resolved_by_ref FROM public.mercadopago_events WHERE id = (SELECT id FROM tmp_mmer_id)), 'payment:mercadopago:xyz-1', 'resolved_by_ref recorded');

SELECT ok(
  NOT public.mark_mercadopago_event_resolution((SELECT id FROM tmp_mmer_id), 'pending', 'should_not_apply', 'should-not-apply-ref'),
  'R19: a second call on the now-resolved row returns false (WHERE resolution_state=''pending'' no longer matches)'
);
SELECT is((SELECT attempt_count FROM public.mercadopago_events WHERE id = (SELECT id FROM tmp_mmer_id)), 4, 'R19: attempt_count NOT incremented a second time');
SELECT is((SELECT resolution_state FROM public.mercadopago_events WHERE id = (SELECT id FROM tmp_mmer_id)), 'resolved', 'R19: resolution_state never regressed back to pending');
SELECT is((SELECT resolved_by_ref FROM public.mercadopago_events WHERE id = (SELECT id FROM tmp_mmer_id)), 'payment:mercadopago:xyz-1', 'R19: resolved_by_ref not overwritten by the no-op second call');

-- ================================================================
-- Group: enrollment RPCs — claim / finalize / release (R8-R11, R21)
-- ================================================================
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DROP TABLE IF EXISTS tmp_claim_a;
CREATE TEMP TABLE tmp_claim_a AS
SELECT * FROM public.claim_subscription_enrollment('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') AS r;
SELECT is((SELECT claim FROM tmp_claim_a), 'reserved', 'claim_subscription_enrollment: fresh profile reserves a new slot');
SELECT ok((SELECT reservation_id FROM tmp_claim_a) IS NOT NULL, 'claim: reservation_id is set');

DROP TABLE IF EXISTS tmp_claim_b;
CREATE TEMP TABLE tmp_claim_b AS
SELECT * FROM public.claim_subscription_enrollment('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') AS r;
SELECT is((SELECT claim FROM tmp_claim_b), 'already_live', 'R8/R9: a second claim for the SAME profile within the TTL is already_live, no new reservation created');
SELECT is((SELECT existing_id FROM tmp_claim_b), (SELECT reservation_id FROM tmp_claim_a), 'already_live: existing_id points at the first reservation');
SELECT is((SELECT existing_status FROM tmp_claim_b), 'pending', 'already_live: existing_status is pending before finalize');

SELECT is(
  public.finalize_subscription_enrollment((SELECT reservation_id FROM tmp_claim_a), 'mp-preapproval-fresh-1', 32000.00),
  'finalized', 'finalize_subscription_enrollment: attaches the MP preapproval id'
);
SELECT is(
  (SELECT mp_preapproval_id FROM public.affiliate_payment_subscriptions WHERE id = (SELECT reservation_id FROM tmp_claim_a)),
  'mp-preapproval-fresh-1', 'finalize: mp_preapproval_id persisted'
);
SELECT is(
  (SELECT status FROM public.affiliate_payment_subscriptions WHERE id = (SELECT reservation_id FROM tmp_claim_a)),
  'pending', 'finalize: status stays pending until the webhook reports authorized'
);

DROP TABLE IF EXISTS tmp_claim_c;
CREATE TEMP TABLE tmp_claim_c AS
SELECT * FROM public.claim_subscription_enrollment('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') AS r;
SELECT is((SELECT claim FROM tmp_claim_c), 'already_live', 'claim after finalize: still already_live within the TTL');
SELECT is((SELECT existing_mp_id FROM tmp_claim_c), 'mp-preapproval-fresh-1', 'claim after finalize: existing_mp_id reflects the finalized preapproval');

-- R10/R11: stale pending (finalized, abandoned past the 30-minute TTL)
INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id, created_at)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'pending', 'mp-preapproval-stale-1', now() - interval '40 minutes');
DROP TABLE IF EXISTS tmp_claim_stale;
CREATE TEMP TABLE tmp_claim_stale AS
SELECT * FROM public.claim_subscription_enrollment('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2') AS r;
SELECT is((SELECT claim FROM tmp_claim_stale), 'stale_pending', 'R10/R11: a finalized reservation older than 30 minutes is stale_pending');
SELECT is((SELECT existing_mp_id FROM tmp_claim_stale), 'mp-preapproval-stale-1', 'R11: stale_pending carries the mp_preapproval_id so the caller can cancel it at MP');

-- already_live via an authorized subscription
INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'authorized', 'mp-preapproval-live-1');
DROP TABLE IF EXISTS tmp_claim_auth;
CREATE TEMP TABLE tmp_claim_auth AS
SELECT * FROM public.claim_subscription_enrollment('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3') AS r;
SELECT is((SELECT claim FROM tmp_claim_auth), 'already_live', 'an authorized subscription blocks re-enrollment');
SELECT is((SELECT existing_status FROM tmp_claim_auth), 'authorized', 'already_live: existing_status reflects authorized');

-- release_subscription_reservation
DROP TABLE IF EXISTS tmp_claim_release;
CREATE TEMP TABLE tmp_claim_release AS
SELECT * FROM public.claim_subscription_enrollment('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4') AS r;
SELECT ok(
  public.release_subscription_reservation((SELECT reservation_id FROM tmp_claim_release)),
  'release_subscription_reservation: releases a still-pending, never-finalized reservation'
);
SELECT is(
  (SELECT count(*)::int FROM public.affiliate_payment_subscriptions WHERE id = (SELECT reservation_id FROM tmp_claim_release)),
  0, 'release: the row is actually deleted'
);
SELECT ok(
  NOT public.release_subscription_reservation((SELECT reservation_id FROM tmp_claim_release)),
  'release: releasing the SAME reservation again returns false (already gone)'
);

-- R21: release must never delete a FINALIZED reservation
SELECT ok(
  NOT public.release_subscription_reservation((SELECT reservation_id FROM tmp_claim_a)),
  'R21: release_subscription_reservation refuses a finalized row (mp_preapproval_id IS NOT NULL)'
);
SELECT is(
  (SELECT count(*)::int FROM public.affiliate_payment_subscriptions WHERE id = (SELECT reservation_id FROM tmp_claim_a)),
  1, 'R21: the finalized row still exists after the refused release attempt'
);

-- R21: finalize on an already-released (deleted) reservation
SELECT is(
  public.finalize_subscription_enrollment((SELECT reservation_id FROM tmp_claim_release), 'mp-preapproval-ghost', 10000.00),
  'reservation_missing', 'R21: finalize on a deleted reservation returns reservation_missing'
);

-- ================================================================
-- Group: authorization block — GRANT layer + in-body guard, all 7 functions
--
-- Does NOT use SET LOCAL ROLE + dynamic execution of a revoked function.
-- That combination reliably SEGFAULTS this Postgres build (reproduced
-- independently with a trivial revoked function in both `sql` and
-- `plpgsql`, confirmed via container logs: "terminated by signal 11").
-- It is also not representative of production: PostgREST never switches
-- Postgres role mid-session the way SET ROLE does here — it authenticates
-- via JWT and connects already bound to a role. So this checks the same
-- two guarantees through two crash-free, equally direct paths instead:
--   (a) GRANT layer  -> has_function_privilege() metadata check, no call.
--   (b) in-body guard -> call the function AS THE CURRENT test-session
--       role (which already has EXECUTE, proven by every earlier group
--       in this file calling these functions successfully) with jwt
--       claims deliberately set to something other than service_role.
--       This exercises is_service_role()'s own logic without ever
--       touching the Postgres GRANT/role-switch path that crashes.
-- ================================================================
CREATE OR REPLACE FUNCTION pg_temp.check_service_role_only(p_label TEXT, p_regproc TEXT, p_call_sql TEXT)
RETURNS SETOF TEXT LANGUAGE plpgsql AS $BODY$
BEGIN
  RETURN NEXT ok(
    NOT has_function_privilege('authenticated', p_regproc::regprocedure, 'EXECUTE'),
    p_label || ': authenticated has NO EXECUTE at the GRANT layer'
  );
  RETURN NEXT ok(
    has_function_privilege('service_role', p_regproc::regprocedure, 'EXECUTE'),
    p_label || ': service_role HAS EXECUTE at the GRANT layer'
  );

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  RETURN NEXT throws_ok(p_call_sql, 'P0001'::char(5), NULL, p_label || ': rejected by the in-body is_service_role() guard when claims disagree');
  PERFORM set_config('request.jwt.claims', '', true);
END;
$BODY$;

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.is_service_role()'::regprocedure, 'EXECUTE'),
  'is_service_role: authenticated has NO EXECUTE at the GRANT layer'
);
SELECT ok(
  has_function_privilege('service_role', 'public.is_service_role()'::regprocedure, 'EXECUTE'),
  'is_service_role: service_role HAS EXECUTE at the GRANT layer'
);

SELECT * FROM pg_temp.check_service_role_only(
  'post_payment_movement_from_webhook',
  'public.post_payment_movement_from_webhook(uuid,text,uuid,numeric,text,text,timestamptz)',
  $$SELECT public.post_payment_movement_from_webhook('11111111-1111-1111-1111-111111111111'::uuid, 'affiliate', '11111111-1111-1111-1111-111111111111'::uuid, 1.00, 'auth-check-ppmfw', 'mercadopago', now())$$
);
SELECT * FROM pg_temp.check_service_role_only(
  'record_mercadopago_subscription_event',
  'public.record_mercadopago_subscription_event(text,text,text,text,timestamptz,text)',
  $$SELECT public.record_mercadopago_subscription_event('auth-check-preapproval', 'auth_check_event', 'auth-check-res', 'authorized', now())$$
);
SELECT * FROM pg_temp.check_service_role_only(
  'mark_mercadopago_event_resolution',
  'public.mark_mercadopago_event_resolution(uuid,text,text,text)',
  $$SELECT public.mark_mercadopago_event_resolution(gen_random_uuid(), 'resolved', NULL, NULL)$$
);
SELECT * FROM pg_temp.check_service_role_only(
  'claim_subscription_enrollment',
  'public.claim_subscription_enrollment(uuid)',
  $$SELECT public.claim_subscription_enrollment(gen_random_uuid())$$
);
SELECT * FROM pg_temp.check_service_role_only(
  'finalize_subscription_enrollment',
  'public.finalize_subscription_enrollment(uuid,text,numeric)',
  $$SELECT public.finalize_subscription_enrollment(gen_random_uuid(), 'auth-check-preapproval', 1.00)$$
);
SELECT * FROM pg_temp.check_service_role_only(
  'release_subscription_reservation',
  'public.release_subscription_reservation(uuid)',
  $$SELECT public.release_subscription_reservation(gen_random_uuid())$$
);

-- ================================================================
-- Group: Fix 4 — explicit REVOKE locks in the write-block on both new
-- tables. Metadata-only checks (has_table_privilege), same crash-free
-- pattern used above for function-level EXECUTE checks — no SET ROLE +
-- dynamic INSERT (that combination segfaulted this Postgres build earlier).
-- ================================================================
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.affiliate_payment_subscriptions', 'INSERT'),
  'Fix 4: authenticated has NO INSERT on affiliate_payment_subscriptions'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.affiliate_payment_subscriptions', 'UPDATE'),
  'Fix 4: authenticated has NO UPDATE on affiliate_payment_subscriptions'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.affiliate_payment_subscriptions', 'DELETE'),
  'Fix 4: authenticated has NO DELETE on affiliate_payment_subscriptions'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.mercadopago_events', 'INSERT'),
  'Fix 4: authenticated has NO INSERT on mercadopago_events'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.mercadopago_events', 'UPDATE'),
  'Fix 4: authenticated has NO UPDATE on mercadopago_events'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.mercadopago_events', 'DELETE'),
  'Fix 4: authenticated has NO DELETE on mercadopago_events'
);

-- ================================================================
-- Group: RLS — self-scoping on both new tables, and the new invoices policy
-- ================================================================
INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id)
VALUES
  ('88888888-8888-8888-8888-888888888881', 'authorized', 'mp-preapproval-rls-a'),
  ('88888888-8888-8888-8888-888888888882', 'authorized', 'mp-preapproval-rls-b');

INSERT INTO public.invoices (entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
VALUES
  ('affiliate', '88888888-8888-8888-8888-888888888881', '2026-09', 50000.00, 0, 50000.00, 'issued'),
  ('affiliate', '88888888-8888-8888-8888-888888888882', '2026-09', 50000.00, 0, 50000.00, 'issued');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888881"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.affiliate_payment_subscriptions),
  1, 'RLS: affiliate A sees exactly its own affiliate_payment_subscriptions row'
);
SELECT is(
  (SELECT profile_id FROM public.affiliate_payment_subscriptions LIMIT 1),
  '88888888-8888-8888-8888-888888888881', 'RLS: the visible row belongs to affiliate A, never B'
);
SELECT is(
  (SELECT count(*)::int FROM public.mercadopago_events),
  0, 'RLS: a non-admin affiliate reads ZERO mercadopago_events rows (no self-read policy exists)'
);
SELECT is(
  (SELECT count(*)::int FROM public.invoices WHERE period = '2026-09'),
  1, 'RLS/R25: affiliate A reads exactly its own 2026-09 invoice, not affiliate B''s'
);
SELECT is(
  (SELECT entity_id FROM public.invoices WHERE period = '2026-09' LIMIT 1),
  '88888888-8888-8888-8888-888888888881', 'RLS/R25: the visible invoice belongs to affiliate A — identity match, not a nullable group comparison'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999"}', true);
SELECT ok(
  (SELECT count(*)::int FROM public.affiliate_payment_subscriptions) >= 2,
  'RLS: admin reads BOTH affiliates'' payment subscription rows'
);
SELECT ok(
  (SELECT count(*)::int FROM public.mercadopago_events) > 0,
  'RLS: admin CAN read the mercadopago_events audit trail'
);
SELECT is(
  (SELECT count(*)::int FROM public.invoices WHERE period = '2026-09'),
  2, 'RLS: admin reads BOTH affiliates'' 2026-09 invoices'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT * FROM finish();
ROLLBACK;
