-- Migration: opt-in WhatsApp notice to the doctor when an appointment is booked.
-- The admin toggles it per doctor in the doctor's ficha; the server sends the
-- message to profiles.phone from the company WhatsApp line.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_new_appointment_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.notify_new_appointment_whatsapp IS 'Doctors only: send a WhatsApp notice to profiles.phone when a patient books an appointment with them.';
