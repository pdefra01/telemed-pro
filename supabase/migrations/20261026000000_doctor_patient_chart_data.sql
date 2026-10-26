-- Doctors read a patient's personal data and the health declaration made at
-- sign-up (chronic conditions, permanent medication, family history).
--
-- adhesion_requests is admin-only (it also holds the signature and DNI photos),
-- and doctors read profiles directly, which would expose key material columns.
-- This SECURITY DEFINER function returns only the clinical subset, to doctors
-- and admins.

CREATE OR REPLACE FUNCTION public.get_patient_chart_data(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_intake jsonb;
  v_group jsonb;
BEGIN
  IF NOT (public.is_doctor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'No tenés permiso para ver los datos del paciente.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'fullName', p.full_name,
    'dni', p.dni,
    'cuil', p.cuil,
    'birthDate', p.birth_date,
    'phone', p.phone,
    'email', COALESCE(p.real_email, p.email),
    'address', p.address,
    'locality', p.locality,
    'neighborhood', p.neighborhood,
    'city', p.city,
    'province', p.province,
    'bloodType', p.blood_type,
    'planName', p.plan_name,
    'planStatus', p.plan_status
  )
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_patient_id AND p.role = 'patient';

  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'medicalHistory', to_jsonb(COALESCE(a.medical_history, ARRAY[]::text[])),
    'medicalHistoryOther', a.medical_history_other,
    'healthInsurance', a.titular_health_insurance,
    'civilStatus', a.titular_civil_status,
    'familyMembers', COALESCE(a.family_members, '[]'::jsonb),
    'declaredAt', a.created_at
  )
  INTO v_intake
  FROM public.adhesion_requests a
  WHERE a.approved_profile_id = p_patient_id
  ORDER BY a.created_at DESC
  LIMIT 1;

  -- Family group as it stands today (members added after sign-up included).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fullName', fm.full_name,
    'relation', fm.relation,
    'birthDate', fm.birth_date,
    'dni', fm.dni
  ) ORDER BY fm.created_at), '[]'::jsonb)
  INTO v_group
  FROM public.family_members fm
  JOIN public.profiles p ON p.family_group_id = fm.family_group_id
  WHERE p.id = p_patient_id;

  RETURN jsonb_build_object('profile', v_profile, 'intake', v_intake, 'groupMembers', v_group);
END;
$$;

REVOKE ALL ON FUNCTION public.get_patient_chart_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_chart_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_patient_chart_data(uuid) IS 'Clinical subset of a patient''s profile plus the sign-up health declaration. Doctors and admins only.';
