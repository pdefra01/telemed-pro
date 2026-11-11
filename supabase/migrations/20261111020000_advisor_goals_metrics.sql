-- Migration: monthly goals and advisor metrics (odd/tasks/commercial-crm.md, S9-S11)
--
--   1. advisor_goals: one row per advisor and month with an optional affiliates
--      target and an optional revenue target. The supervisor sets goals for
--      their team, the admin for everyone, the advisor only reads their own.
--   2. advisor_monthly_metrics(p_month, p_as_of): per-advisor figures for a
--      month, scoped to the caller (advisor: self, supervisor: team, admin:
--      all). It is SECURITY DEFINER because adhesion_requests is admin-only
--      under RLS; the scope is enforced inside the function.
--
-- Definitions (months are Argentina local time):
--   affiliates_sold  approved adhesion requests whose promoter_id is the advisor's
--                    promoter_code, placed in the month of COALESCE(activated_at, created_at).
--   revenue          sum of plans.monthly_cost of those sales, resolved through
--                    approved_profile_id -> profiles.plan_id; a sale with no
--                    resolvable plan counts as an affiliate and adds 0.
--   prospects_*      cohort of prospects CREATED in the month: loaded, contacted
--                    (has a contact date or is contacted/interested/affiliated)
--                    and affiliated.
--   prospects_stale  snapshot: open prospects (not affiliated/lost) whose last
--                    contact, or creation when never contacted, is 7+ days before p_as_of.
--   links_shared     cumulative producers.links_shared_count.

CREATE TABLE IF NOT EXISTS public.advisor_goals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month              DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  target_affiliates  INTEGER CHECK (target_affiliates >= 0),
  target_revenue     NUMERIC(12,2) CHECK (target_revenue >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_affiliates IS NOT NULL OR target_revenue IS NOT NULL),
  UNIQUE (advisor_id, month)
);

COMMENT ON TABLE public.advisor_goals IS 'Monthly goal of an advisor: affiliates and/or revenue target. month is the first day of the month.';

-- Same rule as prospects: the owner must be an advisor.
DROP TRIGGER IF EXISTS validate_goal_advisor ON public.advisor_goals;
CREATE TRIGGER validate_goal_advisor
  BEFORE INSERT OR UPDATE OF advisor_id ON public.advisor_goals
  FOR EACH ROW EXECUTE FUNCTION public.validate_prospect_advisor();

DROP TRIGGER IF EXISTS touch_goal_updated_at ON public.advisor_goals;
CREATE TRIGGER touch_goal_updated_at
  BEFORE UPDATE ON public.advisor_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_prospect_updated_at();

ALTER TABLE public.advisor_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage goals" ON public.advisor_goals;
DROP POLICY IF EXISTS "Supervisors manage team goals" ON public.advisor_goals;
DROP POLICY IF EXISTS "Advisors read their goals" ON public.advisor_goals;

CREATE POLICY "Admins manage goals"
  ON public.advisor_goals FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Supervisors manage team goals"
  ON public.advisor_goals FOR ALL TO authenticated
  USING (public.is_supervisor_of(advisor_id))
  WITH CHECK (public.is_supervisor_of(advisor_id));

