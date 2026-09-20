-- Migration: Offering a plan withdraws the previous offered plan of the same option
-- (odd/new-plans-pricing, T5 follow-up)
-- Description: A price change is a NEW plan version. When the new version is
-- offered, the previous offered plan of the same (plan_kind, payment_option) is
-- withdrawn in the same statement, so admins never hit the unique-offered index.
-- Withdrawn plans stay assigned to the affiliates who already have them.

CREATE OR REPLACE FUNCTION public.withdraw_previous_offered_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.plans
  SET is_offered = false
  WHERE is_offered
    AND plan_kind = NEW.plan_kind
    AND payment_option = NEW.payment_option
    AND id <> NEW.id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.withdraw_previous_offered_plan IS 'Keeps one offered plan per (plan_kind, payment_option): offering a new version withdraws the previous one.';

DROP TRIGGER IF EXISTS plans_withdraw_previous_offered ON public.plans;
CREATE TRIGGER plans_withdraw_previous_offered
  BEFORE INSERT OR UPDATE OF is_offered, plan_kind, payment_option ON public.plans
  FOR EACH ROW
  WHEN (NEW.is_offered)
  EXECUTE FUNCTION public.withdraw_previous_offered_plan();
