-- Migration: Subscription Onboarding, Legal Acceptance Audit and Producer Tracking
-- Description: Adds producers table, legal terms audit trail, and links profiles to referring producers.

-- 1. Create producers table (Asesores Comerciales / Productores)
CREATE TABLE IF NOT EXISTS public.producers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  producer_code   TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  phone           TEXT,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Create legal_terms table
CREATE TABLE IF NOT EXISTS public.legal_terms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version          TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 3. Create legal_acceptances table
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  accepted_at   TIMESTAMPTZ DEFAULT now(),
  ip_address    TEXT,
  user_agent    TEXT
);

-- 4. Extend profiles table with producer referral & subscription status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS producer_id UUID REFERENCES public.producers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'pending', 'cancelled', 'expired'));

-- Enable RLS
ALTER TABLE public.producers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Manage producers" ON public.producers FOR ALL TO authenticated USING (true);
CREATE POLICY "View legal terms" ON public.legal_terms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage legal acceptances" ON public.legal_acceptances FOR ALL TO authenticated USING (true);

-- Seed initial producers
INSERT INTO public.producers (name, producer_code, email, phone, commission_rate)
SELECT 'Carlos Gómez (Asesor Senior)', 'PROD-101', 'cgomez@medinex.com.ar', '011-4433-2211', 12.50
WHERE NOT EXISTS (SELECT 1 FROM public.producers WHERE producer_code = 'PROD-101');

INSERT INTO public.producers (name, producer_code, email, phone, commission_rate)
SELECT 'María Luz Fernández (Fuerza Ventas)', 'PROD-102', 'mluz@medinex.com.ar', '011-4433-2212', 10.00
WHERE NOT EXISTS (SELECT 1 FROM public.producers WHERE producer_code = 'PROD-102');

-- Seed initial legal terms v2.0
INSERT INTO public.legal_terms (version, title, content_markdown, is_active)
SELECT 'v2.0-2026', 'Términos y Condiciones Generales de Cobertura Médica', 
'# Condiciones Generales del Servicio MEDINEX v2.0\n\n1. **Objeto**: El presente contrato regula la prestación de servicios de telemedicina, recetas criptográficas y atención hospitalaria.\n2. **Derechos del Afiliado**: Acceso a consultas digitales 24/7, bóveda médica cifrada y descuentos en la red de farmacias adheridas.\n3. **Obligaciones**: Mantener al día la cuota mensual y proporcionar información fidedigna en las declaraciones juradas de salud.\n4. **Protección de Datos**: Los datos médicos se almacenan bajo estrictos estándares de confidencialidad y secreto profesional.', true
WHERE NOT EXISTS (SELECT 1 FROM public.legal_terms WHERE version = 'v2.0-2026');
