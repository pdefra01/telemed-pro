-- Migration: Authenticated read access to plans + atomic default-plan switch
-- Description:
-- 1. `public.plans` only had an admin-only `FOR ALL` policy, so regular
--    patients querying their own assigned plan (AffiliateRepository.
--    getConsultationQuotaStatus(), running on the anon-key browser client)
--    got zero rows back from RLS and were shown "Sin plan asignado" even
--    when a real plan_id was assigned. Plans are reference data, not
--    ownership-scoped like `profiles` — mirrors the authenticated-read
--    policy already granted on `office_locations`
--    (20260719070000_harden_doctor_shift_rls.sql). Write access stays
--    admin-only via the existing "Admins have full access to plans" policy.
-- 2. `PlanRepository.setDefault()` previously ran two sequential UPDATEs
--    (unset old default, then set new default) with no verification that
--    the second one affected a row. A failure between the two steps, or a
--    stale/deleted id on the second step, silently leaves zero default
--    plans — breaking /api/approve-adhesion's fallback-plan resolution.
--    Replaced with a single-statement, SECURITY DEFINER RPC that toggles
--    is_default for every row in one atomic UPDATE and raises if the
--    target id doesn't exist.

-- 1. Authenticated read access to plans (reference data, not ownership-scoped)
DROP POLICY IF EXISTS "Authenticated read plans" ON public.plans;
CREATE POLICY "Authenticated read plans"
  ON public.plans FOR SELECT
  TO authenticated
  USING (true);

-- 2. Atomic default-plan switch RPC
CREATE OR REPLACE FUNCTION public.set_default_plan(p_plan_id UUID)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plans;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Solo administradores pueden cambiar el plan por defecto.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;

  -- Single statement: sets is_default=true only for p_plan_id and false for
  -- every other row. One UPDATE instead of two sequential ones removes the
  -- window where a failure between steps (or a deleted target id) could
  -- leave the table with zero default plans.
  UPDATE public.plans
  SET is_default = (id = p_plan_id);

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  RETURN v_plan;
END;
$$;

COMMENT ON FUNCTION public.set_default_plan IS 'Marca p_plan_id como el único plan por defecto en una sola sentencia atómica; falla si el id no existe o el caller no es admin.';
