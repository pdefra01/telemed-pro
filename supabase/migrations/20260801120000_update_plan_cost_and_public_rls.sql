-- Migration: Update Plan Familiar Medinex cost to $25.000 and enable public RLS read access
-- Description:
-- 1. Updates default monthly cost for 'Plan Familiar Medinex' from $50.000 to $25.000.
-- 2. Grants SELECT permission on public.plans to `public` (anon + authenticated) so prospective
--    affiliates on the unauthenticated /adhesion route can read active plan details.

-- 1. Update canonical plan cost
UPDATE public.plans
SET monthly_cost = 25000
WHERE name = 'Plan Familiar Medinex';

-- 2. Grant public read access to plans reference table
DROP POLICY IF EXISTS "Authenticated read plans" ON public.plans;
DROP POLICY IF EXISTS "Public read plans" ON public.plans;

CREATE POLICY "Public read plans"
  ON public.plans FOR SELECT
  TO public
  USING (true);
