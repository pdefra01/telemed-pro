-- Migration: Contact validation and OTP verification
-- Description: Extends profiles with verification flags and creates contact_verifications table for OTP 2FA challenges.

-- 1. Extensión en la tabla profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS real_email TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS communication_preferences JSONB DEFAULT '{"whatsapp": true, "sms": false, "email": true}'::jsonb;

-- 2. Tabla de desafíos OTP
CREATE TABLE IF NOT EXISTS public.contact_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('phone', 'email')),
  contact_value TEXT NOT NULL,
  otp_code      TEXT NOT NULL,
  attempts      INT NOT NULL DEFAULT 0 CHECK (attempts <= 5),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.contact_verifications IS 'Almacenamiento de desafíos OTP para verificación en dos pasos (2FA) de celular y correo.';

-- Habilitar RLS
ALTER TABLE public.contact_verifications ENABLE ROW LEVEL SECURITY;

-- Políticas RLS:
CREATE POLICY "Users view own verifications" ON public.contact_verifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own verifications" ON public.contact_verifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own verifications" ON public.contact_verifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_contact_verifications_user ON public.contact_verifications(user_id);
