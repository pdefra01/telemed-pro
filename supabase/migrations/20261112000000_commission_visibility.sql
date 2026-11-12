-- Migration: commission visibility switch (odd/tasks/commission-visibility-toggle.md, S3, S4)
--
--   * S4 system_settings.commission_visibility = {"visible": boolean} decides whether advisors and supervisors see
--     commissions. Seeded off; a missing or malformed value means off. The admin edits it from Configuración
--     (system_settings is admin-only by RLS).
--   * S3 Enforced in the database: while off, an advisor or supervisor reads no row of advisor_commissions,
--     commission_liquidations, advisor_commission_summary() or advisor_commission_list(). The admin always reads
--     everything; generation, exclusion, approval and payment are unchanged.

-- ── S4: the switch ──────────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value)
VALUES ('commission_visibility', '{"visible": false}')
ON CONFLICT (key) DO NOTHING;

-- SECURITY DEFINER: advisors and supervisors cannot read system_settings themselves.
CREATE OR REPLACE FUNCTION public.commissions_visible()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN jsonb_typeof(value -> 'visible') = 'boolean' THEN (value ->> 'visible')::boolean END
       FROM public.system_settings
      WHERE key = 'commission_visibility'),
    false);
$$;

COMMENT ON FUNCTION public.commissions_visible() IS 'Whether advisors and supervisors may see commissions (system_settings.commission_visibility.visible). Missing or malformed means false.';

REVOKE ALL ON FUNCTION public.commissions_visible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commissions_visible() TO authenticated, service_role;

-- ── S3: read access follows the switch ──────────────────────────────────────
DROP POLICY IF EXISTS "Commission readers" ON public.advisor_commissions;
CREATE POLICY "Commission readers"
  ON public.advisor_commissions FOR SELECT TO authenticated
  USING (public.is_admin()
         OR (public.commissions_visible() AND (advisor_id = auth.uid() OR public.is_supervisor_of(advisor_id))));

DROP POLICY IF EXISTS "Liquidation readers" ON public.commission_liquidations;
CREATE POLICY "Liquidation readers"
  ON public.commission_liquidations FOR SELECT TO authenticated
  USING (public.is_admin()
         OR (public.commissions_visible() AND (advisor_id = auth.uid() OR public.is_supervisor_of(advisor_id))));

-- Same bodies as 20261111120000; only the scope condition gains the switch.
CREATE OR REPLACE FUNCTION public.advisor_commission_summary()
RETURNS TABLE (
  advisor_id        UUID,
  advisor_name      TEXT,
  generated_amount  NUMERIC,
  generated_count   BIGINT,
  retained_amount   NUMERIC,
  retained_count    BIGINT,
  to_collect_amount NUMERIC,
  to_collect_count  BIGINT,
  collected_amount  NUMERIC,
  collected_count   BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owners AS (
    SELECT p.id FROM public.profiles p WHERE p.role = 'advisor'
    UNION
    SELECT DISTINCT c.advisor_id FROM public.advisor_commissions c
  )
  SELECT o.id,
         COALESCE(v.full_name::text, o.id::text),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'generated'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'generated'),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'retained'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'retained'),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'approved'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'approved'),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'paid'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'paid')
    FROM owners o
    LEFT JOIN public.profiles v ON v.id = o.id
    LEFT JOIN public.advisor_commissions c ON c.advisor_id = o.id
   WHERE public.is_admin()
      OR (public.commissions_visible() AND (o.id = auth.uid() OR public.is_supervisor_of(o.id)))
   GROUP BY o.id, v.full_name
   ORDER BY 2, 1;
$$;

COMMENT ON FUNCTION public.advisor_commission_summary() IS 'Commission summary per advisor (S3): generated, retained, approved to collect, collected. Scope: own (advisor), team (supervisor), all (admin); advisors and supervisors only while commissions_visible().';

CREATE OR REPLACE FUNCTION public.advisor_commission_list(
  p_liquidation_id  UUID    DEFAULT NULL,
  p_advisor_id      UUID    DEFAULT NULL,
  p_unattached_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id                   UUID,
  advisor_id           UUID,
  advisor_name         TEXT,
  affiliate_profile_id UUID,
  affiliate_name       TEXT,
  plan_id              UUID,
  plan_name            TEXT,
  amount               NUMERIC,
  confirmed_at         TIMESTAMPTZ,
  status               TEXT,
  exclusion_reason     TEXT,
  retained_reason      TEXT,
  liquidation_id       UUID,
  liquidation_month    DATE,
  liquidation_status   TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- LEFT JOIN: a deleted advisor's commissions still show, named by their stored id
  SELECT c.id, c.advisor_id, COALESCE(v.full_name::text, c.advisor_id::text), c.affiliate_profile_id, ap.full_name::text,
         c.plan_id, pl.name::text, c.amount, c.confirmed_at, c.status, c.exclusion_reason, c.retained_reason,
         c.liquidation_id, l.month, l.status
    FROM public.advisor_commissions c
    LEFT JOIN public.profiles v ON v.id = c.advisor_id
    LEFT JOIN public.profiles ap ON ap.id = c.affiliate_profile_id
    LEFT JOIN public.plans pl ON pl.id = c.plan_id
    LEFT JOIN public.commission_liquidations l ON l.id = c.liquidation_id
   WHERE (public.is_admin()
          OR (public.commissions_visible() AND (c.advisor_id = auth.uid() OR public.is_supervisor_of(c.advisor_id))))
     AND (p_liquidation_id IS NULL OR c.liquidation_id = p_liquidation_id)
     AND (p_advisor_id IS NULL OR c.advisor_id = p_advisor_id)
     AND (NOT COALESCE(p_unattached_only, false) OR c.liquidation_id IS NULL)
   ORDER BY 3, c.confirmed_at, c.id;
$$;

COMMENT ON FUNCTION public.advisor_commission_list(UUID, UUID, BOOLEAN) IS 'Commissions with affiliate and plan names, optionally of one liquidation, one advisor and/or only unattached. Scope: own (advisor), team (supervisor), all (admin); advisors and supervisors only while commissions_visible().';
