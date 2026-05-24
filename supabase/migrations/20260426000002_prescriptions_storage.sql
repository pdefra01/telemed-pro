-- Add pdf_url column to prescriptions
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Bucket creation and RLS policies on storage.objects are disabled because Storage service is disabled in config.toml

