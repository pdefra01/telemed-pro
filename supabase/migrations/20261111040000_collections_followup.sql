-- Migration: collections follow-up (odd/tasks/commercial-crm.md, S12, S13)
--
-- Lets advisors follow the collections of the affiliates they brought and log
-- collection actions, and lets their supervisor (and the admin) see the same.
--
--   1. collection_actions: append-only log (call, whatsapp, visit, note, promise).
--      A promise needs a date, a note needs text. Advisors and admins insert,
--      advisors read their affiliates', supervisors read their team's.
--      API roles have no UPDATE/DELETE privilege: the history is immutable.
--   2. advisor_for_affiliate(): which advisor brought an affiliate. First
--      profiles.producer_id, then the approved adhesion request's promoter_id
--      (the attribution advisor_monthly_metrics uses for sales).
--   3. can_read_collections / can_log_collections: boolean helpers for the
--      policies (the advisor's identity is never returned to callers).
--   4. advisor_collections(): one row per affiliate brought by the advisors the
--      caller may see (self / team / admin), with payment status, balance,
--      coverage end and follow-up summary. SECURITY DEFINER because the ledger
--      views are self-or-admin only under RLS. Every status is listed: the
--      supervisor knows the situation whatever it is.

CREATE TABLE IF NOT EXISTS public.collection_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type    TEXT NOT NULL CHECK (action_type IN ('call', 'whatsapp', 'visit', 'note', 'promise')),
  note           TEXT,
  promised_date  DATE,
  created_by     UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT collection_actions_promise_needs_date CHECK (action_type <> 'promise' OR promised_date IS NOT NULL),
  CONSTRAINT collection_actions_note_needs_text CHECK (action_type <> 'note' OR length(btrim(COALESCE(note, ''))) > 0)
);

COMMENT ON TABLE public.collection_actions IS 'Append-only log of collection actions an advisor (or admin) took on an affiliate. Rows are never updated or deleted.';

CREATE INDEX IF NOT EXISTS idx_collection_actions_affiliate ON public.collection_actions(affiliate_id, created_at DESC);

-- Actions only make sense on affiliates (patients). SECURITY DEFINER: independent of the writer's RLS.
CREATE OR REPLACE FUNCTION public.validate_collection_action_affiliate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.affiliate_id AND role = 'patient') THEN
    RAISE EXCEPTION 'La gestión de cobro debe corresponder a un afiliado.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_collection_action_affiliate ON public.collection_actions;
CREATE TRIGGER validate_collection_action_affiliate
  BEFORE INSERT ON public.collection_actions
  FOR EACH ROW EXECUTE FUNCTION public.validate_collection_action_affiliate();

