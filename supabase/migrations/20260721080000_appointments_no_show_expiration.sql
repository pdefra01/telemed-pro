-- Migration: Appointment no-show expiration
-- Description: Appointments that never reach a terminal status (completed/
-- cancelled) stay stuck forever as "next appointment" for the patient, since
-- nothing currently moves them out of pending/confirmed/in_progress. Adds a
-- 'no_show' terminal status plus a SECURITY DEFINER sweep function that
-- auto-expires appointments whose scheduled time passed more than 4h ago
-- without ever completing.

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'));

-- Purely mechanical/time-based sweep — doesn't expose or alter data based on
-- who calls it, so no admin/ownership check is needed (unlike assign_plan /
-- renew_coverage_window, which mutate business-sensitive state).
CREATE OR REPLACE FUNCTION public.expire_stale_appointments()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.appointments
  SET status = 'no_show'
  WHERE status IN ('pending', 'confirmed', 'in_progress')
    AND scheduled_at < now() - interval '4 hours';
$$;

COMMENT ON FUNCTION public.expire_stale_appointments IS 'Sweeps appointments whose scheduled time passed more than 4h ago and were never resolved (completed/cancelled) into a terminal no_show state. Called opportunistically from AppointmentRepository reads.';

REVOKE EXECUTE ON FUNCTION public.expire_stale_appointments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_appointments() TO authenticated;
