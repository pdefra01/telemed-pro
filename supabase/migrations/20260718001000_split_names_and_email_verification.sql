-- Migration: Split Names and Email Verification Setup
-- Description: Adds first_name and last_name columns to profiles, family_members, and adhesion_requests. Fixes contact_verifications user_id to be nullable for guest OTP flows.

-- 1. Modificaciones en la tabla profiles (Tipos Persona)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- 2. Modificaciones en la tabla family_members (Convivientes)
ALTER TABLE public.family_members 
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- 3. Trigger para mantener full_name actualizado
CREATE OR REPLACE FUNCTION public.sync_full_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
    NEW.full_name := trim(concat(COALESCE(NEW.first_name, ''), ' ', COALESCE(NEW.last_name, '')));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asociar trigger a profiles
DROP TRIGGER IF EXISTS trg_profiles_full_name ON public.profiles;
CREATE TRIGGER trg_profiles_full_name
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_full_name();

-- Asociar trigger a family_members
DROP TRIGGER IF EXISTS trg_family_members_full_name ON public.family_members;
CREATE TRIGGER trg_family_members_full_name
  BEFORE INSERT OR UPDATE ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_full_name();

-- 4. Migración de registros de nombres existentes (Profiles)
UPDATE public.profiles
SET first_name = split_part(full_name, ' ', 1),
    last_name = COALESCE(nullif(substring(full_name from position(' ' in full_name) + 1), ''), '')
WHERE full_name IS NOT NULL AND position(' ' in full_name) > 0 AND first_name IS NULL;

UPDATE public.profiles
SET first_name = full_name,
    last_name = ''
WHERE full_name IS NOT NULL AND position(' ' in full_name) = 0 AND first_name IS NULL;

-- Migración de registros de nombres existentes (Family Members)
UPDATE public.family_members
SET first_name = split_part(full_name, ' ', 1),
    last_name = COALESCE(nullif(substring(full_name from position(' ' in full_name) + 1), ''), '')
WHERE full_name IS NOT NULL AND position(' ' in full_name) > 0 AND first_name IS NULL;

UPDATE public.family_members
SET first_name = full_name,
    last_name = ''
WHERE full_name IS NOT NULL AND position(' ' in full_name) = 0 AND first_name IS NULL;

-- 5. Tabla de desafíos OTP (contact_verifications)
-- Asegurar la creación de la tabla si no existe, o modificarla
CREATE TABLE IF NOT EXISTS public.contact_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- Nullable por defecto
  channel       TEXT NOT NULL CHECK (channel IN ('phone', 'email')),
  contact_value TEXT NOT NULL,
  otp_code      TEXT NOT NULL,
  attempts      INT NOT NULL DEFAULT 0 CHECK (attempts <= 5),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Si la tabla ya existía, asegurar que user_id sea nullable
ALTER TABLE public.contact_verifications ALTER COLUMN user_id DROP NOT NULL;

-- Habilitar RLS en contact_verifications
ALTER TABLE public.contact_verifications ENABLE ROW LEVEL SECURITY;

-- Asegurar políticas RLS
DROP POLICY IF EXISTS "Users view own verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Users insert own verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Users update own verifications" ON public.contact_verifications;

CREATE POLICY "Users view own verifications" ON public.contact_verifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own verifications" ON public.contact_verifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own verifications" ON public.contact_verifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Políticas públicas adicionales para invitados anónimos (correo OTP en pre-adhesión)
DROP POLICY IF EXISTS "Public insert verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Public select verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Public update verifications" ON public.contact_verifications;

CREATE POLICY "Public insert verifications" ON public.contact_verifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public select verifications" ON public.contact_verifications FOR SELECT TO anon, authenticated USING (verified_at IS NULL AND expires_at > now());
CREATE POLICY "Public update verifications" ON public.contact_verifications FOR UPDATE TO anon, authenticated USING (verified_at IS NULL AND expires_at > now());

-- 6. Modificaciones en la tabla adhesion_requests
ALTER TABLE public.adhesion_requests 
  ADD COLUMN IF NOT EXISTS titular_first_name TEXT,
  ADD COLUMN IF NOT EXISTS titular_last_name TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Migración del titular_name existente a titular_first_name/last_name
UPDATE public.adhesion_requests
SET titular_first_name = split_part(titular_name, ' ', 1),
    titular_last_name = COALESCE(nullif(substring(titular_name from position(' ' in titular_name) + 1), ''), '')
WHERE titular_name IS NOT NULL AND position(' ' in titular_name) > 0 AND titular_first_name IS NULL;

UPDATE public.adhesion_requests
SET titular_first_name = titular_name,
    titular_last_name = ''
WHERE titular_name IS NOT NULL AND position(' ' in titular_name) = 0 AND titular_first_name IS NULL;
