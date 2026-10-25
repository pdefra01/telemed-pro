-- Migration: close privilege escalation through public.profiles
-- (odd/tasks/profiles-privilege-escalation.md, S1-S4)
--
-- The "Self manage" RLS policy (FOR ALL, auth.uid() = id) lets any signed-in
-- user write every column of their own profile row. Because the
-- on_profile_role_change trigger copies profiles.role into user_roles (which
-- is_admin() reads), a patient could make themselves admin; they could also
-- assign themselves a plan, reactivate a suspended plan or mark themselves
-- verified. Separately, handle_new_user took the role from raw_user_meta_data,
-- which any public auth.signUp caller controls.
--
-- Fix:
--   1. guard_profile_privileged_columns (BEFORE INSERT OR UPDATE): a direct
--      write by the anon/authenticated API roles from a non-admin may not
--      change privileged columns. SECURITY DEFINER functions (assign_plan,
--      payment RPCs, ...) run as their owner and the service role (server) is
--      not an API role, so both keep working. Direct inserts by those roles
--      are always rejected. Two self-service exceptions on update:
--        - family_group_id may only point to a group the caller is titular of;
--        - current_period_quota_used may only grow (appointment booking).
--   2. handle_new_user no longer trusts raw_user_meta_data for role/is_active:
--      it reads raw_app_meta_data, which only the service role can set, so a
--      self-signup is always an inactive patient. GoTrue's admin createUser
--      writes app_metadata AFTER inserting the user, so the server sets role
--      and is_active on the profile explicitly (server/profileAccess.js).

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only direct writes through the API roles are restricted.
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Profiles are created only by handle_new_user (SECURITY DEFINER). A direct
    -- insert would let a user delete their row and re-create it with any value
    -- (the Self manage policy also allows DELETE), so it is always rejected.
    RAISE EXCEPTION 'No tenés permiso para crear perfiles.' USING ERRCODE = '42501';
  END IF;

  IF NEW.role                IS DISTINCT FROM OLD.role
     OR NEW.is_active          IS DISTINCT FROM OLD.is_active
     OR NEW.plan_id            IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_name          IS DISTINCT FROM OLD.plan_name
     OR NEW.plan_status        IS DISTINCT FROM OLD.plan_status
     OR NEW.payment_status     IS DISTINCT FROM OLD.payment_status
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.agreement_id       IS DISTINCT FROM OLD.agreement_id
     OR NEW.producer_id        IS DISTINCT FROM OLD.producer_id
     OR NEW.promoter_code      IS DISTINCT FROM OLD.promoter_code
     OR NEW.is_verified        IS DISTINCT FROM OLD.is_verified
     OR NEW.is_dni_verified    IS DISTINCT FROM OLD.is_dni_verified
     OR NEW.credential_issued_at IS DISTINCT FROM OLD.credential_issued_at
     OR NEW.credential_hash    IS DISTINCT FROM OLD.credential_hash
     OR NEW.rating             IS DISTINCT FROM OLD.rating
     OR NEW.review_count       IS DISTINCT FROM OLD.review_count
     OR NEW.consultation_fee   IS DISTINCT FROM OLD.consultation_fee
     OR NEW.contract_start_date IS DISTINCT FROM OLD.contract_start_date
     OR NEW.contract_end_date  IS DISTINCT FROM OLD.contract_end_date THEN
    RAISE EXCEPTION 'No tenés permiso para modificar esos datos del perfil.' USING ERRCODE = '42501';
  END IF;

  IF NEW.family_group_id IS DISTINCT FROM OLD.family_group_id
     AND NOT EXISTS (
       SELECT 1 FROM public.family_groups
       WHERE id = NEW.family_group_id AND primary_affiliate_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Solo podés vincular tu perfil a un grupo familiar del que sos titular.' USING ERRCODE = '42501';
  END IF;

  IF NEW.current_period_quota_used IS DISTINCT FROM OLD.current_period_quota_used
     AND COALESCE(NEW.current_period_quota_used, 0) < COALESCE(OLD.current_period_quota_used, 0) THEN
    RAISE EXCEPTION 'No tenés permiso para modificar esos datos del perfil.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profile_privileged_columns() IS 'Rejects direct anon/authenticated non-admin writes to privileged profile columns (role, plan, coverage, verification, commercial fields). SECURITY DEFINER RPCs and the service role are not restricted.';

-- Named to sort before the other BEFORE triggers on profiles.
DROP TRIGGER IF EXISTS a_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER a_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  extracted_dni TEXT;
  extracted_role TEXT;
  is_active_val BOOLEAN;
BEGIN
  -- Extraer DNI si es paciente
  IF NEW.email LIKE '%@telemed-paciente.com' OR NEW.email LIKE '%@medinex-paciente.com' THEN
    extracted_dni := SPLIT_PART(NEW.email, '@', 1);
  ELSE
    extracted_dni := NEW.raw_user_meta_data->>'dni';
  END IF;

  -- The role and the active flag never come from raw_user_meta_data, which is
  -- chosen by whoever calls auth.signUp: a self-signup is always a patient.
  -- raw_app_meta_data can only be set by the service role (GoTrue writes it
  -- after this trigger runs, so server-created users get their role from an
  -- explicit service-role profile update instead).
  extracted_role := COALESCE(NEW.raw_app_meta_data->>'role', 'patient');

  -- Los médicos y administradores son activos por defecto.
  -- Los pacientes son inactivos a menos que el servidor indique is_active = true (alta por admin).
  IF extracted_role <> 'patient' THEN
    is_active_val := TRUE;
  ELSE
    is_active_val := COALESCE((NEW.raw_app_meta_data->>'is_active')::boolean, FALSE);
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    avatar_url,
    role,
    dni,
    phone,
    is_dni_verified,
    specialty,
    is_active
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuario Nuevo'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    extracted_role,
    extracted_dni,
    NEW.raw_user_meta_data->>'phone',
    TRUE,
    NEW.raw_user_meta_data->>'specialty',
    is_active_val
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    dni = COALESCE(profiles.dni, EXCLUDED.dni),
    phone = COALESCE(profiles.phone, EXCLUDED.phone),
    role = EXCLUDED.role,
    specialty = COALESCE(profiles.specialty, EXCLUDED.specialty),
    is_active = EXCLUDED.is_active;

  RETURN NEW;
END;
$function$;
