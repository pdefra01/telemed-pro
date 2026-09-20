-- Migration: Prescription delivery log
-- Description: Records every attempt to deliver a prescription to the patient
-- (currently WhatsApp from the company phone). Lets the doctor see whether the
-- send worked and retry when it failed. Written only by the server (service role).

CREATE TABLE IF NOT EXISTS public.prescription_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error           TEXT,
  requested_by    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescription_deliveries_prescription
  ON public.prescription_deliveries (prescription_id, created_at DESC);

ALTER TABLE public.prescription_deliveries ENABLE ROW LEVEL SECURITY;

-- Read: the doctor who issued the prescription, and admins.
-- No INSERT/UPDATE/DELETE policy for clients: only the server (service role,
-- which bypasses RLS) writes here, so a client cannot forge a "sent" record.
DROP POLICY IF EXISTS "Issuing doctor and admins read deliveries" ON public.prescription_deliveries;
CREATE POLICY "Issuing doctor and admins read deliveries"
ON public.prescription_deliveries FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.prescriptions p
    WHERE p.id = prescription_deliveries.prescription_id
      AND p.doctor_id = auth.uid()
  )
);

GRANT SELECT ON TABLE public.prescription_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prescription_deliveries TO service_role;
