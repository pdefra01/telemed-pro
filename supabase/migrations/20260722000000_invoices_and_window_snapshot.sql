-- Migration: Cuenta Corriente Billing — DB foundation (PR1/4)
-- Description:
-- 1. `invoices` gains `UNIQUE(entity_type, entity_id, period)` so a later
--    ledger RPC (`post_billing_charge`, PR2) can use it as an `ON CONFLICT`
--    arbiter for idempotent invoice upserts. A defensive de-dup DELETE runs
--    first — no real affiliate data is expected per the
--    20260721070000_billing_period_model.sql precedent, but we do not
--    assume it.
-- 2. `family_coverage_windows` gains `paid_months_snapshot`,
--    `bonus_months_snapshot`, `monthly_cost_snapshot` — the plan terms
--    FROZEN at the moment a window is opened or renewed, so a later plan
--    edit never retroactively reclassifies already-elapsed months. Backfill
--    for pre-existing rows uses a CONSERVATIVE, documented, one-time
--    best-effort policy (see step 3) — it NEVER fabricates a bonus period.
-- 3. `assign_plan` (open) and `renew_coverage_window` (renew) are updated to
--    populate the three snapshot columns from the plan being applied, so
--    every window created/renewed from this migration forward carries an
--    authoritative (non-backfilled) snapshot.
-- 4. `profiles.payment_status` is COMMENT-deprecated: write-stopped, to
--    become a DERIVED read (affiliate_account_balances / a status view)
--    landing in a later PR of this change.
--
-- MIGRATION ORDERING (must stay the EARLIER of the two receivables-ledger
-- migrations): PR2's `post_billing_charge` RPC will reference the
-- UNIQUE(entity_type,entity_id,period) constraint added below via
-- `ON CONFLICT`. If PR2's migration carries an earlier timestamp than this
-- one, that RPC's creation fails at migration time ("no unique constraint
-- matching ON CONFLICT"). This file's timestamp (20260722000000) is chosen
-- to be later than every migration that currently exists in this directory;
-- PR2's migration timestamp MUST be later still.

-- ── 1. invoices: de-dup + UNIQUE(entity_type, entity_id, period) ──────────

