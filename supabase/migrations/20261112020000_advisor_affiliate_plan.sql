-- An advisor with a Medinex plan is an affiliate on the same account
-- (odd/tasks/advisor-affiliate-plan.md, S3, S4).
--
-- 1. is_affiliate(uuid): a patient, or an advisor that holds a plan.
-- 2. get_patient_chart_data: doctors see the chart of any affiliate, not only
--    role = 'patient'. Everything it returns is unchanged.
-- 3. set_advisor_status: deactivating an advisor that holds a plan turns the
--    account into a paying affiliate (role patient, still able to log in, keeps
--    plan and family, leaves the supervisor's team, coverage window reopens at
--    the deactivation). Reactivating turns it back into an advisor. An advisor
--    without a plan keeps the previous behavior (login gate only).

-- 1. Who counts as an affiliate
CREATE OR REPLACE FUNCTION public.is_affiliate(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id
      AND (p.role = 'patient' OR (p.role = 'advisor' AND p.plan_id IS NOT NULL))
  );
$$;

REVOKE ALL ON FUNCTION public.is_affiliate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_affiliate(uuid) TO service_role;

COMMENT ON FUNCTION public.is_affiliate(uuid) IS 'True for a patient, or an advisor that holds a plan. Internal helper for SECURITY DEFINER functions; not exposed to the API roles.';

-- 2. Chart of any affiliate
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

  IF NOT public.is_affiliate(p_patient_id) THEN
    RETURN NULL;
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
  WHERE p.id = p_patient_id;

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

COMMENT ON FUNCTION public.get_patient_chart_data(uuid) IS 'Clinical subset of an affiliate''s profile (patient, or advisor with a plan), the plan inclusions and the sign-up health declaration. Doctors and admins only.';

-- 3. Advisor status with the affiliate role swap
CREATE OR REPLACE FUNCTION public.set_advisor_status(p_advisor_id UUID, p_active BOOLEAN)
RETURNS TABLE (advisor_id UUID, producer_status TEXT, has_account BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT := CASE WHEN p_active THEN 'active' ELSE 'inactive' END;
  v_producer_rows INT;
  v_profile public.profiles%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_total_months INT;
BEGIN
  UPDATE public.producers SET status = v_status WHERE id = p_advisor_id;
  GET DIAGNOSTICS v_producer_rows = ROW_COUNT;
  IF v_producer_rows = 0 THEN
    RAISE EXCEPTION 'advisor_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Only an advisor, or a former advisor turned affiliate by a previous
  -- deactivation (patient with a producers row), is ever touched here.
  SELECT * INTO v_profile FROM public.profiles
   WHERE id = p_advisor_id AND role IN ('advisor', 'patient')
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_advisor_id, v_status, false;
    RETURN;
  END IF;

  IF p_active THEN
    -- Reactivation: back to advisor (free again while active).
    UPDATE public.profiles SET role = 'advisor', is_active = true WHERE id = p_advisor_id;
  ELSIF v_profile.role = 'advisor' AND v_profile.plan_id IS NOT NULL THEN
    -- Deactivation with a plan: the account becomes a paying affiliate.
    -- The identity guards (DNI/CUIL/phone unique among affiliates) apply once
    -- the role is patient. A duplicate becomes one clear error for the admin;
    -- the whole call rolls back, producers.status included.
    BEGIN
      UPDATE public.profiles
         SET role = 'patient', is_active = true, supervisor_id = NULL
       WHERE id = p_advisor_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'advisor_identity_conflict' USING ERRCODE = '23505',
        DETAIL = CASE WHEN SQLERRM LIKE '%uq_profiles_patient_phone%'
                      THEN 'El teléfono ya pertenece a otro afiliado.'
                      ELSE SQLERRM END;
    END;

    -- Billing starts now: reopen the current coverage window (or open one) at
    -- the deactivation with the plan's paid + bonus months.
    SELECT * INTO v_plan FROM public.plans WHERE id = v_profile.plan_id;
    v_total_months := v_plan.paid_months + v_plan.bonus_months;

    UPDATE public.family_coverage_windows
       SET plan_id_snapshot = v_plan.id,
           period_start = now(),
           paid_through = now() + make_interval(months => v_total_months),
           granted_quota = CASE WHEN v_plan.is_unlimited THEN NULL ELSE v_plan.bonified_consultations * v_total_months END,
           is_unlimited = v_plan.is_unlimited,
           paid_months_snapshot = v_plan.paid_months,
           bonus_months_snapshot = v_plan.bonus_months,
           monthly_cost_snapshot = v_plan.monthly_cost
     WHERE (v_profile.family_group_id IS NOT NULL AND family_group_id = v_profile.family_group_id)
        OR (v_profile.family_group_id IS NULL AND subject_profile_id = v_profile.id);

    IF NOT FOUND THEN
      INSERT INTO public.family_coverage_windows (
        family_group_id, subject_profile_id, plan_id_snapshot,
        period_start, paid_through, granted_quota, is_unlimited, created_by,
        paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot
      ) VALUES (
        v_profile.family_group_id,
        CASE WHEN v_profile.family_group_id IS NULL THEN v_profile.id ELSE NULL END,
        v_plan.id,
        now(),
        now() + make_interval(months => v_total_months),
        CASE WHEN v_plan.is_unlimited THEN NULL ELSE v_plan.bonified_consultations * v_total_months END,
        v_plan.is_unlimited,
        NULL,
        v_plan.paid_months,
        v_plan.bonus_months,
        v_plan.monthly_cost
      );
    END IF;
  ELSE
    -- Deactivation without a plan (or of an already paying affiliate): login gate only for advisors.
    UPDATE public.profiles SET is_active = false WHERE id = p_advisor_id AND role = 'advisor';
  END IF;

  RETURN QUERY SELECT p_advisor_id, v_status, true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_advisor_status(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_advisor_status(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.set_advisor_status(UUID, BOOLEAN) IS 'Atomically toggles an advisor''s commercial status (producers.status) and account. Deactivating an advisor with a plan turns the account into a paying affiliate (role patient, still active, no supervisor, coverage window reopened now); reactivating turns it back into an advisor. Without a plan only the login gate (profiles.is_active) changes. Raises advisor_not_found (P0002) when no producers row matches; has_account = false for a placeholder producer row with no linked advisor account.';
