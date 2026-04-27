-- Migration: Digital Credentials Metadata
-- Description: Adds fields for credential verification and glassy ID features.

-- 1. Add credential fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS credential_issued_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS credential_hash TEXT, -- For verification
ADD COLUMN IF NOT EXISTS is_dni_verified BOOLEAN DEFAULT FALSE;

-- 2. Function to generate a simple credential hash if needed (mock)
-- In a real app, this would be a more secure hash or a signed token.
CREATE OR REPLACE FUNCTION public.update_credential_hash()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_dni_verified = TRUE AND (OLD.is_dni_verified = FALSE OR OLD.is_dni_verified IS NULL) THEN
    NEW.credential_issued_at = NOW();
    NEW.credential_hash = encode(digest(NEW.id::text || NEW.dni || NOW()::text, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger for credential generation
-- Note: Requires pgcrypto extension for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TRIGGER IF EXISTS on_dni_verified ON public.profiles;
CREATE TRIGGER on_dni_verified
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_dni_verified IS DISTINCT FROM OLD.is_dni_verified)
  EXECUTE FUNCTION public.update_credential_hash();
