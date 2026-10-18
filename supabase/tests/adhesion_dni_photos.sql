-- pgTAP tests for 20261018000000_adhesion_dni_photos.sql.
-- Self-contained: BEGIN ... ROLLBACK.

BEGIN;
SELECT no_plan();

SELECT has_column('public', 'adhesion_requests', 'titular_dni_front_path', 'front path column exists');
SELECT has_column('public', 'adhesion_requests', 'titular_dni_back_path', 'back path column exists');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'adhesion-documents'), false, 'bucket is private');

-- Objects as the server leaves them after signed uploads (service role / owner).
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('adhesion-documents', '0f8fad5b-d9cb-469f-a165-70867728950e/front.jpg'),
  ('adhesion-documents', '0f8fad5b-d9cb-469f-a165-70867728950e/back.png'),
  ('adhesion-documents', '2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d/back.png');

-- ================================================================
-- anon: no direct access to the bucket at all
-- ================================================================
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name) VALUES ('adhesion-documents', '1b4e28ba-2fa1-41d2-883f-0016d3cca427/front.jpg')$$,
  '42501', NULL, 'anon cannot upload directly (only through server-signed URLs)'
);
SELECT is(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'adhesion-documents'),
  0::bigint,
  'anon cannot read DNI photos'
);
SELECT is_empty(
  $$UPDATE storage.objects SET name = '0f8fad5b-d9cb-469f-a165-70867728950e/front.png' WHERE bucket_id = 'adhesion-documents' RETURNING id$$,
  'anon cannot overwrite DNI photos'
);

RESET ROLE;

-- Direct SQL deletes are blocked by storage.protect_delete() for every role,
-- so the write guarantee is asserted on the policy set instead: the only
-- policy touching this bucket is the admin SELECT.
SELECT results_eq(
  $$SELECT cmd::text FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual LIKE '%adhesion-documents%' OR with_check LIKE '%adhesion-documents%')$$,
  $$VALUES ('SELECT')$$,
  'no write policy exists for the DNI photos bucket'
);

-- ================================================================
-- authenticated: admins read, everyone else does not
-- ================================================================
INSERT INTO auth.users (id, email) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 'admin-dni@test.local'),
  ('c1c1c1c1-0000-0000-0000-000000000002', 'patient-dni@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, role, full_name) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 'admin', 'Admin DNI'),
  ('c1c1c1c1-0000-0000-0000-000000000002', 'patient', 'Patient DNI')
ON CONFLICT (id) DO UPDATE SET role = excluded.role;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'adhesion-documents'),
  0::bigint,
  'a patient cannot read DNI photos'
);

SELECT set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'adhesion-documents'),
  3::bigint,
  'an admin can read DNI photos'
);

RESET ROLE;

-- ================================================================
-- adhesion_requests: public inserts must reference both uploaded photos
-- ================================================================
-- format() args: id, dni (also builds a unique phone), front path, back path.
CREATE TEMP TABLE dni_row_sql AS SELECT $sql$
  INSERT INTO public.adhesion_requests (id, titular_name, titular_dni, titular_birth_date, titular_address,
    titular_locality, titular_neighborhood, titular_email, titular_phone, titular_civil_status,
    payment_method, signature_base64, titular_dni_front_path, titular_dni_back_path)
  VALUES ('%s', 'Test', '%s', '1990-01-01', 'Calle 1', 'Salta', 'Centro', 't@test.local',
    '38%2$s', 'Soltero/a', 'debit', 'data:,', %s, %s)
$sql$::text AS tpl;
GRANT SELECT ON dni_row_sql TO anon;

SET LOCAL ROLE anon;
SELECT lives_ok(
  format((SELECT tpl FROM dni_row_sql), '0f8fad5b-d9cb-469f-a165-70867728950e', '30123401',
    quote_literal('0f8fad5b-d9cb-469f-a165-70867728950e/front.jpg'), quote_literal('0f8fad5b-d9cb-469f-a165-70867728950e/back.png')),
  'anon can submit a request whose two photos are uploaded under its own folder'
);
SELECT throws_ok(
  format((SELECT tpl FROM dni_row_sql), '2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d', '30123402', 'NULL',
    quote_literal('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d/back.png')),
  '23514', NULL, 'anon cannot submit a request missing the front photo'
);
SELECT throws_ok(
  format((SELECT tpl FROM dni_row_sql), '2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d', '30123403',
    quote_literal('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d/front.jpg'), quote_literal('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d/back.png')),
  '23514', NULL, 'anon cannot reference a photo that was never uploaded'
);
SELECT throws_ok(
  format((SELECT tpl FROM dni_row_sql), '2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d', '30123404',
    quote_literal('0f8fad5b-d9cb-469f-a165-70867728950e/front.jpg'), quote_literal('0f8fad5b-d9cb-469f-a165-70867728950e/back.png')),
  '23514', NULL, 'anon cannot point a request at another request''s photos'
);
RESET ROLE;

SELECT lives_ok(
  format((SELECT tpl FROM dni_row_sql), '3d6f4a10-0000-4000-8000-000000000001', '30123405', 'NULL', 'NULL'),
  'server-side inserts (postgres/service role) are not constrained'
);
SELECT lives_ok(
  $$UPDATE public.adhesion_requests SET status = 'rejected' WHERE id = '3d6f4a10-0000-4000-8000-000000000001'$$,
  'updating a row without photos still works'
);

SELECT * FROM finish();
ROLLBACK;