-- Internal: not granted to API roles (policies go through the boolean helpers below).
CREATE OR REPLACE FUNCTION public.advisor_for_affiliate(p_affiliate_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT advisor_id FROM (
    SELECT p.producer_id AS advisor_id, 1 AS priority
      FROM public.profiles p
     WHERE p.id = p_affiliate_id AND p.role = 'patient' AND p.producer_id IS NOT NULL
    UNION ALL
    SELECT a.id, 2
      FROM public.adhesion_requests ar
      JOIN public.profiles a ON a.promoter_code = ar.promoter_id AND a.role = 'advisor'
     WHERE ar.approved_profile_id = p_affiliate_id AND ar.status = 'approved'
  ) s
  ORDER BY priority
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.advisor_for_affiliate(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advisor_for_affiliate(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.can_log_collections(p_affiliate_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.advisor_for_affiliate(p_affiliate_id) = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_read_collections(p_affiliate_id UUID)
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

REVOKE ALL ON FUNCTION public.can_log_collections(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_collections(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_log_collections(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_collections(UUID) TO authenticated, service_role;

ALTER TABLE public.collection_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read collection actions" ON public.collection_actions;
DROP POLICY IF EXISTS "Log collection actions" ON public.collection_actions;

CREATE POLICY "Read collection actions"
  ON public.collection_actions FOR SELECT TO authenticated
  USING (public.can_read_collections(affiliate_id));

CREATE POLICY "Log collection actions"
  ON public.collection_actions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_log_collections(affiliate_id));

-- Append-only at the privilege layer too. Supabase's default privileges already grant
-- ALL on new public tables to anon and authenticated, so they must be taken away explicitly.
REVOKE ALL ON public.collection_actions FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.collection_actions FROM authenticated;
GRANT SELECT, INSERT ON public.collection_actions TO authenticated;
GRANT ALL ON public.collection_actions TO service_role;

CREATE OR REPLACE FUNCTION public.advisor_collections()
RETURNS TABLE (
  affiliate_id      UUID,
  affiliate_name    TEXT,
  affiliate_phone   TEXT,
  advisor_id        UUID,
  advisor_name      TEXT,
  plan_name         TEXT,
  payment_status    TEXT,
  balance           NUMERIC,
  paid_through      TIMESTAMPTZ,
  last_action_at    TIMESTAMPTZ,
  last_action_type  TEXT,
  promised_date     DATE,
  actions_count     BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH visible AS (
    SELECT p.id, p.full_name
      FROM public.profiles p
     WHERE p.role = 'advisor'
       AND p.is_active IS NOT FALSE
       AND (p.id = auth.uid() OR p.supervisor_id = auth.uid() OR public.is_admin())
  ),
  -- Same resolution as advisor_for_affiliate(), over every affiliate, so an affiliate
  -- never appears under an advisor other than the one the policies use.
  resolved AS (
    SELECT DISTINCT ON (s.affiliate_id) s.affiliate_id, s.advisor_id
      FROM (
        SELECT p.id AS affiliate_id, p.producer_id AS advisor_id, 1 AS priority
          FROM public.profiles p
         WHERE p.role = 'patient' AND p.producer_id IS NOT NULL
        UNION ALL
        SELECT ar.approved_profile_id, a.id, 2
          FROM public.adhesion_requests ar
          JOIN public.profiles a ON a.promoter_code = ar.promoter_id AND a.role = 'advisor'
         WHERE ar.status = 'approved' AND ar.approved_profile_id IS NOT NULL
      ) s
     ORDER BY s.affiliate_id, s.priority
  )
  SELECT p.id,
         p.full_name::text,
         p.phone::text,
         v.id,
         v.full_name::text,
         p.plan_name::text,
         COALESCE(ps.payment_status, 'current')::text,
         COALESCE(b.balance, 0)::numeric,
         w.paid_through,
         la.created_at,
         la.action_type::text,
         lp.promised_date,
         COALESCE(ac.cnt, 0)::bigint
    FROM resolved r
    JOIN visible v ON v.id = r.advisor_id
    JOIN public.profiles p ON p.id = r.affiliate_id
    LEFT JOIN public.affiliate_account_balances b ON b.entity_id = p.id
    LEFT JOIN public.affiliate_payment_status ps ON ps.entity_id = p.id
    LEFT JOIN public.family_coverage_windows w
      ON (p.family_group_id IS NOT NULL AND w.family_group_id = p.family_group_id)
      OR (p.family_group_id IS NULL AND w.subject_profile_id = p.id)
    LEFT JOIN LATERAL (
      SELECT a.created_at, a.action_type FROM public.collection_actions a
       WHERE a.affiliate_id = p.id ORDER BY a.created_at DESC, a.id DESC LIMIT 1
    ) la ON true
    LEFT JOIN LATERAL (
      SELECT a.promised_date FROM public.collection_actions a
       WHERE a.affiliate_id = p.id AND a.action_type = 'promise' ORDER BY a.created_at DESC, a.id DESC LIMIT 1
    ) lp ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt FROM public.collection_actions a WHERE a.affiliate_id = p.id
    ) ac ON true
   ORDER BY v.full_name, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.advisor_collections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_collections() TO authenticated, service_role;
