-- Migration: prospects (odd/tasks/commercial-crm.md, S4-S6)
--
-- Manual prospect database owned by an advisor. Pipeline:
-- new -> contacted -> interested -> affiliated | lost.
-- `source` already allows the automatic channels planned for a later delivery.
--
-- Visibility (RLS):
--   advisor     reads and writes only their own prospects;
--   supervisor  reads the prospects of the advisors on their team;
--   admin       reads and writes everything.

CREATE TABLE IF NOT EXISTS public.prospects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  full_name             TEXT NOT NULL CHECK (length(btrim(full_name)) > 0),
  phone                 TEXT,
  email                 TEXT,
  notes                 TEXT,
  status                TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'contacted', 'interested', 'affiliated', 'lost')),
  source                TEXT NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'lead_survey', 'adhesion')),
  last_contact_at       TIMESTAMPTZ,
  converted_profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prospects IS 'CRM prospects owned by an advisor (advisor id = profiles.id = producers.id).';

CREATE INDEX IF NOT EXISTS idx_prospects_advisor_status ON public.prospects(advisor_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_last_contact ON public.prospects(last_contact_at);

-- A prospect can only belong to an advisor. SECURITY DEFINER so the check does
-- not depend on which profiles the writer can see through RLS.
CREATE OR REPLACE FUNCTION public.validate_prospect_advisor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.advisor_id AND role = 'advisor') THEN
    RAISE EXCEPTION 'El prospecto debe pertenecer a un asesor.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_prospect_advisor ON public.prospects;
CREATE TRIGGER validate_prospect_advisor
  BEFORE INSERT OR UPDATE OF advisor_id ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.validate_prospect_advisor();

CREATE OR REPLACE FUNCTION public.touch_prospect_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_prospect_updated_at ON public.prospects;
CREATE TRIGGER touch_prospect_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_prospect_updated_at();

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage prospects" ON public.prospects;
DROP POLICY IF EXISTS "Advisors manage their prospects" ON public.prospects;
DROP POLICY IF EXISTS "Supervisors view team prospects" ON public.prospects;

CREATE POLICY "Admins manage prospects"
  ON public.prospects FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Advisors manage their prospects"
  ON public.prospects FOR ALL TO authenticated
  USING (advisor_id = auth.uid())
  WITH CHECK (advisor_id = auth.uid());

CREATE POLICY "Supervisors view team prospects"
  ON public.prospects FOR SELECT TO authenticated
  USING (public.is_supervisor_of(advisor_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospects TO authenticated;
GRANT ALL ON public.prospects TO service_role;
