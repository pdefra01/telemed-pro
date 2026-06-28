-- Migration: Create family_members table
-- Description: Stores individual members of a patient's family group for coverage plans.
-- Members are NOT auth users — they are dependents registered by the primary affiliate.

CREATE TABLE IF NOT EXISTS public.family_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  relation        TEXT NOT NULL CHECK (relation IN ('cónyuge', 'hijo/a', 'padre/madre', 'hermano/a', 'otro')),
  birth_date      DATE,
  dni             TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.family_members IS 'Dependents registered under a family group for coverage purposes. Not auth users.';

-- RLS
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Titular can manage their own family members
CREATE POLICY "Titular manages their family members"
  ON public.family_members
  FOR ALL
  TO authenticated
  USING (
    family_group_id IN (
      SELECT family_group_id FROM public.profiles WHERE id = auth.uid() AND family_group_id IS NOT NULL
    )
  )
  WITH CHECK (
    family_group_id IN (
      SELECT family_group_id FROM public.profiles WHERE id = auth.uid() AND family_group_id IS NOT NULL
    )
  );

-- Admins have full access
CREATE POLICY "Admins full access family_members"
  ON public.family_members
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- Doctors have read access for patient care
CREATE POLICY "Doctors read family_members"
  ON public.family_members
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'doctor');

-- Index for lookups by group
CREATE INDEX IF NOT EXISTS idx_family_members_group ON public.family_members(family_group_id);

