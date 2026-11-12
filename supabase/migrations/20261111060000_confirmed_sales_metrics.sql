-- Migration: only paid sales count in the advisor metrics (odd/tasks/commercial-crm.md, S14)
--
-- Decision: a sale counts for commission, revenue and goals only once the affiliate has a
-- confirmed payment, i.e. at least one `payment` movement with a positive amount in the
-- receivables ledger. Activation itself does not depend on payment (decided 2026-10-06).
--
-- advisor_monthly_metrics changes accordingly:
--   affiliates_sold, revenue    approved sales whose affiliate has a positive payment, placed in
--                               the month (Argentina time) of the FIRST such payment. A sale
--                               activated in October and paid in November counts in November.
--   affiliates_unconfirmed      NEW. Snapshot: approved sales (promoter_id = the advisor's code) with no
--                               positive payment at all. A sale with no approved profile can never be paid.
-- Everything else (scope, prospects, links, goals) is unchanged. The return type gains a column, so the
-- function is dropped and recreated, and its grants set again.

DROP FUNCTION IF EXISTS public.advisor_monthly_metrics(DATE, TIMESTAMPTZ);

CREATE FUNCTION public.advisor_monthly_metrics(p_month DATE, p_as_of TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
  advisor_id              UUID,
  advisor_name            TEXT,
  supervisor_id           UUID,
  month                   DATE,
  affiliates_sold         BIGINT,
  revenue                 NUMERIC,
  prospects_loaded        BIGINT,
  prospects_contacted     BIGINT,
  prospects_affiliated    BIGINT,
  prospects_stale         BIGINT,
  links_shared            INTEGER,
  goal_affiliates         INTEGER,
  goal_revenue            NUMERIC,
  affiliates_unconfirmed  BIGINT
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
  first_payment AS (
    SELECT m.entity_id, min(m.created_at) AS paid_at
      FROM public.affiliate_account_movements m
     WHERE m.entity_type = 'affiliate' AND m.type = 'payment' AND m.amount > 0
     GROUP BY m.entity_id
  ),
  sales AS (
    SELECT v.id AS advisor_id,
           count(ar.id) AS sold,
           COALESCE(sum(pl.monthly_cost), 0) AS revenue
      FROM visible v
      JOIN public.adhesion_requests ar
        ON ar.promoter_id = v.promoter_code
       AND ar.status = 'approved'
      JOIN first_payment fp
        ON fp.entity_id = ar.approved_profile_id
       AND (fp.paid_at AT TIME ZONE v_tz)::date >= v_month
       AND (fp.paid_at AT TIME ZONE v_tz)::date <  v_next
      LEFT JOIN public.profiles ap ON ap.id = ar.approved_profile_id
      LEFT JOIN public.plans pl ON pl.id = ap.plan_id
     GROUP BY v.id
  ),
  unconfirmed AS (
    SELECT v.id AS advisor_id, count(ar.id) AS cnt
      FROM visible v
      JOIN public.adhesion_requests ar
        ON ar.promoter_id = v.promoter_code
       AND ar.status = 'approved'
     WHERE NOT EXISTS (SELECT 1 FROM first_payment fp WHERE fp.entity_id = ar.approved_profile_id)
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
         g.target_revenue::numeric,
         COALESCE(u.cnt, 0)::bigint
    FROM visible v
    LEFT JOIN sales s ON s.advisor_id = v.id
    LEFT JOIN unconfirmed u ON u.advisor_id = v.id
    LEFT JOIN pros x ON x.advisor_id = v.id
    LEFT JOIN public.producers pd ON pd.id = v.id
    LEFT JOIN public.advisor_goals g ON g.advisor_id = v.id AND g.month = v_month
   ORDER BY v.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.advisor_monthly_metrics(DATE, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_monthly_metrics(DATE, TIMESTAMPTZ) TO authenticated, service_role;
