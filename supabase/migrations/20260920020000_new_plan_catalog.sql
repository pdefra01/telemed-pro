-- Migration: New plan catalog (odd/new-plans-pricing, T1)
-- Description: Replaces the single legacy plan with the five sellable plans of the
-- new catalog. Each purchasable option is its OWN plan row, so:
--   * prices are fixed per option (no discount formulas);
--   * a price change is a NEW plan version, never an edit of a plan in use, which
--     keeps every existing affiliate on the plan (and price) they signed up with
--     (coverage windows and renewals already read the assigned plan);
--   * advisor commissions become a fixed amount stored on the plan.
-- Total price of a prepaid option = monthly_cost x paid_months; bonus_months are
-- the gift months of coverage on top (existing billing-period model).
--
-- The legacy 'Plan Familiar Medinex' row is left in place (it is only referenced
-- by test affiliates that will be wiped); it is simply not offered any more.

-- 1. New columns -----------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_kind TEXT,
  ADD COLUMN IF NOT EXISTS payment_option TEXT,
  ADD COLUMN IF NOT EXISTS is_offered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advisor_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.plans.plan_kind IS 'individual (titular only) or familiar (titular + max_family_members).';
COMMENT ON COLUMN public.plans.payment_option IS 'How the plan is paid: standard (month to month, any method), card_debit (credit-card auto debit), prepaid_6 or prepaid_12.';
COMMENT ON COLUMN public.plans.is_offered IS 'Sellable right now. At most one offered plan per (plan_kind, payment_option). Withdrawn plans stay assigned to the affiliates who already have them.';
COMMENT ON COLUMN public.plans.advisor_commission_amount IS 'Fixed commission paid to the advisor for one approved sale of this plan.';

-- 2. Constraints (guarded: ADD CONSTRAINT has no IF NOT EXISTS) ------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_plan_kind_check') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_plan_kind_check
      CHECK (plan_kind IS NULL OR plan_kind IN ('individual', 'familiar'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_payment_option_check') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_payment_option_check
      CHECK (payment_option IS NULL OR payment_option IN ('standard', 'card_debit', 'prepaid_6', 'prepaid_12'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_offered_needs_kind_check') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_offered_needs_kind_check
      CHECK (NOT is_offered OR (plan_kind IS NOT NULL AND payment_option IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_individual_standard_only_check') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_individual_standard_only_check
      CHECK (plan_kind IS DISTINCT FROM 'individual' OR payment_option IS NULL OR payment_option = 'standard');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_advisor_commission_check') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_advisor_commission_check
      CHECK (advisor_commission_amount >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS plans_one_offered_per_option_idx
  ON public.plans (plan_kind, payment_option)
  WHERE is_offered;

-- 3. A plan in use keeps its terms -------------------------------------------
-- Price, duration, size and quota of a plan assigned to an affiliate (or frozen
-- in a coverage window) cannot change: create a new plan version instead.
-- Renaming and withdrawing from sale stay allowed.
CREATE OR REPLACE FUNCTION public.guard_plan_in_use()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (   NEW.monthly_cost           IS DISTINCT FROM OLD.monthly_cost
      OR NEW.paid_months            IS DISTINCT FROM OLD.paid_months
      OR NEW.bonus_months           IS DISTINCT FROM OLD.bonus_months
      OR NEW.max_family_members     IS DISTINCT FROM OLD.max_family_members
      OR NEW.is_unlimited           IS DISTINCT FROM OLD.is_unlimited
      OR NEW.bonified_consultations IS DISTINCT FROM OLD.bonified_consultations
      OR NEW.plan_kind              IS DISTINCT FROM OLD.plan_kind
      OR NEW.payment_option         IS DISTINCT FROM OLD.payment_option)
     AND (   EXISTS (SELECT 1 FROM public.profiles WHERE plan_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.family_coverage_windows WHERE plan_id_snapshot = OLD.id))
  THEN
    RAISE EXCEPTION 'El plan "%" esta en uso: no se pueden modificar su precio ni sus condiciones. Cree una nueva version del plan.', OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_plan_in_use IS 'Blocks changing the price/terms of a plan that affiliates already have. Price changes are new plan versions, so existing affiliates keep their price.';

DROP TRIGGER IF EXISTS plans_guard_in_use ON public.plans;
CREATE TRIGGER plans_guard_in_use
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_plan_in_use();

-- 4. The new catalog ------------------------------------------------------------
INSERT INTO public.plans (
  name, monthly_cost, bonified_consultations, is_unlimited, max_family_members,
  paid_months, bonus_months, plan_kind, payment_option, is_offered, advisor_commission_amount
) VALUES
  ('Plan Individual',              14999, 0, true, 0, 1,  0, 'individual', 'standard',   true,  7500),
  ('Plan Familiar',                49999, 0, true, 4, 1,  0, 'familiar',   'standard',   true, 25000),
  ('Plan Familiar Débito Tarjeta', 39999, 0, true, 4, 1,  0, 'familiar',   'card_debit', true, 25000),
  ('Plan Familiar Semestral',      39999, 0, true, 4, 6,  1, 'familiar',   'prepaid_6',  true, 30000),
  ('Plan Familiar Anual',          39999, 0, true, 4, 12, 2, 'familiar',   'prepaid_12', true, 35000)
ON CONFLICT (name) DO NOTHING;

-- 5. Retire the legacy plan and make the standard Familiar plan the fallback ----
-- Two statements on purpose: the partial unique index on is_default is checked
-- row by row, so the old default must be cleared before the new one is set.
UPDATE public.plans SET is_offered = false WHERE name = 'Plan Familiar Medinex';
UPDATE public.plans SET is_default = false WHERE is_default AND name <> 'Plan Familiar';
UPDATE public.plans SET is_default = true  WHERE name = 'Plan Familiar';
