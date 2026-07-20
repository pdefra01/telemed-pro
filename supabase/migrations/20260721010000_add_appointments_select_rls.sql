-- Migration: Add missing SELECT policy on appointments
-- Description: public.appointments has RLS enabled but ONLY ever had one
-- policy — "Doctors can update their own appointments" (UPDATE only, added
-- in 20260426000005_command_center_updates.sql). With RLS enabled and no
-- SELECT policy, every direct client SELECT on this table returns an empty
-- result for everyone (default-deny), regardless of ownership.
--
-- Confirmed this blocks PostConsultation.tsx entirely: it calls
-- AppointmentRepository.getAppointmentById() (a direct client SELECT) to
-- load the appointment before a doctor can finalize a consultation — with
-- no SELECT policy, that call returns null, appointmentData never
-- populates, and handleSaveAndFinish() refuses to proceed
-- ("No se pudo recuperar la información del turno."). So even with the
-- finalize-consultation service_role grants fixed, a doctor could never
-- reach the point of calling it through the real UI.
--
-- AppointmentRepository.getDoctorAppointments() has the same gap — the
-- "Historial" tab in DoctorDashboard has likely been silently empty for
-- every doctor, independent of the Sala de Espera queue (which reads from
-- the separate doctor_queue view instead of this table directly).

CREATE POLICY "Doctors can view their own appointments"
ON public.appointments FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Patients can view their own appointments"
ON public.appointments FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Admins can view all appointments"
ON public.appointments FOR SELECT
USING (public.is_admin());
