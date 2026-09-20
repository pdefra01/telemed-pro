-- pgTAP tests for 20260920050000_adhesion_checkout_payment.sql
-- (odd/mandatory-mp-signup-payment, M3). Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

SELECT has_column('public', 'adhesion_requests', 'mp_checkout_preference_id', 'has mp_checkout_preference_id');
SELECT has_column('public', 'adhesion_requests', 'mp_payment_id', 'has mp_payment_id');
SELECT has_column('public', 'adhesion_requests', 'payment_status', 'has payment_status');
SELECT has_column('public', 'adhesion_requests', 'paid_at', 'has paid_at');

-- Fixture inserted as the owner role (service-role equivalent)
INSERT INTO public.adhesion_requests
  (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality,
   titular_neighborhood, titular_email, titular_phone, titular_civil_status, payment_method, signature_base64)
VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 'Test Titular', '30999888', '1980-01-01', 'Calle 1', 'Loc',
   'Barrio', 't@example.com', '1155551234', 'single', 'cash', 'sig');

SELECT is((SELECT payment_status FROM public.adhesion_requests WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  NULL, 'payment_status defaults to NULL');

SELECT lives_ok($$UPDATE public.adhesion_requests SET payment_status = 'pending', mp_checkout_preference_id = 'pref-1'
  WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'$$, 'server (owner) can set pending + preference id');
SELECT lives_ok($$UPDATE public.adhesion_requests SET payment_status = 'approved', mp_payment_id = 'pay-1', paid_at = now()
  WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'$$, 'server (owner) can set approved + payment id + paid_at');
SELECT lives_ok($$UPDATE public.adhesion_requests SET payment_status = 'rejected'
  WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'$$, 'server (owner) can set rejected');
SELECT throws_ok($$UPDATE public.adhesion_requests SET payment_status = 'paid'
  WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'$$, '23514', NULL, 'CHECK rejects unknown payment_status');

-- anon (public sign-up form) cannot forge payment state on insert
SET LOCAL ROLE anon;
INSERT INTO public.adhesion_requests
  (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality,
   titular_neighborhood, titular_email, titular_phone, titular_civil_status, payment_method, signature_base64,
   payment_status, mp_payment_id, paid_at, mp_checkout_preference_id)
VALUES
  ('c1c1c1c1-0000-0000-0000-000000000002', 'Forger', '30999777', '1980-01-01', 'Calle 1', 'Loc',
   'Barrio', 'f@example.com', '1155559999', 'single', 'cash', 'sig',
   'approved', 'fake', now(), 'fake-pref');
RESET ROLE;

SELECT is((SELECT payment_status FROM public.adhesion_requests WHERE id = 'c1c1c1c1-0000-0000-0000-000000000002'),
  NULL, 'anon insert cannot set payment_status');
SELECT is((SELECT mp_payment_id || coalesce(paid_at::text, '') || coalesce(mp_checkout_preference_id, '')
  FROM public.adhesion_requests WHERE id = 'c1c1c1c1-0000-0000-0000-000000000002'),
  NULL, 'anon insert cannot set payment id, paid_at or preference id');

-- anon cannot rewrite payment state on update (RLS may hide the row; state must be unchanged either way)
SET LOCAL ROLE anon;
UPDATE public.adhesion_requests SET payment_status = 'rejected', mp_payment_id = 'x'
  WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001';
RESET ROLE;
SELECT is((SELECT payment_status || ':' || mp_payment_id FROM public.adhesion_requests
  WHERE id = 'c1c1c1c1-0000-0000-0000-000000000001'), 'rejected:pay-1',
  'anon update leaves payment fields untouched (mp_payment_id stays pay-1)');

SELECT * FROM finish();
ROLLBACK;
