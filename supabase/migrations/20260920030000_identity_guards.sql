-- Migration: Identity guards (odd/new-plans-pricing, T2)
-- Description: Database-level guarantees, independent of the app pre-check:
--   * a titular phone is unique once normalized (same rules as server/whatsapp.js);
--   * a DNI / CUIL belongs to one person in one place: it cannot appear twice across
--     profiles and family members, so it can never sit in two family groups or plans;
--   * a family group cannot exceed the size allowed by its titular's plan.
-- NOTE: the unique indexes fail if duplicates already exist. Apply this migration
-- AFTER the test-data wipe (T6).

-- 1. Phone normalizer (mirror of normalizeArgentinePhone in server/whatsapp.js) ------
CREATE OR REPLACE FUNCTION public.ar_national_number(d TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n TEXT := regexp_replace(d, '^0', '');
  a INT;
BEGIN
  IF length(n) = 10 THEN
    RETURN n;
  END IF;
  IF length(n) = 12 THEN
    FOR a IN 2..4 LOOP
      IF substr(n, a + 1, 2) = '15' THEN
        RETURN substr(n, 1, a) || substr(n, a + 3);
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_ar_phone(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t      TEXT;
  digits TEXT;
  rest   TEXT;
  nat    TEXT;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  t := btrim(raw);
  digits := regexp_replace(t, '\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;
  IF left(digits, 2) = '00' THEN
    digits := substr(digits, 3);
  END IF;

  IF left(digits, 2) = '54' THEN
    rest := regexp_replace(substr(digits, 3), '^0', '');
    IF length(rest) = 11 AND left(rest, 1) = '9' THEN
      rest := substr(rest, 2);
    END IF;
    nat := public.ar_national_number(rest);
    RETURN CASE WHEN nat IS NULL THEN NULL ELSE '549' || nat END;
  END IF;

  IF left(t, 1) = '+' THEN
    RETURN CASE WHEN length(digits) BETWEEN 8 AND 15 THEN digits ELSE NULL END;
  END IF;

  nat := public.ar_national_number(digits);
  RETURN CASE WHEN nat IS NULL THEN NULL ELSE '549' || nat END;
END;
$$;

COMMENT ON FUNCTION public.normalize_ar_phone IS 'Canonical phone (549 + 10 digits for Argentina). Mirrors normalizeArgentinePhone in server/whatsapp.js.';

-- 2. Unique titular phone -------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_patient_phone
  ON public.profiles (public.normalize_ar_phone(phone))
  WHERE role = 'patient' AND public.normalize_ar_phone(phone) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_adhesion_pending_titular_phone
  ON public.adhesion_requests (public.normalize_ar_phone(titular_phone))
  WHERE status = 'pending' AND public.normalize_ar_phone(titular_phone) IS NOT NULL;

-- 3. A DNI / CUIL exists once across profiles and family members ------------------
CREATE OR REPLACE FUNCTION public.identity_number_taken(
  p_column TEXT, p_value TEXT, p_exclude_profile UUID, p_exclude_member UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v TEXT := NULLIF(regexp_replace(COALESCE(p_value, ''), '\D', '', 'g'), '');
BEGIN
  IF v IS NULL THEN
    RETURN false;
  END IF;

  IF p_column = 'dni' THEN
    RETURN EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.role = 'patient'
                     AND p.id IS DISTINCT FROM p_exclude_profile
                     AND regexp_replace(COALESCE(p.dni, ''), '\D', '', 'g') = v)
        OR EXISTS (SELECT 1 FROM public.family_members m
                   WHERE m.id IS DISTINCT FROM p_exclude_member
                     AND regexp_replace(COALESCE(m.dni, ''), '\D', '', 'g') = v);
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.role = 'patient'
                   AND p.id IS DISTINCT FROM p_exclude_profile
                   AND regexp_replace(COALESCE(p.cuil, ''), '\D', '', 'g') = v)
      OR EXISTS (SELECT 1 FROM public.family_members m
                 WHERE m.id IS DISTINCT FROM p_exclude_member
                   AND regexp_replace(COALESCE(m.cuil, ''), '\D', '', 'g') = v);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'patient' THEN
    IF public.identity_number_taken('dni', NEW.dni, NEW.id, NULL) THEN
      RAISE EXCEPTION 'El DNI % ya pertenece a otro afiliado o grupo familiar.', NEW.dni USING ERRCODE = '23505';
    END IF;
    IF public.identity_number_taken('cuil', NEW.cuil, NEW.id, NULL) THEN
      RAISE EXCEPTION 'El CUIL % ya pertenece a otro afiliado o grupo familiar.', NEW.cuil USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_family_member_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.identity_number_taken('dni', NEW.dni, NULL, NEW.id) THEN
    RAISE EXCEPTION 'El DNI % ya pertenece a otro afiliado o grupo familiar.', NEW.dni USING ERRCODE = '23505';
  END IF;
  IF public.identity_number_taken('cuil', NEW.cuil, NULL, NEW.id) THEN
    RAISE EXCEPTION 'El CUIL % ya pertenece a otro afiliado o grupo familiar.', NEW.cuil USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_identity ON public.profiles;
CREATE TRIGGER profiles_guard_identity
  BEFORE INSERT OR UPDATE OF dni, cuil, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_identity();

DROP TRIGGER IF EXISTS family_members_guard_identity ON public.family_members;
CREATE TRIGGER family_members_guard_identity
  BEFORE INSERT OR UPDATE OF dni, cuil ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_family_member_identity();

-- 4. Family size follows the titular's plan -------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_family_size()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INT;
BEGIN
  SELECT pl.max_family_members INTO v_max
  FROM public.family_groups g
  JOIN public.profiles p ON p.id = g.primary_affiliate_id
  JOIN public.plans pl ON pl.id = p.plan_id
  WHERE g.id = NEW.family_group_id;

  IF v_max IS NOT NULL
     AND (SELECT count(*) FROM public.family_members WHERE family_group_id = NEW.family_group_id) >= v_max THEN
    RAISE EXCEPTION 'El plan del titular admite hasta % integrante(s) adicionales.', v_max;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_members_guard_size ON public.family_members;
CREATE TRIGGER family_members_guard_size
  BEFORE INSERT ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_family_size();
