-- Migration: Fix cancel_patient_appointment RPC and family member authority
-- Description: Ensures cancel_patient_appointment RPC raises an exception if 0 rows were updated,
-- and allows primary profiles to cancel appointments belonging to their registered family members.

CREATE OR REPLACE FUNCTION public.cancel_patient_appointment(p_appointment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated integer;
BEGIN
  UPDATE public.appointments
  SET status = 'cancelled'
  WHERE id = p_appointment_id
    AND (
      patient_id = auth.uid() 
      OR doctor_id = auth.uid() 
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.family_members 
        WHERE primary_profile_id = auth.uid() 
          AND member_profile_id = public.appointments.patient_id
      )
    );

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'No se pudo cancelar el turno: turno no encontrado o permisos insuficientes (ID: %).', p_appointment_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_patient_appointment(UUID) TO authenticated;

-- Ensure Realtime broadcasts complete row payloads on UPDATE/DELETE for doctor_id filter
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

