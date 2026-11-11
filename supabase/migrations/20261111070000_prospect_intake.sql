-- Migration: automatic prospect intake (odd/tasks/commercial-crm.md, S15-S18)
--
-- Prospects now also arrive on their own, and adhesions advance them:
--
--   * lead_survey_responses with consent_contact = true become a `new` prospect of the advisor whose
--     promoter_code they carry (source 'lead_survey', created_at = the response's). prospect_intake_log
--     remembers every processed response, so an advisor who deletes the prospect does not get it back.
--   * An adhesion request is the CONVERSION of a prospect, never a source of one. A request whose
--     promoter_id is an advisor's code and whose phone (last 10 digits) or email matches one of THAT
--     advisor's prospects moves it forward: pending -> `interested` (only from new/contacted);
--       approved -> `affiliated` with converted_profile_id = approved_profile_id. Rejected requests change
--     nothing, an affiliated prospect is never downgraded, and one request converts one prospect (the
--     earliest created match). A request with no approved profile is skipped (it cannot be linked).
--
-- sync_prospects_intake() does both, is idempotent and is meant to be run by the server (service role)
-- every few minutes. A single bad row never blocks the rest.

CREATE TABLE IF NOT EXISTS public.prospect_intake_log (
  source        TEXT NOT NULL CHECK (source IN ('lead_survey')),
  source_ref    UUID NOT NULL,
  prospect_id   UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_ref)
);

COMMENT ON TABLE public.prospect_intake_log IS 'Processed automatic-intake sources, so a deleted prospect is never recreated. Server-side only.';

ALTER TABLE public.prospect_intake_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_intake_log FROM anon, authenticated;
GRANT ALL ON public.prospect_intake_log TO service_role;

CREATE OR REPLACE FUNCTION public.sync_prospects_intake()
RETURNS TABLE (prospects_created BIGINT, prospects_interested BIGINT, prospects_converted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created     BIGINT := 0;
  v_interested  BIGINT := 0;
  v_converted   BIGINT := 0;
  r             RECORD;
  v_prospect    UUID;
  v_status      TEXT;
  v_phone       TEXT;
  v_email       TEXT;
BEGIN
  -- 1. Lead surveys with consent -> new prospects
  FOR r IN
    SELECT s.id, s.full_name, s.whatsapp, s.pain_point, s.interested_in_easier_access,
           s.fair_monthly_value, s.created_at, a.id AS advisor_id
      FROM public.lead_survey_responses s
      JOIN public.profiles a ON a.promoter_code = s.promoter_code AND a.role = 'advisor'
     WHERE s.consent_contact
       AND length(btrim(s.full_name)) > 0
       AND NOT EXISTS (SELECT 1 FROM public.prospect_intake_log l WHERE l.source = 'lead_survey' AND l.source_ref = s.id)
     ORDER BY s.created_at, s.id
  LOOP
    BEGIN
      INSERT INTO public.prospects (advisor_id, full_name, phone, notes, status, source, created_at)
      VALUES (
        r.advisor_id,
        btrim(r.full_name),
        r.whatsapp,
        'Encuesta de opinión. Principal problema: ' || r.pain_point
          || '. Interesado en un acceso más fácil: ' || CASE WHEN r.interested_in_easier_access THEN 'sí' ELSE 'no' END
          || '. Valor mensual que considera justo: $' || r.fair_monthly_value::text || '.',
        'new',
        'lead_survey',
        r.created_at
      )
      RETURNING id INTO v_prospect;

      INSERT INTO public.prospect_intake_log (source, source_ref, prospect_id) VALUES ('lead_survey', r.id, v_prospect);
      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_prospects_intake: lead survey % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- 2. Adhesion requests -> convert the matching prospect of the same advisor
  FOR r IN
    SELECT ar.id, ar.status, ar.approved_profile_id, ar.titular_phone, ar.titular_email, a.id AS advisor_id
      FROM public.adhesion_requests ar
      JOIN public.profiles a ON a.promoter_code = ar.promoter_id AND a.role = 'advisor'
     WHERE ar.status IN ('pending', 'approved')
     ORDER BY ar.created_at, ar.id
  LOOP
    BEGIN
      -- Approved requests are linked through the profile they created; skip the legacy ones without it
      -- and the ones whose conversion already happened.
      IF r.status = 'approved' THEN
        IF r.approved_profile_id IS NULL THEN CONTINUE; END IF;
        IF EXISTS (SELECT 1 FROM public.prospects x WHERE x.advisor_id = r.advisor_id AND x.converted_profile_id = r.approved_profile_id) THEN
          CONTINUE;
        END IF;
      END IF;

      v_phone := right(regexp_replace(COALESCE(r.titular_phone, ''), '\D', '', 'g'), 10);
      v_email := lower(btrim(COALESCE(r.titular_email, '')));

      SELECT p.id, p.status INTO v_prospect, v_status
        FROM public.prospects p
       WHERE p.advisor_id = r.advisor_id
         AND p.status <> 'affiliated'
         AND (
              (length(v_phone) >= 8 AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_phone)
           OR (v_email <> '' AND lower(btrim(COALESCE(p.email, ''))) = v_email)
         )
       ORDER BY p.created_at, p.id
       LIMIT 1;

      IF v_prospect IS NULL THEN CONTINUE; END IF;

      IF r.status = 'approved' THEN
        UPDATE public.prospects SET status = 'affiliated', converted_profile_id = r.approved_profile_id WHERE id = v_prospect;
        v_converted := v_converted + 1;
      ELSIF v_status IN ('new', 'contacted') THEN
        UPDATE public.prospects SET status = 'interested' WHERE id = v_prospect;
        v_interested := v_interested + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sync_prospects_intake: adhesion request % skipped: %', r.id, SQLERRM;
    END;
    v_prospect := NULL;
  END LOOP;

  RETURN QUERY SELECT v_created, v_interested, v_converted;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_prospects_intake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_prospects_intake() TO service_role;
