-- WhatsApp bot on the Medinex number (odd/tasks/whatsapp-bot.md, T1).
--
--   * producers.receives_bot_leads: the admin marks which advisors receive bot leads.
--   * prospects.source gains 'whatsapp_bot'.
--   * whatsapp_bot_conversations: per-phone bot state (bot / handed_off) and short history.
--   * whatsapp_bot_inbound: processed WAHA message ids, so a retried webhook is handled once.
--   * whatsapp_bot_contact_kind(phone): affiliate / staff / unknown, for the bot routing.
--   * assign_whatsapp_bot_lead(...): round-robin among active, marked advisors; creates the
--     prospect (or reuses an open one for the same phone) in one transaction.
-- All bot objects are server-side only (service_role).

-- 1. Advisor toggle and round-robin cursor ----------------------------------------------
ALTER TABLE public.producers
  ADD COLUMN IF NOT EXISTS receives_bot_leads BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_lead_last_assigned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.producers.receives_bot_leads IS 'Admin toggle "Recibe leads del bot": the advisor enters the WhatsApp bot round-robin while active.';
COMMENT ON COLUMN public.producers.bot_lead_last_assigned_at IS 'Last WhatsApp bot lead assigned to this advisor; the round-robin picks the oldest.';

-- 2. Prospect source ---------------------------------------------------------------------
ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_source_check;
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_source_check
  CHECK (source IN ('manual', 'lead_survey', 'adhesion', 'whatsapp_bot'));

-- 3. Conversation state ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_bot_conversations (
  phone            TEXT PRIMARY KEY,               -- normalized, e.g. 5493871234567
  mode             TEXT NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot', 'handed_off')),
  history          JSONB NOT NULL DEFAULT '[]'::jsonb,
  bot_reply_times  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- bot replies in the last hour (cap)
  contact_name     TEXT,
  prospect_id      UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  handed_off_at    TIMESTAMPTZ,
  last_inbound_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_bot_conversations IS 'WhatsApp bot state per contact phone. Server-side only.';

CREATE TABLE IF NOT EXISTS public.whatsapp_bot_inbound (
  message_id   TEXT PRIMARY KEY,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_bot_inbound IS 'WAHA message ids already handled by the bot (webhook retries are idempotent). Server-side only.';

ALTER TABLE public.whatsapp_bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_bot_inbound ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_bot_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_bot_inbound FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_bot_conversations TO service_role;
GRANT ALL ON public.whatsapp_bot_inbound TO service_role;

-- 4. Who is writing ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_bot_contact_kind(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE public.normalize_ar_phone(p.phone) = public.normalize_ar_phone(p_phone)
        AND (p.role = 'patient' OR (p.role = 'advisor' AND p.plan_id IS NOT NULL))
    ) THEN 'affiliate'
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE public.normalize_ar_phone(p.phone) = public.normalize_ar_phone(p_phone)
        AND p.role <> 'patient'
    ) THEN 'staff'
    ELSE 'unknown'
  END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_bot_contact_kind(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_bot_contact_kind(TEXT) TO service_role;

COMMENT ON FUNCTION public.whatsapp_bot_contact_kind(TEXT) IS 'affiliate (patient, or advisor with a plan), staff (any other profile) or unknown, by normalized phone. WhatsApp bot routing; service_role only.';

-- 5. Round-robin assignment --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_whatsapp_bot_lead(
  p_full_name TEXT,
  p_phone     TEXT,
  p_notes     TEXT
)
RETURNS TABLE (
  prospect_id    UUID,
  advisor_id     UUID,
  advisor_name   TEXT,
  advisor_phone  TEXT,
  reused         BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_phone    TEXT := public.normalize_ar_phone(p_phone);
  v_name     TEXT := COALESCE(NULLIF(btrim(p_full_name), ''), 'Contacto WhatsApp');
  v_existing RECORD;
  v_advisor  UUID;
  v_prospect UUID;
BEGIN
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  -- An open prospect for the same phone keeps its advisor (no duplicate lead),
  -- as long as that advisor is still active and in the bot rotation.
  SELECT x.id, x.advisor_id INTO v_existing
    FROM public.prospects x
    JOIN public.producers pr ON pr.id = x.advisor_id
   WHERE public.normalize_ar_phone(x.phone) = v_phone
     AND x.status NOT IN ('affiliated', 'lost')
     AND pr.status = 'active' AND pr.receives_bot_leads
   ORDER BY x.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.prospects
       SET notes = concat_ws(E'\n\n', notes, p_notes)
     WHERE id = v_existing.id;
    v_prospect := v_existing.id;
    v_advisor := v_existing.advisor_id;
    RETURN QUERY
      SELECT v_prospect, v_advisor, pr.name, COALESCE(NULLIF(pr.phone, ''), pf.phone), true
        FROM public.producers pr
        LEFT JOIN public.profiles pf ON pf.id = pr.id
       WHERE pr.id = v_advisor;
    RETURN;
  END IF;

  -- Oldest-served eligible advisor. SKIP LOCKED lets a concurrent lead take the next one;
  -- if every candidate is locked, wait for the first.
  SELECT pr.id INTO v_advisor
    FROM public.producers pr
    JOIN public.profiles pf ON pf.id = pr.id AND pf.role = 'advisor'
   WHERE pr.status = 'active' AND pr.receives_bot_leads
   ORDER BY pr.bot_lead_last_assigned_at NULLS FIRST, pr.id
   LIMIT 1
   FOR UPDATE OF pr SKIP LOCKED;

  IF v_advisor IS NULL THEN
    SELECT pr.id INTO v_advisor
      FROM public.producers pr
      JOIN public.profiles pf ON pf.id = pr.id AND pf.role = 'advisor'
     WHERE pr.status = 'active' AND pr.receives_bot_leads
     ORDER BY pr.bot_lead_last_assigned_at NULLS FIRST, pr.id
     LIMIT 1
     FOR UPDATE OF pr;
  END IF;

  IF v_advisor IS NULL THEN
    RETURN;  -- no advisor in the rotation: the caller falls back
  END IF;

  UPDATE public.producers SET bot_lead_last_assigned_at = now() WHERE id = v_advisor;

  INSERT INTO public.prospects (advisor_id, full_name, phone, notes, status, source)
  VALUES (v_advisor, v_name, v_phone, p_notes, 'new', 'whatsapp_bot')
  RETURNING id INTO v_prospect;

  RETURN QUERY
    SELECT v_prospect, v_advisor, pr.name, COALESCE(NULLIF(pr.phone, ''), pf.phone), false
      FROM public.producers pr
      LEFT JOIN public.profiles pf ON pf.id = pr.id
     WHERE pr.id = v_advisor;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_whatsapp_bot_lead(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_whatsapp_bot_lead(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.assign_whatsapp_bot_lead(TEXT, TEXT, TEXT) IS 'Creates a whatsapp_bot prospect assigned round-robin among active advisors with receives_bot_leads, or reuses an open prospect for the same phone. Returns no row when nobody is in the rotation. service_role only.';
