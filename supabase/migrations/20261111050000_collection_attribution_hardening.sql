-- Migration: attribution hardening for collections (odd/tasks/commercial-crm.md, S13)
--
-- Independent verification of the collections migration found that the attribution of an
-- affiliate to an advisor could be forged:
--
--   adhesion_requests accepts anonymous INSERTs (public sign-up form) and nothing stopped the
--   caller from choosing `status`, `promoter_id` and `approved_profile_id`. A request inserted as
--   'approved' with another advisor's promoter_id and any profile's id as approved_profile_id made
--   that profile "brought" by that advisor. That already inflated sales and commissions; with the
--   collections list it would also hand the victim's name, phone, plan and balance to the advisor.
--
--   1. BEFORE INSERT trigger: a direct insert by anon / a non-admin signed-in user always arrives
--      as 'pending' with no approved_profile_id. Approval is a server-side (service role) or admin
--      action, which this does not touch.
--   2. Only patients can be claimed through an approved request, and the attribution is
--      deterministic when several requests disagree (earliest request wins), in the list and in
--      the policies alike.
--   3. advisor_collections no longer drops the affiliates of a deactivated advisor (they still
--      owe, and the policies already allowed reading them) and uses is_supervisor_of() for the
--      team, like the policies.
--
-- Existing rows are not rewritten. Rows forged before this migration can be spotted as approved
-- requests whose approval was not done by the server (see the pull request notes).

-- 1. Public inserts cannot choose their own approval or the profile they claim.
CREATE OR REPLACE FUNCTION public.protect_adhesion_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- is_admin() is only evaluated for signed-in callers (anon has no EXECUTE on it).
  IF current_user = 'anon' THEN
    NEW.status := 'pending';
    NEW.approved_profile_id := NULL;
  ELSIF current_user = 'authenticated' AND NOT public.is_admin() THEN
    NEW.status := 'pending';
    NEW.approved_profile_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS adhesion_requests_protect_approval_fields ON public.adhesion_requests;
CREATE TRIGGER adhesion_requests_protect_approval_fields
  BEFORE INSERT ON public.adhesion_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_adhesion_approval_fields();

-- 2. Deterministic, patient-only attribution (CREATE OR REPLACE keeps the existing grants).
CREATE OR REPLACE FUNCTION public.advisor_for_affiliate(p_affiliate_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.advisor_id FROM (
    SELECT p.producer_id AS advisor_id, 1 AS priority, NULL::timestamptz AS claimed_at, NULL::uuid AS claim_id
      FROM public.profiles p
     WHERE p.id = p_affiliate_id AND p.role = 'patient' AND p.producer_id IS NOT NULL
    UNION ALL
    SELECT a.id, 2, ar.created_at, ar.id
      FROM public.adhesion_requests ar
      JOIN public.profiles a  ON a.promoter_code = ar.promoter_id AND a.role = 'advisor'
      JOIN public.profiles pt ON pt.id = ar.approved_profile_id AND pt.role = 'patient'
     WHERE ar.approved_profile_id = p_affiliate_id AND ar.status = 'approved'
  ) s
  ORDER BY s.priority, s.claimed_at NULLS LAST, s.claim_id
  LIMIT 1;
$$;

-- 3. The list, with the same resolution as advisor_for_affiliate().
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
       AND (p.id = auth.uid() OR public.is_supervisor_of(p.id) OR public.is_admin())
  ),
  resolved AS (
    SELECT DISTINCT ON (s.affiliate_id) s.affiliate_id, s.advisor_id
      FROM (
        SELECT p.id AS affiliate_id, p.producer_id AS advisor_id, 1 AS priority,
               NULL::timestamptz AS claimed_at, NULL::uuid AS claim_id
          FROM public.profiles p
         WHERE p.role = 'patient' AND p.producer_id IS NOT NULL
        UNION ALL
        SELECT ar.approved_profile_id, a.id, 2, ar.created_at, ar.id
          FROM public.adhesion_requests ar
          JOIN public.profiles a  ON a.promoter_code = ar.promoter_id AND a.role = 'advisor'
          JOIN public.profiles pt ON pt.id = ar.approved_profile_id AND pt.role = 'patient'
         WHERE ar.status = 'approved'
      ) s
     ORDER BY s.affiliate_id, s.priority, s.claimed_at NULLS LAST, s.claim_id
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
