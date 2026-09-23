-- Migration: Adhesion payment link delivery log
-- Description: Records every attempt to deliver the Mercado Pago payment link
-- for an adhesion request over WhatsApp or email, so failures are visible and
-- retryable. Written only by the server (service role); the public adhesion
-- form has no authenticated user, so `requested_by` is nullable.

CREATE TABLE IF NOT EXISTS public.adhesion_payment_link_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adhesion_request_id UUID NOT NULL REFERENCES public.adhesion_requests(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  status              TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error               TEXT,
  requested_by        UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adhesion_payment_link_deliveries_request
  ON public.adhesion_payment_link_deliveries (adhesion_request_id, channel, created_at DESC);

ALTER TABLE public.adhesion_payment_link_deliveries ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policy for clients: the adhesion form is
-- public and unauthenticated, so only the server (service role, which
-- bypasses RLS) reads or writes here. Admins can still audit via service
-- tooling; a client-facing read policy can be added later if a dashboard
-- needs it.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.adhesion_payment_link_deliveries TO service_role;
