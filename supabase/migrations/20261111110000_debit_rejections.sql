-- Migration: debit rejections per affiliate (odd/tasks/commercial-crm-commissions.md, C1, S4/S5)
--
-- "Débito rechazado" = the affiliate's CURRENT débito subscription is 'payment_failed'.
-- The current subscription is the most recent non-reservation row of the affiliate
-- (status <> 'pending'): a reactivation always creates a new row, so the newest one wins.
-- The rejection date is its last_failure_at and the count its failure_count, both written by
-- record_mercadopago_subscription_event (webhook and periodic MP query alike).
--
--   1. advisor_collections() gains debit_rejected, debit_rejected_at, debit_failures. The return
--      type changes, so it is dropped and recreated; body, scope and grants are otherwise the
--      ones of 20261111050000_collection_attribution_hardening.sql.
--   2. admin_debit_rejections(): the Padrón de Afiliados mark and counter. SECURITY INVOKER on
--      purpose: affiliate_payment_subscriptions already has the admin RLS policy, so an admin
--      gets every row and nobody else gets anything that is not their own.

-- 1. The collections list, with the debit status.
DROP FUNCTION IF EXISTS public.advisor_collections();

CREATE FUNCTION public.advisor_collections()
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
  actions_count     BIGINT,
  debit_rejected    BOOLEAN,
  debit_rejected_at TIMESTAMPTZ,
  debit_failures    INTEGER
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
         COALESCE(ac.cnt, 0)::bigint,
         COALESCE(ds.status = 'payment_failed', false),
         ds.last_failure_at,
         COALESCE(ds.failure_count, 0)::integer
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
    LEFT JOIN LATERAL (
      SELECT s.status, s.last_failure_at, s.failure_count
        FROM public.affiliate_payment_subscriptions s
       WHERE s.profile_id = p.id AND s.status <> 'pending'
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 1
    ) ds ON true
   ORDER BY v.full_name, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.advisor_collections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_collections() TO authenticated, service_role;

-- 2. The Padrón de Afiliados: affiliates whose current debit is rejected.
CREATE OR REPLACE FUNCTION public.admin_debit_rejections()
RETURNS TABLE (
  profile_id        UUID,
  debit_rejected_at TIMESTAMPTZ,
  debit_failures    INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.profile_id, c.last_failure_at, c.failure_count
    FROM (
      SELECT DISTINCT ON (s.profile_id) s.profile_id, s.status, s.last_failure_at, s.failure_count
        FROM public.affiliate_payment_subscriptions s
       WHERE s.profile_id IS NOT NULL AND s.status <> 'pending'
       ORDER BY s.profile_id, s.created_at DESC, s.id DESC
    ) c
   WHERE c.status = 'payment_failed';
$$;

COMMENT ON FUNCTION public.admin_debit_rejections IS 'Affiliates whose current débito subscription is payment_failed, with the last rejection date and the failure count. SECURITY INVOKER: the admin RLS policy of affiliate_payment_subscriptions decides who sees what.';

REVOKE ALL ON FUNCTION public.admin_debit_rejections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_debit_rejections() TO authenticated, service_role;
