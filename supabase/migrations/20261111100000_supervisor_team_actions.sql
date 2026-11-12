-- Migration: the supervisor acts on their team (odd/tasks/commercial-crm-commissions.md, B1, S1)
--
--   * prospects: a supervisor creates and edits the prospects of the advisors on their
--     team, and reassigns them between advisors of the same team (WITH CHECK keeps the
--     new owner inside the team). Supervisors do not delete prospects.
--   * collection_actions: a supervisor logs actions on the affiliates of their team
--     (the INSERT policy already requires created_by = auth.uid()).
--
-- is_supervisor_of() requires the supervisor role, so a demoted supervisor loses all of it.
-- The validate_prospect_advisor trigger still requires the owner to be an advisor.

DROP POLICY IF EXISTS "Supervisors add team prospects" ON public.prospects;
DROP POLICY IF EXISTS "Supervisors edit team prospects" ON public.prospects;

CREATE POLICY "Supervisors add team prospects"
  ON public.prospects FOR INSERT TO authenticated
  WITH CHECK (public.is_supervisor_of(advisor_id));

CREATE POLICY "Supervisors edit team prospects"
  ON public.prospects FOR UPDATE TO authenticated
  USING (public.is_supervisor_of(advisor_id))
  WITH CHECK (public.is_supervisor_of(advisor_id));

-- CREATE OR REPLACE keeps the existing grants (authenticated, service_role; not anon).
CREATE OR REPLACE FUNCTION public.can_log_collections(p_affiliate_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR public.advisor_for_affiliate(p_affiliate_id) = auth.uid()
      OR public.is_supervisor_of(public.advisor_for_affiliate(p_affiliate_id));
$$;
