-- Migration: Add is_default flag to plans
-- Description: /api/approve-adhesion needs a fallback plan when the public
-- adhesion form's plan_type string doesn't match any real plan. The initial
-- PR4 implementation resolved this by matching a hardcoded plan name in
-- server.js — still a hardcoded value, contrary to this change's explicit
-- "never hardcoded" requirement. This adds a real is_default flag, settable
-- by an admin from the Planes tab, so the fallback resolves via a query
-- instead of a magic string.
--
-- Only one plan may be the default at a time: enforced with a partial unique
-- index rather than a CHECK constraint (Postgres CHECK can't reference other
-- rows). Application code must unset the previous default before setting a
-- new one — see PlanRepository.setDefault().

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS plans_single_default_idx
  ON public.plans (is_default)
  WHERE is_default = true;

-- Mark the existing canonical seeded plan as the default, so the system
-- isn't left with zero defaults immediately after this migration runs.
UPDATE public.plans
SET is_default = true
WHERE name = 'Plan Familiar Medinex'
  AND NOT EXISTS (SELECT 1 FROM public.plans WHERE is_default = true);
