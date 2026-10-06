-- pgTAP tests for 20260924000000_adhesion_activation_claim.sql
-- (odd/adhesion-auto-activation, T1). Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

SELECT has_column('public', 'adhesion_requests', 'activation_claimed_at', 'has activation_claimed_at');
SELECT has_column('public', 'adhesion_requests', 'activated_at', 'has activated_at');
SELECT has_column('public', 'adhesion_requests', 'activation_source', 'has activation_source');

-- Fixture inserted as the owner role (service-role equivalent)
INSERT INTO public.adhesion_requests
  (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality,
   titular_neighborhood, titular_email, titular_phone, titular_civil_status, payment_method, signature_base64)
VALUES
  ('a7a7a7a7-0000-0000-0000-000000000001', 'Test Titular', '30999111', '1980-01-01', 'Calle 1', 'Loc',
   'Barrio', 'act@example.com', '1155551111', 'single', 'cash', 'sig');

-- The claim is a conditional update: the first one wins, the second matches no row.
WITH c AS (UPDATE public.adhesion_requests SET activation_claimed_at = now()
  WHERE id = 'a7a7a7a7-0000-0000-0000-000000000001' AND status = 'pending' AND activation_claimed_at IS NULL
  RETURNING id)
SELECT is(count(*)::int, 1, 'first claim wins') FROM c;
WITH c AS (UPDATE public.adhesion_requests SET activation_claimed_at = now()
  WHERE id = 'a7a7a7a7-0000-0000-0000-000000000001' AND status = 'pending' AND activation_claimed_at IS NULL
  RETURNING id)
SELECT is(count(*)::int, 0, 'second claim matches no row') FROM c;

SELECT lives_ok($$UPDATE public.adhesion_requests SET activated_at = now(), activation_source = 'auto'
  WHERE id = 'a7a7a7a7-0000-0000-0000-000000000001'$$, 'server (owner) can set activated_at + auto source');
SELECT lives_ok($$UPDATE public.adhesion_requests SET activation_source = 'admin'
  WHERE id = 'a7a7a7a7-0000-0000-0000-000000000001'$$, 'server (owner) can set admin source');
SELECT throws_ok($$UPDATE public.adhesion_requests SET activation_source = 'web'
  WHERE id = 'a7a7a7a7-0000-0000-0000-000000000001'$$, '23514', NULL, 'CHECK rejects unknown activation_source');

-- anon (public sign-up form) cannot forge activation state on insert
SET LOCAL ROLE anon;
INSERT INTO public.adhesion_requests
  (id, titular_name, titular_dni, titular_birth_date, titular_address, titular_locality,
   titular_neighborhood, titular_email, titular_phone, titular_civil_status, payment_method, signature_base64,
   activation_claimed_at, activated_at, activation_source)
VALUES
  ('a7a7a7a7-0000-0000-0000-000000000002', 'Forger', '30999222', '1980-01-01', 'Calle 1', 'Loc',
   'Barrio', 'forge-act@example.com', '1155552222', 'single', 'cash', 'sig',
   now(), now(), 'admin');
RESET ROLE;

SELECT is((SELECT coalesce(activation_claimed_at::text, '') || coalesce(activated_at::text, '') || coalesce(activation_source, '')
  FROM public.adhesion_requests WHERE id = 'a7a7a7a7-0000-0000-0000-000000000002'),
  '', 'anon insert cannot set activation_claimed_at, activated_at or activation_source');

SELECT * FROM finish();
ROLLBACK;
