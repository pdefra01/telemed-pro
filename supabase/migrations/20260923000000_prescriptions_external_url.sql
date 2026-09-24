-- Prescriptions issued outside the platform (obra social): the doctor pastes
-- the insurer app's download link, which is sent to the affiliate by WhatsApp
-- instead of generating the internal PDF. Additive and nullable: existing rows
-- and readers are unaffected.
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS external_prescription_url TEXT;
