-- Migration: 20261008000000_profiles_professional_title.sql
-- Description: Stores each professional's own title ("Dr." / "Dra.") so the
-- app stops prefixing every doctor with a hardcoded "Dr.".
--
-- Existing rows take the default "Dr."; the admin corrects them from the
-- doctors panel. The column lives on public.profiles, so it is covered by the
-- existing table-level GRANTs and RLS policies: the admin can update it, and
-- every client that already reads a doctor's profile row (booking list,
-- appointment/record/prescription joins via profiles!doctor_id) can read it.
-- No view or RPC selects doctor names (doctor_queue only exposes patient
-- fields), so none needs to change.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS professional_title text NOT NULL DEFAULT 'Dr.';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_professional_title_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_professional_title_check
  CHECK (professional_title IN ('Dr.', 'Dra.'));

COMMENT ON COLUMN public.profiles.professional_title IS
  'Title shown before a professional''s name: ''Dr.'' or ''Dra.''. Set by the admin; defaults to ''Dr.''.';
