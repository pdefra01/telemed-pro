-- Migration: Create adhesion_requests table
-- Description: Establishes the schema for public membership applications submitted via QR code.

CREATE TABLE IF NOT EXISTS public.adhesion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_name TEXT NOT NULL,
  titular_dni TEXT NOT NULL,
  titular_birth_date DATE NOT NULL,
  titular_address TEXT NOT NULL,
  titular_locality TEXT NOT NULL,
  titular_neighborhood TEXT NOT NULL,
  titular_email TEXT NOT NULL,
  titular_phone TEXT NOT NULL,
  titular_civil_status TEXT NOT NULL,
  titular_health_insurance TEXT,
  discovery_source TEXT,
  discovery_other TEXT,
  preferred_contact_time TEXT,
  plan_type TEXT DEFAULT 'Plan Familiar',
  payment_method TEXT NOT NULL,
  payment_detail TEXT,
  family_members JSONB DEFAULT '[]'::jsonb,
  medical_history TEXT[] DEFAULT '{}'::text[],
  medical_history_other TEXT,
  recommended_friend_phone TEXT,
  consent_data_treatment BOOLEAN DEFAULT false,
  consent_promotions BOOLEAN DEFAULT false,
  signature_base64 TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  promoter_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Establish RLS Security
ALTER TABLE public.adhesion_requests ENABLE ROW LEVEL SECURITY;

-- 1. Permitir inserciones públicas (sin autenticación para promotores y pacientes en calle)
CREATE POLICY "Enable public inserts"
ON public.adhesion_requests FOR INSERT
WITH CHECK (true);

-- 2. Permitir lecturas solo a Administradores
CREATE POLICY "Admins can view adhesion requests"
ON public.adhesion_requests FOR SELECT
TO authenticated
USING (public.is_admin());

-- 3. Permitir actualizaciones solo a Administradores (para aprobar/rechazar solicitudes)
CREATE POLICY "Admins can update adhesion requests"
ON public.adhesion_requests FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4. Permitir eliminación solo a Administradores
CREATE POLICY "Admins can delete adhesion requests"
ON public.adhesion_requests FOR DELETE
TO authenticated
USING (public.is_admin());
