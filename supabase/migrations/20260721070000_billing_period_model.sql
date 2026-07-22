-- Migration: Billing period / coverage-window model (PR1 — DB foundation)
-- Description:
-- 1. `plans` gains `paid_months` (billed duration) and `bonus_months` (free
--    promo duration, default 0). Total coverage length = paid_months +
--    bonus_months. Existing rows backfill to paid_months=1/bonus_months=0
--    automatically via the NOT NULL DEFAULT (preserves today's de facto
--    monthly behavior until an admin edits a plan).
-- 2. New `family_coverage_windows` table holds a single CURRENT prepaid
--    window per subject (family group OR standalone profile, never both —
--    enforced by num_nonnulls + partial unique indexes) with a QUOTA
--    SNAPSHOT (granted_quota/is_unlimited/plan_id_snapshot) frozen at the
--    moment the window is opened or renewed, so a mid-window plan change
--    never retroactively alters an already-granted quota.
-- 3. Two SECURITY DEFINER RPCs, mirroring set_default_plan/
--    deduct_medication_stock's is_admin()-guarded atomic-write pattern:
--    - assign_plan: sets profiles.plan_id; if the subject has no window
--      yet, opens one from the plan's parametrization in the same
--      transaction (first-ever assignment). If a window already exists,
--      only plan_id changes — the window is left untouched (no proration).
--    - renew_coverage_window: explicit, admin-only, requires an EXPIRED
--      window; re-derives values from whatever plan is currently assigned
--      and resets consumed quota to zero for the family/profile.
-- No backfill beyond the column defaults above — no real affiliate data
-- exists yet (test data will be wiped pre-launch).

-- ── 1. Plan duration columns ──────────────────────────────────────────
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS paid_months INTEGER NOT NULL DEFAULT 1 CHECK (paid_months >= 1),
  ADD COLUMN IF NOT EXISTS bonus_months INTEGER NOT NULL DEFAULT 0 CHECK (bonus_months >= 0);

-- ── 2. family_coverage_windows ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.family_coverage_windows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id     UUID REFERENCES public.family_groups(id) ON DELETE CASCADE,
  subject_profile_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id_snapshot    UUID REFERENCES public.plans(id),
  period_start        TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_through        TIMESTAMPTZ NOT NULL,
  granted_quota       INTEGER, -- null = unlimited (see is_unlimited)
  is_unlimited        BOOLEAN NOT NULL DEFAULT false,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT family_coverage_windows_single_subject_check
    CHECK (num_nonnulls(family_group_id, subject_profile_id) = 1)
);

COMMENT ON TABLE public.family_coverage_windows IS 'Single current prepaid coverage window per subject (family group or standalone profile), with a frozen quota snapshot sourced from the plan at open/renew time.';

-- Exactly one CURRENT window per subject — enforced via partial unique
-- indexes (Postgres has no partial UNIQUE constraint syntax, index-only).
CREATE UNIQUE INDEX IF NOT EXISTS family_coverage_windows_family_group_idx
  ON public.family_coverage_windows (family_group_id)
  WHERE family_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS family_coverage_windows_subject_profile_idx
  ON public.family_coverage_windows (subject_profile_id)
  WHERE subject_profile_id IS NOT NULL;