CREATE POLICY "Advisors read their goals"
  ON public.advisor_goals FOR SELECT TO authenticated
  USING (advisor_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_goals TO authenticated;
GRANT ALL ON public.advisor_goals TO service_role;

CREATE OR REPLACE FUNCTION public.advisor_monthly_metrics(p_month DATE, p_as_of TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
  advisor_id           UUID,
  advisor_name         TEXT,
  supervisor_id        UUID,
  month                DATE,
  affiliates_sold      BIGINT,
  revenue              NUMERIC,
  prospects_loaded     BIGINT,
  prospects_contacted  BIGINT,
  prospects_affiliated BIGINT,
  prospects_stale      BIGINT,
  links_shared         INTEGER,
  goal_affiliates      INTEGER,
  goal_revenue         NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_tz     CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_month  DATE := date_trunc('month', p_month)::date;
  v_next   DATE := (date_trunc('month', p_month) + interval '1 month')::date;
  v_stale  CONSTANT INTERVAL := interval '7 days';
BEGIN
  RETURN QUERY
  WITH visible AS (
    SELECT p.id, p.full_name, p.supervisor_id, p.promoter_code
      FROM public.profiles p
     WHERE p.role = 'advisor'
       AND p.is_active IS NOT FALSE
       AND (p.id = auth.uid() OR p.supervisor_id = auth.uid() OR public.is_admin())
  ),
  sales AS (
    SELECT v.id AS advisor_id,
           count(ar.id) AS sold,
           COALESCE(sum(pl.monthly_cost), 0) AS revenue
      FROM visible v
      JOIN public.adhesion_requests ar
        ON ar.promoter_id = v.promoter_code
       AND ar.status = 'approved'
       AND (COALESCE(ar.activated_at, ar.created_at) AT TIME ZONE v_tz)::date >= v_month
       AND (COALESCE(ar.activated_at, ar.created_at) AT TIME ZONE v_tz)::date <  v_next
      LEFT JOIN public.profiles ap ON ap.id = ar.approved_profile_id
      LEFT JOIN public.plans pl ON pl.id = ap.plan_id
     GROUP BY v.id
  ),
  pros AS (
    SELECT pr.advisor_id,
           count(*) FILTER (WHERE (pr.created_at AT TIME ZONE v_tz)::date >= v_month
                              AND (pr.created_at AT TIME ZONE v_tz)::date <  v_next) AS loaded,
           count(*) FILTER (WHERE (pr.created_at AT TIME ZONE v_tz)::date >= v_month
                              AND (pr.created_at AT TIME ZONE v_tz)::date <  v_next
                              AND (pr.last_contact_at IS NOT NULL
                                   OR pr.status IN ('contacted', 'interested', 'affiliated'))) AS contacted,
           count(*) FILTER (WHERE (pr.created_at AT TIME ZONE v_tz)::date >= v_month
                              AND (pr.created_at AT TIME ZONE v_tz)::date <  v_next
                              AND pr.status = 'affiliated') AS affiliated,
           count(*) FILTER (WHERE pr.status NOT IN ('affiliated', 'lost')
                              AND COALESCE(pr.last_contact_at, pr.created_at) < p_as_of - v_stale) AS stale
      FROM public.prospects pr
     WHERE pr.advisor_id IN (SELECT id FROM visible)
     GROUP BY pr.advisor_id
  )
  SELECT v.id,
         v.full_name::text,
         v.supervisor_id,
         v_month,
         COALESCE(s.sold, 0)::bigint,
         COALESCE(s.revenue, 0)::numeric,
         COALESCE(x.loaded, 0)::bigint,
         COALESCE(x.contacted, 0)::bigint,
         COALESCE(x.affiliated, 0)::bigint,
         COALESCE(x.stale, 0)::bigint,
         COALESCE(pd.links_shared_count, 0)::integer,
         g.target_affiliates::integer,
         g.target_revenue::numeric
    FROM visible v
    LEFT JOIN sales s ON s.advisor_id = v.id
    LEFT JOIN pros x ON x.advisor_id = v.id
    LEFT JOIN public.producers pd ON pd.id = v.id
    LEFT JOIN public.advisor_goals g ON g.advisor_id = v.id AND g.month = v_month
   ORDER BY v.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.advisor_monthly_metrics(DATE, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_monthly_metrics(DATE, TIMESTAMPTZ) TO authenticated, service_role;

-- is_supervisor_of (previous migration) was revoked from PUBLIC only; Supabase's
-- default privileges also grant EXECUTE to anon explicitly, which REVOKE FROM PUBLIC
-- does not remove. Harmless (auth.uid() is null for anon) but not meant to be callable.
REVOKE EXECUTE ON FUNCTION public.is_supervisor_of(UUID) FROM anon;
