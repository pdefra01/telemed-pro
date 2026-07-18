-- Migration: Create Advisor Profile and Announcements Tables
-- Description: Adds promoter_code to profiles, updates check constraint for roles, and establishes announcements and reads schema with RLS security policies.

-- 1. Actualización de restricción de roles en profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('patient', 'doctor', 'admin', 'advisor'));

-- 2. Extensión de profiles con código de promotor único
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS promoter_code TEXT UNIQUE;

-- 3. Tabla de Comunicados Gerenciales (announcements)
CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Habilitar RLS en announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para announcements
DROP POLICY IF EXISTS "All authenticated can view announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;

CREATE POLICY "All authenticated can view announcements" 
  ON public.announcements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage announcements" 
  ON public.announcements FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Tabla de Control de Lectura de Anuncios (announcement_reads)
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

-- Habilitar RLS en announcement_reads
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para announcement_reads
DROP POLICY IF EXISTS "Users view own reads" ON public.announcement_reads;
DROP POLICY IF EXISTS "Users insert own reads" ON public.announcement_reads;
DROP POLICY IF EXISTS "Users delete own reads" ON public.announcement_reads;

CREATE POLICY "Users view own reads" 
  ON public.announcement_reads FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users insert own reads" 
  ON public.announcement_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own reads" 
  ON public.announcement_reads FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Crear índices de velocidad
CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON public.announcement_reads(user_id);
