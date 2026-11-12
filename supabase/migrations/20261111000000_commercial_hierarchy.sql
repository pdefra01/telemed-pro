-- Migration: commercial hierarchy (odd/tasks/commercial-crm.md, S2, S3, S7)
--
-- One-level structure: a `supervisor` has many advisors; an advisor has at
-- most one supervisor (profiles.supervisor_id). The advisor stays the existing
-- `advisor` role (advisor id = profiles.id = producers.id).
--
--   1. profiles_role_check accepts 'supervisor'.
--   2. profiles.supervisor_id (nullable, ON DELETE SET NULL).
--   3. validate_profile_supervisor: only an advisor can have a supervisor and
--      that supervisor must hold the supervisor role (one level only).
--   4. guard_profile_privileged_columns also protects supervisor_id, so an
--      advisor cannot pick their own supervisor and a supervisor cannot move
--      advisors around. Admins and SECURITY DEFINER code are unaffected.
--   5. is_supervisor_of(advisor_id) helper and a SELECT policy so a supervisor
--      reads the profiles of their own team.

-- 1. Role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('patient', 'doctor', 'admin', 'advisor', 'supervisor'));

-- 2. Column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_supervisor_id ON public.profiles(supervisor_id) WHERE supervisor_id IS NOT NULL;
COMMENT ON COLUMN public.profiles.supervisor_id IS 'Supervisor of an advisor (one level). Privileged: only admins or the server may change it.';

-- 3. Validation
-- SECURITY DEFINER so the check does not depend on which profiles the writer
-- can see through RLS (an advisor cannot read their supervisor's row).
CREATE OR REPLACE FUNCTION public.validate_profile_supervisor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supervisor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM 'advisor' THEN
    RAISE EXCEPTION 'Solo un asesor puede tener supervisor.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.supervisor_id AND role = 'supervisor') THEN
    RAISE EXCEPTION 'El supervisor asignado debe tener rol de supervisor.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_validate_profile_supervisor ON public.profiles;
CREATE TRIGGER b_validate_profile_supervisor
  BEFORE INSERT OR UPDATE OF supervisor_id, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_supervisor();

-- 4. Guard: supervisor_id joins the privileged columns
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only direct writes through the API roles are restricted.
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Profiles are created only by handle_new_user (SECURITY DEFINER). A direct
    -- insert would let a user delete their row and re-create it with any value
    -- (the Self manage policy also allows DELETE), so it is always rejected.
    RAISE EXCEPTION 'No tenés permiso para crear perfiles.' USING ERRCODE = '42501';
  END IF;

  IF NEW.role                IS DISTINCT FROM OLD.role
     OR NEW.is_active          IS DISTINCT FROM OLD.is_active
     OR NEW.plan_id            IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_name          IS DISTINCT FROM OLD.plan_name
     OR NEW.plan_status        IS DISTINCT FROM OLD.plan_status
     OR NEW.payment_status     IS DISTINCT FROM OLD.payment_status
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.agreement_id       IS DISTINCT FROM OLD.agreement_id
     OR NEW.producer_id        IS DISTINCT FROM OLD.producer_id
     OR NEW.supervisor_id      IS DISTINCT FROM OLD.supervisor_id
     OR NEW.promoter_code      IS DISTINCT FROM OLD.promoter_code
     OR NEW.is_verified        IS DISTINCT FROM OLD.is_verified
     OR NEW.is_dni_verified    IS DISTINCT FROM OLD.is_dni_verified
     OR NEW.credential_issued_at IS DISTINCT FROM OLD.credential_issued_at
     OR NEW.credential_hash    IS DISTINCT FROM OLD.credential_hash
     OR NEW.rating             IS DISTINCT FROM OLD.rating
     OR NEW.review_count       IS DISTINCT FROM OLD.review_count
     OR NEW.consultation_fee   IS DISTINCT FROM OLD.consultation_fee
     OR NEW.contract_start_date IS DISTINCT FROM OLD.contract_start_date
     OR NEW.contract_end_date  IS DISTINCT FROM OLD.contract_end_date THEN
    RAISE EXCEPTION 'No tenés permiso para modificar esos datos del perfil.' USING ERRCODE = '42501';
  END IF;

  IF NEW.family_group_id IS DISTINCT FROM OLD.family_group_id
     AND NOT EXISTS (
       SELECT 1 FROM public.family_groups
       WHERE id = NEW.family_group_id AND primary_affiliate_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Solo podés vincular tu perfil a un grupo familiar del que sos titular.' USING ERRCODE = '42501';
  END IF;

  IF NEW.current_period_quota_used IS DISTINCT FROM OLD.current_period_quota_used
     AND COALESCE(NEW.current_period_quota_used, 0) < COALESCE(OLD.current_period_quota_used, 0) THEN
    RAISE EXCEPTION 'No tenés permiso para modificar esos datos del perfil.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profile_privileged_columns() IS 'Rejects direct anon/authenticated non-admin writes to privileged profile columns (role, plan, coverage, verification, commercial fields incl. supervisor_id). SECURITY DEFINER RPCs and the service role are not restricted.';

-- 5. Team visibility
CREATE OR REPLACE FUNCTION public.is_supervisor_of(p_advisor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_advisor_id AND supervisor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_supervisor_of(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Supervisors view their team" ON public.profiles;
CREATE POLICY "Supervisors view their team"
  ON public.profiles FOR SELECT TO authenticated
  USING (supervisor_id = auth.uid());
