-- Migration: a demoted supervisor loses the team (odd/tasks/commercial-crm.md, S3)
--
-- validate_profile_supervisor only fires on the advisor's own row, so changing a
-- supervisor's role left their advisors pointing at them, and the supervisor-scoped
-- RLS and RPC checks (supervisor_id = auth.uid()) kept granting access, now also to
-- the revenue figures of advisor_monthly_metrics.
--
--   1. Trigger: when a supervisor stops being one, their advisors are released.
--      Together with validate_profile_supervisor this keeps the invariant
--      "supervisor_id only points to a supervisor".
--   2. Defence in depth: is_supervisor_of and the team SELECT policy also require
--      the caller to hold the supervisor role (is_supervisor(), same source as is_admin()).

CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'supervisor'
  );
$$;

REVOKE ALL ON FUNCTION public.is_supervisor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor() TO authenticated, service_role;

-- CREATE OR REPLACE keeps the grants set earlier (anon already revoked).
CREATE OR REPLACE FUNCTION public.is_supervisor_of(p_advisor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_supervisor() AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_advisor_id AND supervisor_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Supervisors view their team" ON public.profiles;
CREATE POLICY "Supervisors view their team"
  ON public.profiles FOR SELECT TO authenticated
  USING (supervisor_id = auth.uid() AND public.is_supervisor());

-- SECURITY DEFINER so the release runs as the table owner and is not stopped by
-- the privileged-column guard, whoever changes the role.
CREATE OR REPLACE FUNCTION public.release_team_on_supervisor_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET supervisor_id = NULL WHERE supervisor_id = OLD.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS c_release_team_on_supervisor_role_change ON public.profiles;
CREATE TRIGGER c_release_team_on_supervisor_role_change
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role = 'supervisor' AND NEW.role IS DISTINCT FROM 'supervisor')
  EXECUTE FUNCTION public.release_team_on_supervisor_role_change();
