-- Doctors see the patient's plan and what it includes on the chart.
--
-- plans RLS is admin-only, so a doctor cannot read it directly. This extends the
-- existing SECURITY DEFINER chart function with a `plan` object carrying only
-- the inclusions (no prices). Everything else it returns is unchanged.

CREATE OR REPLACE FUNCTION public.get_patient_chart_data(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_plan jsonb;
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

  -- NULL when the patient has no plan row: the chart then falls back to profiles.plan_name.
  SELECT jsonb_build_object(
    'name', pl.name,
    'kind', pl.plan_kind,
    'status', p.plan_status,
    'bonifiedConsultations', pl.bonified_consultations,
    'isUnlimited', pl.is_unlimited,
    'maxFamilyMembers', pl.max_family_members,
    'pharmacyDiscountPercent', pl.pharmacy_discount_percent
  )
  INTO v_plan
  FROM public.profiles p
  JOIN public.plans pl ON pl.id = p.plan_id
  WHERE p.id = p_patient_id;

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

  RETURN jsonb_build_object('profile', v_profile, 'plan', v_plan, 'intake', v_intake, 'groupMembers', v_group);
END;
$$;

REVOKE ALL ON FUNCTION public.get_patient_chart_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_chart_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_patient_chart_data(uuid) IS 'Clinical subset of a patient''s profile, the plan inclusions and the sign-up health declaration. Doctors and admins only.';
