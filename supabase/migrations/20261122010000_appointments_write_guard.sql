-- Migration: appointments write guard
--
-- 1. Codifies the INSERT policy that production already has but no migration
--    created ("Permitir insercion de turnos propios"), so a local reset matches
--    production.
-- 2. Limits what a patient or a doctor can write through the API. The UPDATE
--    policies let each side change ANY column of their own appointment, so a
--    patient could mark it completed (it counts in the doctor fees of the P&L),
--    reopen a cancelled or no_show one, or move it to another doctor or time.
--
-- What the app writes directly as `authenticated` (src/repositories/AppointmentRepository.ts):
--   patient: books (patient_id = self, status pending/confirmed) and cancels
--            (status -> cancelled; normally through cancel_patient_appointment).
--   doctor:  notes; status -> in_progress or completed with consultation_metadata;
--            cancels.
-- SECURITY DEFINER functions (cancel_patient_appointment, expire_stale_appointments),
-- the service role (server.js, finalize-consultation) and admins are not restricted.

DROP POLICY IF EXISTS "Permitir insercion de turnos propios" ON public.appointments;
CREATE POLICY "Permitir insercion de turnos propios"
  ON public.appointments
  FOR INSERT
  WITH CHECK ((auth.uid() = patient_id) OR (auth.uid() = doctor_id));

-- Whether a user id is a doctor. user_roles RLS lets a patient read only their
-- own row, so the guard below needs this SECURITY DEFINER lookup. Doctors are
-- already public (profiles "Everyone can view doctors"), so it reveals nothing new.
CREATE OR REPLACE FUNCTION public.is_doctor_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'doctor');
$$;

REVOKE EXECUTE ON FUNCTION public.is_doctor_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_doctor_user(uuid) TO authenticated, service_role;

-- SECURITY INVOKER on purpose: current_user must be the caller's role, so that
-- SECURITY DEFINER functions and the service role pass through (same pattern as
-- guard_profile_privileged_columns).
CREATE OR REPLACE FUNCTION public.guard_appointment_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  -- Columns a doctor may change on their own appointment.
  v_doctor_columns text[] := ARRAY['notes', 'status', 'consultation_metadata'];
BEGIN
  -- Only direct writes through the API roles are restricted.
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Only a patient books, for themselves, with a real doctor, in an open status.
    IF v_uid IS NULL OR NEW.patient_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Solo el paciente puede reservar su turno.' USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'Un turno nuevo solo puede quedar pendiente o confirmado.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_doctor_user(NEW.doctor_id) THEN
      RAISE EXCEPTION 'El turno tiene que ser con un médico.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF v_uid IS NOT NULL AND v_uid = OLD.doctor_id THEN
    IF (to_jsonb(NEW) - v_doctor_columns) IS DISTINCT FROM (to_jsonb(OLD) - v_doctor_columns) THEN
      RAISE EXCEPTION 'El médico solo puede cambiar el estado, las notas y los datos de la consulta.' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (NEW.status = 'in_progress' AND OLD.status IN ('pending', 'confirmed'))
      OR (NEW.status = 'completed' AND OLD.status IN ('pending', 'confirmed', 'in_progress', 'no_show'))
      OR (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'confirmed', 'in_progress'))
    ) THEN
      RAISE EXCEPTION 'Cambio de estado no permitido: % a %.', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND v_uid = OLD.patient_id THEN
    -- The patient can only cancel an open appointment.
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
       OR NEW.status IS DISTINCT FROM 'cancelled'
       OR OLD.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'El paciente solo puede cancelar un turno pendiente o confirmado.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- RLS already keeps everyone else out; refuse anything that gets here.
  RAISE EXCEPTION 'No tenés permiso para modificar este turno.' USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.guard_appointment_writes() IS 'Rejects direct anon/authenticated non-admin appointment writes outside the app flows: a patient books for themselves and cancels an open appointment; a doctor changes only notes, status (allowed transitions) and consultation_metadata. SECURITY DEFINER functions, the service role and admins are not restricted.';

-- cancel_patient_appointment referenced family_members.primary_profile_id, a
-- column that does not exist, so it always failed and the app cancelled through
-- its direct UPDATE fallback. It is SECURITY DEFINER (the guard does not apply
-- to it), so the fixed version enforces the same status rules: the patient
-- cancels only a pending or confirmed appointment; the doctor and admins also
-- one in progress. Family members have no login: their appointments keep the
-- titular as patient_id.
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
      (patient_id = auth.uid() AND status IN ('pending', 'confirmed'))
      OR ((doctor_id = auth.uid() OR public.is_admin()) AND status IN ('pending', 'confirmed', 'in_progress'))
    );

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'No se pudo cancelar el turno: turno no encontrado, ya cerrado o permisos insuficientes (ID: %).', p_appointment_id;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_appointment_writes ON public.appointments;
CREATE TRIGGER a_guard_appointment_writes
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_writes();
