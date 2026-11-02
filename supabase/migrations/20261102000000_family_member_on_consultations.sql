-- Migration: which family member is attended in a consultation
-- Description: appointments, medical_records and prescriptions record the person
-- attended (NULL = the titular), so each member keeps their own chart.
--
-- ON DELETE RESTRICT on purpose: removing a member who has clinical history must
-- fail instead of silently reattributing that history to the titular.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS family_member_id UUID REFERENCES public.family_members(id) ON DELETE RESTRICT;

ALTER TABLE public.medical_records
  ADD COLUMN IF NOT EXISTS family_member_id UUID REFERENCES public.family_members(id) ON DELETE RESTRICT;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS family_member_id UUID REFERENCES public.family_members(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_appointments_family_member ON public.appointments (family_member_id) WHERE family_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_medical_records_family_member ON public.medical_records (family_member_id) WHERE family_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prescriptions_family_member ON public.prescriptions (family_member_id) WHERE family_member_id IS NOT NULL;

-- The member must belong to the family group of the row's patient. Without this a
-- patient could attach another family's member (the uuid is not secret).
CREATE OR REPLACE FUNCTION public.guard_family_member_belongs_to_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.family_member_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    JOIN public.profiles p ON p.family_group_id = fm.family_group_id
    WHERE fm.id = NEW.family_member_id
      AND p.id = NEW.patient_id
  ) THEN
    RAISE EXCEPTION 'El integrante no pertenece al grupo familiar del paciente.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_family_member_appointments ON public.appointments;
CREATE TRIGGER guard_family_member_appointments
  BEFORE INSERT OR UPDATE OF family_member_id, patient_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_family_member_belongs_to_patient();

DROP TRIGGER IF EXISTS guard_family_member_medical_records ON public.medical_records;
CREATE TRIGGER guard_family_member_medical_records
  BEFORE INSERT OR UPDATE OF family_member_id, patient_id ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_family_member_belongs_to_patient();

DROP TRIGGER IF EXISTS guard_family_member_prescriptions ON public.prescriptions;
CREATE TRIGGER guard_family_member_prescriptions
  BEFORE INSERT OR UPDATE OF family_member_id, patient_id ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_family_member_belongs_to_patient();

-- The doctor's live queue shows who is attended. New columns go last so the
-- existing ones keep their position (CREATE OR REPLACE VIEW cannot reorder).
CREATE OR REPLACE VIEW public.doctor_queue AS
SELECT
    a.id AS appointment_id,
    a.scheduled_at,
    a.status,
    a.specialty,
    a.consultation_metadata,
    p.id AS patient_id,
    p.full_name AS patient_name,
    p.avatar_url AS patient_avatar,
    p.dni AS patient_dni,
    p.plan_name AS patient_plan,
    a.doctor_id,
    a.family_member_id,
    fm.full_name AS family_member_name,
    fm.relation AS family_member_relation
FROM
    public.appointments a
JOIN
    public.profiles p ON a.patient_id = p.id
LEFT JOIN
    public.family_members fm ON fm.id = a.family_member_id
WHERE
    a.status IN ('confirmed', 'in_progress', 'pending')
ORDER BY
    a.scheduled_at ASC;

-- Security: the view runs with its owner's rights (bypassing RLS) and was readable
-- by the anonymous role, so anyone holding the public anon key could list the
-- queued patients' names, DNI and plan, and now the attended member too. Only
-- logged-in doctors query it.
REVOKE ALL ON public.doctor_queue FROM anon;
