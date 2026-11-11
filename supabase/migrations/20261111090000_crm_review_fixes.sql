-- Migration: CRM code review fixes (odd/tasks/commercial-crm-commissions.md, S6)
--
--   * S6.3 Drift guard: prospects.status_changed_at records the last STATUS change (a BEFORE UPDATE trigger,
--     NULL until the first one). A pending adhesion request advances a prospect unless its status was changed
--     after the request; a prospect just created by the intake or one whose contact was registered (notes,
--     last_contact_at) still advances. An approved request still converts regardless.
--   * S6.2 Starvation: every adhesion request the intake handles is logged in prospect_intake_log
--     (source 'adhesion_pending' or 'adhesion_approved', source_ref = the request id, outcome 'processed'),
--     matched or not, and logged requests are left out of the scan. The 90-day window, the 500-row cap and the
--     oldest-first order stay. A request that goes pending -> approved is handled again under its approved
--     source. Approved requests without an approved profile cannot be linked yet, so they are not scanned
--     (and not logged) until the profile exists.
--   * S6.5 The function no longer carries a statement_timeout setting: a SET on a function does not bound the
--     statement that calls it, so it promised nothing.
--   * S6.8 A survey prospect's created_at is when it enters the CRM (now()), not the client-settable survey date.
--   * Consistency: advisor_monthly_metrics scopes the team with is_supervisor_of() like the RLS policies, so a
--     stale supervisor_id without the supervisor role grants nothing.
--   * S6.1 The seeded session policy gains the supervisor role (15 min inactivity, non-persistent) when missing.
--   * S6.4 confirmed_affiliate_ids(ids) returns each id with a positive ledger payment once (server only), so the
--     server never reads one row per payment through the 1000-row API cap.

-- ── S6.3: status_changed_at ─────────────────────────────────────────────────
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
COMMENT ON COLUMN public.prospects.status_changed_at IS 'Last time the status changed (NULL until the first change). The automatic intake does not overrule a status set after an adhesion request.';

CREATE OR REPLACE FUNCTION public.stamp_prospect_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_prospect_status_change ON public.prospects;
CREATE TRIGGER stamp_prospect_status_change
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.stamp_prospect_status_change();

-- ── S6.2: the intake log also remembers handled adhesion requests ───────────
ALTER TABLE public.prospect_intake_log DROP CONSTRAINT IF EXISTS prospect_intake_log_source_check;
ALTER TABLE public.prospect_intake_log ADD CONSTRAINT prospect_intake_log_source_check
  CHECK (source IN ('lead_survey', 'adhesion_pending', 'adhesion_approved'));
ALTER TABLE public.prospect_intake_log DROP CONSTRAINT IF EXISTS prospect_intake_log_outcome_check;
ALTER TABLE public.prospect_intake_log ADD CONSTRAINT prospect_intake_log_outcome_check
  CHECK (outcome IN ('created', 'duplicate', 'invalid', 'processed'));

