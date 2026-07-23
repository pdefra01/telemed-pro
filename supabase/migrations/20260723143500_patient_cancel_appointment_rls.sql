-- Migration: Patient Cancel Appointment RLS & RPC
-- Description: Adds UPDATE policy and SECURITY DEFINER RPC function for patients to cancel their own appointments.

-- 1. Create RLS UPDATE policy for patients
DROP POLICY IF EXISTS "Patients can update their own appointments" ON public.appointments;
CREATE POLICY "Patients can update their own appointments"
ON public.appointments FOR UPDATE
USING (auth.uid() = patient_id)
WITH CHECK (auth.uid() = patient_id);

-- 2. Create SECURITY DEFINER RPC function for cancelling appointments safely
CREATE OR REPLACE FUNCTION public.cancel_patient_appointment(p_appointment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.appointments
  SET status = 'cancelled'
  WHERE id = p_appointment_id
    AND (patient_id = auth.uid() OR doctor_id = auth.uid() OR public.is_admin());
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_patient_appointment(UUID) TO authenticated;
