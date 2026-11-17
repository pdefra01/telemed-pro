-- Migration: debit alerts to the advisor
--
-- The advisor who brought an affiliate is told (in-app notification + WhatsApp) when the
-- affiliate's Mercado Pago debit needs a follow-up. server/debitAdvisorAlerts.js runs
-- debit_advisor_alerts_due() periodically and claims each alert in debit_advisor_alerts before
-- sending it, so an alert is sent at most once.
--
-- Kinds, always on the affiliate's CURRENT subscription (the newest row of the profile):
--   not_completed  status 'pending' for more than 1 day: the debit was never authorized.
--   rejected       debit_rejection_pending() (20261111110000): payment_failed, or cancelled
--                  after a rejection with no payment since. Keyed by last_failure_at, so a new
--                  rejection alerts again.
--   cancelled      cancelled with no rejection: the affiliate stopped the debit in MP.
-- Affiliates with a scheduled or applied baja (affiliate_cancellations) are never alerted: their
-- debit is cancelled on purpose. Only advisors with an 'advisor' profile are alerted (the
-- "Landing Directo" placeholder has none).

CREATE TABLE IF NOT EXISTS public.debit_advisor_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.affiliate_payment_subscriptions(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('not_completed', 'rejected', 'cancelled')),
  event_at        TIMESTAMPTZ NOT NULL,
  advisor_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT debit_advisor_alerts_once UNIQUE (subscription_id, kind, event_at)
);

COMMENT ON TABLE public.debit_advisor_alerts IS 'Debit alerts already sent to the affiliate''s advisor, one per (subscription, kind, event). Service role only.';

-- Service role only: RLS on with no policy, and no grants to API roles.
ALTER TABLE public.debit_advisor_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.debit_advisor_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.debit_advisor_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.debit_advisor_alerts_due(p_pending_after INTERVAL DEFAULT INTERVAL '1 day')
RETURNS TABLE (
  subscription_id UUID,
  kind            TEXT,
  event_at        TIMESTAMPTZ,
  affiliate_id    UUID,
  affiliate_name  TEXT,
  affiliate_phone TEXT,
  advisor_id      UUID,
  advisor_phone   TEXT,
  failure_count   INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_sub AS (
    SELECT DISTINCT ON (s.profile_id) s.*
      FROM public.affiliate_payment_subscriptions s
     WHERE s.profile_id IS NOT NULL
     ORDER BY s.profile_id, s.created_at DESC, s.id DESC
  ),
  classified AS (
    SELECT c.id AS subscription_id,
           c.profile_id,
           c.failure_count,
           CASE
             WHEN c.status = 'pending' AND c.created_at <= now() - p_pending_after THEN 'not_completed'
             WHEN public.debit_rejection_pending(c.profile_id, c.status, c.last_failure_at) THEN 'rejected'
             WHEN c.status = 'cancelled' AND c.last_failure_at IS NULL THEN 'cancelled'
           END AS kind,
           CASE
             WHEN c.status = 'pending' THEN c.created_at
             WHEN c.last_failure_at IS NOT NULL THEN c.last_failure_at
             ELSE c.status_changed_at
           END AS event_at
      FROM current_sub c
  )
  SELECT k.subscription_id, k.kind, k.event_at,
         p.id, p.full_name, p.phone,
         a.id, a.phone, k.failure_count
    FROM classified k
    JOIN public.profiles p ON p.id = k.profile_id AND p.role = 'patient'
    JOIN public.profiles a ON a.id = public.advisor_for_affiliate(k.profile_id) AND a.role = 'advisor'
   WHERE k.kind IS NOT NULL
     AND k.event_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.affiliate_cancellations ac WHERE ac.profile_id = k.profile_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.debit_advisor_alerts d
        WHERE d.subscription_id = k.subscription_id AND d.kind = k.kind AND d.event_at = k.event_at);
$$;

COMMENT ON FUNCTION public.debit_advisor_alerts_due IS 'Debit alerts not yet sent to the affiliate''s advisor: not_completed (pending > p_pending_after), rejected, cancelled without a baja.';

REVOKE ALL ON FUNCTION public.debit_advisor_alerts_due(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_advisor_alerts_due(INTERVAL) TO service_role;