-- ── 3. RLS: authenticated-read (subject/family match), admin-write ────
ALTER TABLE public.family_coverage_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Subjects read own coverage window" ON public.family_coverage_windows;
CREATE POLICY "Subjects read own coverage window"
  ON public.family_coverage_windows FOR SELECT
  TO authenticated
  USING (
    subject_profile_id = auth.uid()
    OR family_group_id IN (
      SELECT family_group_id FROM public.profiles
      WHERE id = auth.uid() AND family_group_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Admins manage coverage windows" ON public.family_coverage_windows;
CREATE POLICY "Admins manage coverage windows"
  ON public.family_coverage_windows FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Base GRANTs required before RLS is ever evaluated (see
-- 20260719010000_fix_missing_table_grants.sql — RLS policies alone are not
-- enough, Postgres checks table-level GRANTs first).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_coverage_windows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_coverage_windows TO service_role;

-- ── 4. assign_plan — atomic plan assignment + auto-open-on-first-assignment ──
CREATE OR REPLACE FUNCTION public.assign_plan(p_profile_id UUID, p_plan_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile         public.profiles;
  v_plan            public.plans;
  v_existing_window public.family_coverage_windows;
  v_total_months    INTEGER;
  v_granted_quota   INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Solo administradores pueden asignar planes.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil % no encontrado', p_profile_id;
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;

  UPDATE public.profiles SET plan_id = p_plan_id WHERE id = p_profile_id;

  -- Subject key mirrors the family-group aggregation already used for quota
  -- reads: family_group_id when present, else the standalone profile id.
  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT * INTO v_existing_window
    FROM public.family_coverage_windows
    WHERE family_group_id = v_profile.family_group_id;
  ELSE
    SELECT * INTO v_existing_window
    FROM public.family_coverage_windows
    WHERE subject_profile_id = p_profile_id;
  END IF;

  IF NOT FOUND THEN
    -- First-ever assignment for this subject: open the window automatically,
    -- sourced entirely from the plan being assigned. If a window already
    -- exists, it stays untouched — only plan_id changed above (no proration,
    -- per spec: plan swap mid-window is a deliberate no-op for the window).
    v_total_months := v_plan.paid_months + v_plan.bonus_months;
    v_granted_quota := CASE WHEN v_plan.is_unlimited THEN NULL
                            ELSE v_plan.bonified_consultations * v_total_months END;

    INSERT INTO public.family_coverage_windows (
      family_group_id, subject_profile_id, plan_id_snapshot,
      period_start, paid_through, granted_quota, is_unlimited, created_by
    ) VALUES (
      v_profile.family_group_id,
      CASE WHEN v_profile.family_group_id IS NULL THEN p_profile_id ELSE NULL END,
      p_plan_id,
      now(),
      now() + make_interval(months => v_total_months),
      v_granted_quota,
      v_plan.is_unlimited,
      auth.uid()
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  RETURN v_profile;
END;
$$;

COMMENT ON FUNCTION public.assign_plan IS 'Sets profiles.plan_id; auto-opens a coverage window from the plan''s parametrization on first-ever assignment for the subject, otherwise leaves an existing window untouched. Admin-only.';

-- Defense-in-depth: Postgres grants EXECUTE to PUBLIC by default on new
-- functions. The internal is_admin() check already blocks non-admins, but
-- revoking the default grant means that stays true even if a future
-- refactor ever reorders the check.
REVOKE EXECUTE ON FUNCTION public.assign_plan(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_plan(UUID, UUID) TO authenticated;

-- ── 5. renew_coverage_window — explicit post-expiry renewal ────────────
CREATE OR REPLACE FUNCTION public.renew_coverage_window(p_profile_id UUID)
RETURNS public.family_coverage_windows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile       public.profiles;
  v_plan          public.plans;
  v_window        public.family_coverage_windows;
  v_total_months  INTEGER;
  v_granted_quota INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Solo administradores pueden renovar la cobertura.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil % no encontrado', p_profile_id;
  END IF;

  IF v_profile.plan_id IS NULL THEN
    RAISE EXCEPTION 'El perfil % no tiene un plan asignado', p_profile_id;
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_profile.plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', v_profile.plan_id;
  END IF;

  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT * INTO v_window
    FROM public.family_coverage_windows
    WHERE family_group_id = v_profile.family_group_id;
  ELSE
    SELECT * INTO v_window
    FROM public.family_coverage_windows
    WHERE subject_profile_id = p_profile_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe una ventana de cobertura para renovar en el perfil %', p_profile_id;
  END IF;

  IF v_window.paid_through >= now() THEN
    RAISE EXCEPTION 'La ventana de cobertura del perfil % todavia no expiro; no se puede renovar', p_profile_id;
  END IF;

  -- Renewal always re-derives from whatever plan is CURRENTLY assigned —
  -- never manually re-typed — and resets consumed quota to zero.
  v_total_months := v_plan.paid_months + v_plan.bonus_months;
  v_granted_quota := CASE WHEN v_plan.is_unlimited THEN NULL
                          ELSE v_plan.bonified_consultations * v_total_months END;

  UPDATE public.family_coverage_windows
  SET plan_id_snapshot = v_plan.id,
      period_start = now(),
      paid_through = now() + make_interval(months => v_total_months),
      granted_quota = v_granted_quota,
      is_unlimited = v_plan.is_unlimited
  WHERE id = v_window.id
  RETURNING * INTO v_window;

  IF v_profile.family_group_id IS NOT NULL THEN
    UPDATE public.profiles SET current_period_quota_used = 0 WHERE family_group_id = v_profile.family_group_id;
  ELSE
    UPDATE public.profiles SET current_period_quota_used = 0 WHERE id = p_profile_id;
  END IF;

  RETURN v_window;
END;
$$;

COMMENT ON FUNCTION public.renew_coverage_window IS 'Explicit, admin-only renewal for an EXPIRED coverage window. Re-derives period/quota from the plan currently assigned to the profile and resets consumed quota to zero for the family/profile. Never automatic, no scheduler.';

REVOKE EXECUTE ON FUNCTION public.renew_coverage_window(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_coverage_window(UUID) TO authenticated;
