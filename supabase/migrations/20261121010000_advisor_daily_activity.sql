-- Migration: daily commercial activity per advisor (odd/tasks/team-activity-trends.md, S2, S4)
--
-- advisor_daily_activity(p_month) returns one row per advisor and Argentina day of the month that had
-- activity. Days without activity are omitted; the client fills them with zeros.
--
--   prospects_loaded      prospects created that day
--   prospects_affiliated  prospects whose status is 'affiliated', on the day of that status change
--   collection_actions    collection actions the advisor logged that day
--   affiliates_sold       approved adhesions whose first positive payment landed that day
--                         (same rule as advisor_monthly_metrics)
--   links_sent            distinct adhesion requests with a 'sent' payment link delivery that day
--   links_paid            of those, the ones whose affiliate has paid at any time since
--
-- Visibility is the same as advisor_monthly_metrics: the caller's own row, their team when they
-- supervise it, every advisor for an admin.

CREATE OR REPLACE FUNCTION public.advisor_daily_activity(p_month DATE)
RETURNS TABLE (
  advisor_id            UUID,
  day                   DATE,
  prospects_loaded      BIGINT,
  prospects_affiliated  BIGINT,
  collection_actions    BIGINT,
  affiliates_sold       BIGINT,
  links_sent            BIGINT,
  links_paid            BIGINT
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
BEGIN
  RETURN QUERY
  WITH visible AS (
    SELECT p.id, p.promoter_code
      FROM public.profiles p
     WHERE p.role = 'advisor'
       AND p.is_active IS NOT FALSE
       AND (p.id = auth.uid() OR public.is_supervisor_of(p.id) OR public.is_admin())
  ),
  first_payment AS (
    SELECT m.entity_id, min(m.created_at) AS paid_at
      FROM public.affiliate_account_movements m
     WHERE m.entity_type = 'affiliate' AND m.type = 'payment' AND m.amount > 0
     GROUP BY m.entity_id
  ),
  events AS (
    SELECT pr.advisor_id, (pr.created_at AT TIME ZONE v_tz)::date AS day, 'prospect_loaded'::text AS kind
      FROM public.prospects pr
     WHERE pr.advisor_id IN (SELECT id FROM visible)
    UNION ALL
    SELECT pr.advisor_id, (COALESCE(pr.status_changed_at, pr.created_at) AT TIME ZONE v_tz)::date, 'prospect_affiliated'
      FROM public.prospects pr
     WHERE pr.advisor_id IN (SELECT id FROM visible)
       AND pr.status = 'affiliated'
    UNION ALL
    SELECT ca.created_by, (ca.created_at AT TIME ZONE v_tz)::date, 'collection_action'
      FROM public.collection_actions ca
     WHERE ca.created_by IN (SELECT id FROM visible)
    UNION ALL
    SELECT v.id, (fp.paid_at AT TIME ZONE v_tz)::date, 'affiliate_sold'
      FROM visible v
      JOIN public.adhesion_requests ar
        ON ar.promoter_id = v.promoter_code
       AND ar.status = 'approved'
      JOIN first_payment fp ON fp.entity_id = ar.approved_profile_id
  ),
  links AS (
    SELECT DISTINCT v.id AS advisor_id,
           (d.created_at AT TIME ZONE v_tz)::date AS day,
           ar.id AS adhesion_request_id,
           EXISTS (SELECT 1 FROM first_payment fp WHERE fp.entity_id = ar.approved_profile_id) AS paid
      FROM visible v
      JOIN public.adhesion_requests ar ON ar.promoter_id = v.promoter_code
      JOIN public.adhesion_payment_link_deliveries d
        ON d.adhesion_request_id = ar.id
       AND d.status = 'sent'
  ),
  counts AS (
    SELECT e.advisor_id, e.day,
           count(*) FILTER (WHERE e.kind = 'prospect_loaded')     AS prospects_loaded,
           count(*) FILTER (WHERE e.kind = 'prospect_affiliated') AS prospects_affiliated,
           count(*) FILTER (WHERE e.kind = 'collection_action')   AS collection_actions,
           count(*) FILTER (WHERE e.kind = 'affiliate_sold')      AS affiliates_sold,
           0::bigint AS links_sent,
           0::bigint AS links_paid
      FROM events e
     WHERE e.day >= v_month AND e.day < v_next
     GROUP BY e.advisor_id, e.day
    UNION ALL
    SELECT l.advisor_id, l.day, 0, 0, 0, 0,
           count(*)                      AS links_sent,
           count(*) FILTER (WHERE l.paid) AS links_paid
      FROM links l
     WHERE l.day >= v_month AND l.day < v_next
     GROUP BY l.advisor_id, l.day
  )
  SELECT c.advisor_id,
         c.day,
         sum(c.prospects_loaded)::bigint,
         sum(c.prospects_affiliated)::bigint,
         sum(c.collection_actions)::bigint,
         sum(c.affiliates_sold)::bigint,
         sum(c.links_sent)::bigint,
         sum(c.links_paid)::bigint
    FROM counts c
   GROUP BY c.advisor_id, c.day
   ORDER BY c.day, c.advisor_id;
END;
$$;

COMMENT ON FUNCTION public.advisor_daily_activity(DATE) IS
  'Daily commercial activity per advisor for one month (Argentina days, days without activity omitted). Visibility matches advisor_monthly_metrics.';

REVOKE ALL ON FUNCTION public.advisor_daily_activity(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_daily_activity(DATE) TO authenticated, service_role;