-- Defensive de-dup: keep exactly one row per (entity_type, entity_id,
-- period) — the earliest by created_at, tie-broken by id for determinism
-- when created_at collides (e.g. bulk inserts in the same transaction/tick).
-- Precedent: 20260721070000_billing_period_model.sql:23-24 notes no real
-- affiliate data exists yet, so this is expected to be a no-op today; it is
-- still a required safety step before adding the constraint below.
DELETE FROM public.invoices a
USING public.invoices b
WHERE a.entity_type = b.entity_type
  AND a.entity_id = b.entity_id
  AND a.period = b.period
  AND (a.created_at, a.id) > (b.created_at, b.id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_entity_period_unique UNIQUE (entity_type, entity_id, period);

COMMENT ON CONSTRAINT invoices_entity_period_unique ON public.invoices IS
  'One invoice per (entity_type, entity_id, period). Used as the ON CONFLICT arbiter by post_billing_charge (cuenta-corriente-billing PR2) for idempotent invoice upserts.';

-- ── 2. family_coverage_windows: frozen billing-term snapshot columns ──────
ALTER TABLE public.family_coverage_windows
  ADD COLUMN IF NOT EXISTS paid_months_snapshot INTEGER CHECK (paid_months_snapshot >= 0),
  ADD COLUMN IF NOT EXISTS bonus_months_snapshot INTEGER CHECK (bonus_months_snapshot >= 0),
  ADD COLUMN IF NOT EXISTS monthly_cost_snapshot DECIMAL(12,2);

COMMENT ON COLUMN public.family_coverage_windows.paid_months_snapshot IS
  'Plan paid_months FROZEN at window open/renew. Billing reads this snapshot, never the live plan, so a later plan edit cannot retroactively reclassify already-elapsed months of an open window.';
COMMENT ON COLUMN public.family_coverage_windows.bonus_months_snapshot IS
  'Plan bonus_months FROZEN at window open/renew. Backfilled rows always get 0 here — a bonus period is never fabricated for pre-existing windows (see backfill below).';
COMMENT ON COLUMN public.family_coverage_windows.monthly_cost_snapshot IS
  'Plan monthly_cost FROZEN at window open/renew. Billing reads this snapshot, never the live plan.';

-- ── 3. Backfill pre-existing windows — CONSERVATIVE, ONE-TIME, LOSSY ──────
-- Pre-existing open windows were never asked to remember a paid/bonus split
-- at open time, so this migration cannot recover the true historical terms.
-- Policy (documented, deliberately lossy, matches the design's D6):
--   - bonus_months_snapshot = 0            (NEVER fabricate a free/bonus
--                                            period we cannot verify)
--   - paid_months_snapshot  = round(months(paid_through - period_start))
--                                           (only anchor available: the
--                                            window's own recorded duration)
--   - monthly_cost_snapshot = plan.monthly_cost AT MIGRATION TIME
--                                           (the live cost is the best
--                                            available proxy; it may not
--                                            match the plan's cost when the
--                                            window was actually opened)
-- This is a one-time, best-effort correction for rows that predate snapshot
-- tracking. Per the 20260721070000_billing_period_model.sql precedent, near
-- zero real rows are expected to exist at migration time.
UPDATE public.family_coverage_windows w
SET
  bonus_months_snapshot = 0,
  paid_months_snapshot = GREATEST(
    1,
    ROUND(EXTRACT(EPOCH FROM (w.paid_through - w.period_start)) / (86400 * 30.44))::INTEGER
  ),
  monthly_cost_snapshot = p.monthly_cost
FROM public.plans p
WHERE p.id = w.plan_id_snapshot
  AND w.paid_months_snapshot IS NULL;

-- ── 4. assign_plan — populate snapshot columns on first-ever window open ──
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
      period_start, paid_through, granted_quota, is_unlimited, created_by,
      paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot
    ) VALUES (
      v_profile.family_group_id,
      CASE WHEN v_profile.family_group_id IS NULL THEN p_profile_id ELSE NULL END,
      p_plan_id,
      now(),
      now() + make_interval(months => v_total_months),
      v_granted_quota,
      v_plan.is_unlimited,
      auth.uid(),
      v_plan.paid_months,
      v_plan.bonus_months,
      v_plan.monthly_cost
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  RETURN v_profile;
END;
$$;

COMMENT ON FUNCTION public.assign_plan IS 'Sets profiles.plan_id; auto-opens a coverage window from the plan''s parametrization (incl. frozen paid/bonus/cost snapshot) on first-ever assignment for the subject, otherwise leaves an existing window untouched. Admin-only.';

-- ── 5. renew_coverage_window — re-freeze snapshot columns on renewal ──────
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
      is_unlimited = v_plan.is_unlimited,
      paid_months_snapshot = v_plan.paid_months,
      bonus_months_snapshot = v_plan.bonus_months,
      monthly_cost_snapshot = v_plan.monthly_cost
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

COMMENT ON FUNCTION public.renew_coverage_window IS 'Explicit, admin-only renewal for an EXPIRED coverage window. Re-derives period/quota/paid-bonus-cost snapshot from the plan currently assigned to the profile and resets consumed quota to zero for the family/profile. Never automatic, no scheduler.';

-- ── 6. profiles.payment_status — deprecate raw write ───────────────────────
COMMENT ON COLUMN public.profiles.payment_status IS
  'DEPRECATED (cuenta-corriente-billing PR1): write-stopped. Becomes a DERIVED, read-only value computed from the affiliate receivables ledger (affiliate_payment_status view, landing in a later PR of this change). Do not write to this column going forward; retained only for backward-read compatibility during rollout.';
