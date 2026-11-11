-- Migration: harden the automatic prospect intake (odd/tasks/commercial-crm.md, S16-S18)
--
-- Independent verification of 20261111070000_prospect_intake.sql found that, because the survey and
-- adhesion forms accept anonymous inserts, the intake made spam materially worse: every fake survey
-- became a prospect visible to the advisor, the supervisor and the admin. This migration:
--
--   * Spam: an advisor gets at most 50 automatic prospects per rolling 24 hours (the rest of the surveys
--     WAIT unprocessed, they are not dropped); a survey whose phone already belongs to a prospect of the
--     same advisor is skipped as 'duplicate'; one without a usable phone (< 8 digits) is skipped as
--     'invalid'. Skipped surveys are logged with their outcome so they are not rescanned. Names are cut to
--     120 characters, the survey date cannot be in the future, and a run looks at 500 candidates at most.
--   * Privacy: the survey's free-text `pain_point` (possibly health data) is no longer copied into the
--     prospect's notes, which supervisors can read although they cannot read survey rows.
--   * Drift: a pending request only advances a prospect the advisor has NOT touched since the request,
--     and prefers a live prospect over a lost one; an advisor who resets a prospect is not overruled
--     10 minutes later. An approved request still converts regardless (the affiliate exists).
--   * Cost: only requests from the last 90 days are examined, expression indexes make the phone/email
--     matches indexable, and the function has a 60 second statement timeout.
--   * The converted counter counts rows actually updated.

ALTER TABLE public.prospect_intake_log
  ADD COLUMN IF NOT EXISTS advisor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'created' CHECK (outcome IN ('created', 'duplicate', 'invalid'));

CREATE INDEX IF NOT EXISTS idx_prospect_intake_log_advisor_recent
  ON public.prospect_intake_log (advisor_id, processed_at) WHERE outcome = 'created';
CREATE INDEX IF NOT EXISTS idx_adhesion_requests_promoter_created
  ON public.adhesion_requests (promoter_id, created_at) WHERE promoter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_advisor_phone10
  ON public.prospects (advisor_id, (right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10)));
CREATE INDEX IF NOT EXISTS idx_prospects_advisor_email
  ON public.prospects (advisor_id, (lower(btrim(COALESCE(email, '')))));

-- CREATE OR REPLACE keeps the grants (service role only).
CREATE OR REPLACE FUNCTION public.sync_prospects_intake()
RETURNS TABLE (prospects_created BIGINT, prospects_interested BIGINT, prospects_converted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
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
BEGIN
  -- 1. Lead surveys with consent -> new prospects (capped, deduplicated per advisor)
  FOR r IN
    SELECT s.id, s.full_name, s.whatsapp, s.interested_in_easier_access, s.fair_monthly_value,
           s.created_at, a.id AS advisor_id
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
        LEAST(r.created_at, now())
      )
      RETURNING id INTO v_prospect;

      INSERT INTO public.prospect_intake_log (source, source_ref, prospect_id, advisor_id, outcome)
      VALUES ('lead_survey', r.id, v_prospect, r.advisor_id, 'created');
      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_prospects_intake: lead survey % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- 2. Adhesion requests (last 90 days) -> advance the matching prospect of the same advisor
  FOR r IN
    SELECT ar.id, ar.status, ar.approved_profile_id, ar.titular_phone, ar.titular_email, ar.created_at, a.id AS advisor_id
      FROM public.adhesion_requests ar
      JOIN public.profiles a ON a.promoter_code = ar.promoter_id AND a.role = 'advisor'
     WHERE ar.status IN ('pending', 'approved')
       AND ar.created_at > now() - interval '90 days'
     ORDER BY ar.created_at, ar.id
     LIMIT c_scan_cap
  LOOP
    BEGIN
      IF r.status = 'approved' THEN
        IF r.approved_profile_id IS NULL THEN CONTINUE; END IF;
        IF EXISTS (SELECT 1 FROM public.prospects x WHERE x.advisor_id = r.advisor_id AND x.converted_profile_id = r.approved_profile_id) THEN
          CONTINUE;
        END IF;
      END IF;

      v_phone := right(regexp_replace(COALESCE(r.titular_phone, ''), '\D', '', 'g'), 10);
      v_email := lower(btrim(COALESCE(r.titular_email, '')));

      v_prospect := NULL;
      SELECT p.id, p.status INTO v_prospect, v_status
        FROM public.prospects p
       WHERE p.advisor_id = r.advisor_id
         AND p.status <> 'affiliated'
         -- a pending request only advances a prospect the advisor has not touched since the request
         AND (r.status = 'approved' OR p.updated_at <= r.created_at)
         AND (
              (length(v_phone) >= 8 AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_phone)
           OR (v_email <> '' AND lower(btrim(COALESCE(p.email, ''))) = v_email)
         )
       ORDER BY (p.status = 'lost'), p.created_at, p.id
       LIMIT 1;

      IF v_prospect IS NULL THEN CONTINUE; END IF;

      IF r.status = 'approved' THEN
        UPDATE public.prospects SET status = 'affiliated', converted_profile_id = r.approved_profile_id WHERE id = v_prospect;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_converted := v_converted + v_rows;
      ELSIF v_status IN ('new', 'contacted') THEN
        UPDATE public.prospects SET status = 'interested' WHERE id = v_prospect;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_interested := v_interested + v_rows;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_prospects_intake: adhesion request % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_created, v_interested, v_converted;
END;
$$;
