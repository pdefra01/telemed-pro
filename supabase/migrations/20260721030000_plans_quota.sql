-- Migration: Parameterizable plans + consultation quota (PR1 — DB foundation)
-- Description: `plans` becomes the single source of truth for quota/cost.
-- 1. `is_unlimited` flag disambiguates "no quota cap" from "0 bonified consultations"
--    (previously overloaded/absent — the source of the fabricated-quota bug).
-- 2. `plan_change_log` audit trail, filled by a SECURITY DEFINER trigger on `plans`,
--    captures every create/update/delete regardless of write path.
-- 3. `profiles.plan_name` stays a denormalized cache (kept — `doctor_queue` view
--    depends on it) but is now synced deterministically by a trigger instead of
--    app-side double-writes; assignment paths only need to set `plan_id`.
-- 4. Seed the canonical plan + backfill the one existing local patient row.

-- 1. is_unlimited flag + CHECK constraint
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_bonified_consultations_check;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_bonified_consultations_check
  CHECK (is_unlimited OR bonified_consultations >= 0);

-- Unique name so the idempotent seed below can use ON CONFLICT.
-- (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; guard via pg_constraint instead.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_name_key'
  ) THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_name_key UNIQUE (name);
  END IF;
END;
$$;

-- 2. Audit trail table
CREATE TABLE IF NOT EXISTS public.plan_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view plan change log" ON public.plan_change_log;
CREATE POLICY "Admins can view plan change log"
  ON public.plan_change_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.plan_change_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_change_log TO service_role;

-- 3. Audit trigger on plans (SECURITY DEFINER so it captures every write path,
-- including ones performed by roles without direct INSERT on plan_change_log)
CREATE OR REPLACE FUNCTION public.log_plan_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.plan_change_log (plan_id, operation, old_values, new_values, changed_by)
    VALUES (NEW.id, TG_OP, NULL, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.plan_change_log (plan_id, operation, old_values, new_values, changed_by)
    VALUES (NEW.id, TG_OP, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.plan_change_log (plan_id, operation, old_values, new_values, changed_by)
    VALUES (OLD.id, TG_OP, to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS plans_audit_trigger ON public.plans;
CREATE TRIGGER plans_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.log_plan_change();

-- 4. profiles.plan_name sync trigger (SECURITY DEFINER: plans RLS is admin-only,
-- but any authenticated user updating their own profile must still resolve the name)
CREATE OR REPLACE FUNCTION public.sync_profile_plan_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan_id IS NOT NULL THEN
    SELECT name INTO NEW.plan_name FROM public.plans WHERE id = NEW.plan_id;
  ELSE
    -- Unassigning a plan must clear the cached label too, or plan_name would
    -- keep showing the old plan's name after plan_id goes back to null.
    NEW.plan_name := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_profile_plan_name_trigger ON public.profiles;
CREATE TRIGGER sync_profile_plan_name_trigger
  BEFORE INSERT OR UPDATE OF plan_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_plan_name();

-- 5. Seed canonical plan + backfill the existing local patient row.
INSERT INTO public.plans (name, monthly_cost, bonified_consultations, is_unlimited, max_family_members)
VALUES ('Plan Familiar Medinex', 50000, 6, false, 4)
ON CONFLICT (name) DO NOTHING;

UPDATE public.profiles
SET plan_id = (SELECT id FROM public.plans WHERE name = 'Plan Familiar Medinex' LIMIT 1)
WHERE plan_name = 'Plan Familiar Medinex' AND plan_id IS NULL;
