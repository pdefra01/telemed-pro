-- Migration: prescriptions_pdfs_private
-- Description: `prescriptions_pdfs` was a public Storage bucket with no RLS,
--   so every prescription PDF link ever generated was permanently and
--   unauthenticatedly readable, with no expiry. Medical prescriptions carry
--   diagnosis, medication and patient name, so this is switched to a private
--   bucket + 48h-expiring signed URLs (see
--   odd/tasks/prescription-pdf-private-signed-urls.md). Only server-side
--   code (edge function service role, server/whatsapp.js's supabaseAdmin)
--   ever touches this bucket, so service role bypasses RLS entirely and no
--   new storage.objects policy is needed.
--   Applies retroactively: existing public links break immediately. Accepted
--   explicitly by the user, no backfill of old rows performed.

ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS pdf_path TEXT;

UPDATE storage.buckets SET public = false WHERE id = 'prescriptions_pdfs';