-- CREATE OR REPLACE keeps the grants (service role only); the statement_timeout setting is reset below.
CREATE OR REPLACE FUNCTION public.sync_prospects_intake()
RETURNS TABLE (prospects_created BIGINT, prospects_interested BIGINT, prospects_converted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_daily_cap   CONSTANT INTEGER := 50;
  c_scan_cap    CONSTANT INTEGER := 500;
  v_created     BIGINT := 0;
  v_interested  BIGINT := 0;
  v_converted   BIGINT := 0;
  v_rows        BIGINT;
  r             RECORD;
  v_prospect    UUID;
  v_status      TEXT;
  v_phone       TEXT;
  v_email       TEXT;
  v_source      TEXT;
BEGIN
  -- 1. Lead surveys with consent -> new prospects (capped, deduplicated per advisor)
  FOR r IN
    SELECT s.id, s.full_name, s.whatsapp, s.interested_in_easier_access, s.fair_monthly_value,
           a.id AS advisor_id
      FROM public.lead_survey_responses s
      JOIN public.profiles a ON a.promoter_code = s.promoter_code AND a.role = 'advisor'
     WHERE s.consent_contact
       AND length(btrim(s.full_name)) > 0
       AND NOT EXISTS (SELECT 1 FROM public.prospect_intake_log l WHERE l.source = 'lead_survey' AND l.source_ref = s.id)
       -- advisors already at the daily cap are left out so their backlog does not fill the scan window
       AND (SELECT count(*) FROM public.prospect_intake_log l
             WHERE l.advisor_id = a.id AND l.outcome = 'created' AND l.processed_at > now() - interval '24 hours') < c_daily_cap
     ORDER BY s.created_at, s.id
     LIMIT c_scan_cap
  LOOP
    BEGIN
      IF (SELECT count(*) FROM public.prospect_intake_log l
           WHERE l.advisor_id = r.advisor_id AND l.outcome = 'created' AND l.processed_at > now() - interval '24 hours') >= c_daily_cap THEN
        CONTINUE;   -- stays queued for a later run
      END IF;

      v_phone := right(regexp_replace(COALESCE(r.whatsapp, ''), '\D', '', 'g'), 10);

      IF length(v_phone) < 8 THEN
        INSERT INTO public.prospect_intake_log (source, source_ref, advisor_id, outcome)
        VALUES ('lead_survey', r.id, r.advisor_id, 'invalid');
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.prospects p
         WHERE p.advisor_id = r.advisor_id
           AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_phone
      ) THEN
        INSERT INTO public.prospect_intake_log (source, source_ref, advisor_id, outcome)
        VALUES ('lead_survey', r.id, r.advisor_id, 'duplicate');
        CONTINUE;
      END IF;

      -- created_at is when the prospect enters the CRM: the survey date is set by the (anonymous) client
      INSERT INTO public.prospects (advisor_id, full_name, phone, notes, status, source, created_at)
      VALUES (
        r.advisor_id,
        left(btrim(r.full_name), 120),
        left(r.whatsapp, 40),
        left('Encuesta de opinión. Interesado en un acceso más fácil: '
             || CASE WHEN r.interested_in_easier_access THEN 'sí' ELSE 'no' END
             || '. Valor mensual que considera justo: $' || r.fair_monthly_value::text || '.', 500),
        'new',
        'lead_survey',
        now()
      )
      RETURNING id INTO v_prospect;

      INSERT INTO public.prospect_intake_log (source, source_ref, prospect_id, advisor_id, outcome)
      VALUES ('lead_survey', r.id, v_prospect, r.advisor_id, 'created');
      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_prospects_intake: lead survey % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- 2. Adhesion requests (last 90 days, not handled yet) -> advance the matching prospect of the same advisor
  FOR r IN
    SELECT ar.id, ar.status, ar.approved_profile_id, ar.titular_phone, ar.titular_email, ar.created_at, a.id AS advisor_id,
           CASE ar.status WHEN 'approved' THEN 'adhesion_approved' ELSE 'adhesion_pending' END AS log_source
      FROM public.adhesion_requests ar
      JOIN public.profiles a ON a.promoter_code = ar.promoter_id AND a.role = 'advisor'
     WHERE (ar.status = 'pending' OR (ar.status = 'approved' AND ar.approved_profile_id IS NOT NULL))
       AND ar.created_at > now() - interval '90 days'
       AND NOT EXISTS (
             SELECT 1 FROM public.prospect_intake_log l
              WHERE l.source = CASE ar.status WHEN 'approved' THEN 'adhesion_approved' ELSE 'adhesion_pending' END
                AND l.source_ref = ar.id)
     ORDER BY ar.created_at, ar.id
     LIMIT c_scan_cap
  LOOP
    BEGIN
      v_prospect := NULL;
      v_source := r.log_source;

      -- an approved request whose conversion already happened has nothing left to do
      IF r.status = 'pending' OR NOT EXISTS (
           SELECT 1 FROM public.prospects x WHERE x.advisor_id = r.advisor_id AND x.converted_profile_id = r.approved_profile_id) THEN
        v_phone := right(regexp_replace(COALESCE(r.titular_phone, ''), '\D', '', 'g'), 10);
        v_email := lower(btrim(COALESCE(r.titular_email, '')));

        SELECT p.id, p.status INTO v_prospect, v_status
          FROM public.prospects p
         WHERE p.advisor_id = r.advisor_id
           AND p.status <> 'affiliated'
           -- a pending request does not overrule a status the advisor set after the request
           AND (r.status = 'approved' OR p.status_changed_at IS NULL OR p.status_changed_at <= r.created_at)
           AND (
                (length(v_phone) >= 8 AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_phone)
             OR (v_email <> '' AND lower(btrim(COALESCE(p.email, ''))) = v_email)
           )
         ORDER BY (p.status = 'lost'), p.created_at, p.id
         LIMIT 1;

        IF v_prospect IS NOT NULL THEN
          IF r.status = 'approved' THEN
            UPDATE public.prospects SET status = 'affiliated', converted_profile_id = r.approved_profile_id WHERE id = v_prospect;
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_converted := v_converted + v_rows;
          ELSIF v_status IN ('new', 'contacted') THEN
            UPDATE public.prospects SET status = 'interested' WHERE id = v_prospect;
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_interested := v_interested + v_rows;
          END IF;
        END IF;
      END IF;

      -- handled (matched or not): never scanned again under this source
      INSERT INTO public.prospect_intake_log (source, source_ref, prospect_id, advisor_id, outcome)
      VALUES (v_source, r.id, v_prospect, r.advisor_id, 'processed');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_prospects_intake: adhesion request % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_created, v_interested, v_converted;
END;
$$;

-- S6.5: make sure the setting the hardening migration attached to the function is gone.
ALTER FUNCTION public.sync_prospects_intake() RESET statement_timeout;

COMMENT ON FUNCTION public.sync_prospects_intake() IS 'Automatic prospect intake (surveys -> prospects, adhesion requests -> advances). Server (service role) only; idempotent.';

-- ── Consistency: advisor_monthly_metrics scopes the team with is_supervisor_of() ──
-- Same body as 20261111060000_confirmed_sales_metrics.sql except the `visible` filter.
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
       AND (p.id = auth.uid() OR public.is_supervisor_of(p.id) OR public.is_admin())
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

-- ── S6.1: supervisors in the session policy (only when missing) ─────────────
UPDATE public.system_settings
   SET value = value || jsonb_build_object('supervisor', jsonb_build_object('timeoutMinutes', 15, 'persistent', false))
 WHERE key = 'session_security_policy'
   AND jsonb_typeof(value) = 'object'
   AND NOT (value ? 'supervisor');

-- ── S6.4: confirmed affiliates, one row per id ──────────────────────────────
CREATE OR REPLACE FUNCTION public.confirmed_affiliate_ids(p_profile_ids UUID[])
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.entity_id
    FROM public.affiliate_account_movements m
   WHERE m.entity_type = 'affiliate'
     AND m.type = 'payment'
     AND m.amount > 0
     AND m.entity_id = ANY (p_profile_ids);
$$;

COMMENT ON FUNCTION public.confirmed_affiliate_ids(UUID[]) IS 'Ids (of the given ones) with at least one positive ledger payment, each once. Server (service role) only.';

REVOKE ALL ON FUNCTION public.confirmed_affiliate_ids(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmed_affiliate_ids(UUID[]) TO service_role;
