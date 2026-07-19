-- Migration: Anti-duplicate guards for adhesion requests (DNI + CUIL)
-- Description: Adds the CUIL identifier alongside DNI for affiliates, dependents,
-- and adhesion requests, dedupes any pre-existing duplicate PENDING adhesion
-- requests (keeping only the latest per identifier), then enforces uniqueness
-- via partial unique indexes as a database-level backstop to the app-layer
-- duplicate check (POST /api/adhesion/check-duplicates).

-- 1. New columns (nullable — existing rows survive; app enforces presence going forward)
ALTER TABLE public.profiles          ADD COLUMN IF NOT EXISTS cuil TEXT;
ALTER TABLE public.family_members    ADD COLUMN IF NOT EXISTS cuil TEXT;
ALTER TABLE public.adhesion_requests ADD COLUMN IF NOT EXISTS titular_cuil TEXT;

-- 2. Dedupe PENDING adhesion_requests before creating unique indexes.
-- For any normalized titular_dni OR normalized titular_cuil shared by more than
-- one pending row, keep only the latest (by created_at) as 'pending' and mark
-- the rest 'rejected'. Rows are never deleted. Already-approved rows are
-- untouched (the CTE only ever selects status = 'pending').
WITH ranked AS (
  SELECT
    id,
    greatest(
      row_number() OVER (
        PARTITION BY regexp_replace(titular_dni, '\D', '', 'g')
        ORDER BY created_at DESC
      ),
      -- NULL titular_cuil rows must never be treated as duplicates of each
      -- other (Postgres groups all NULLs into one partition, which would
      -- otherwise mass-reject unrelated rows that simply have no CUIL yet).
      CASE
        WHEN titular_cuil IS NULL THEN 1
        ELSE row_number() OVER (
          PARTITION BY regexp_replace(titular_cuil, '\D', '', 'g')
          ORDER BY created_at DESC
        )
      END
    ) AS rn
  FROM public.adhesion_requests
  WHERE status = 'pending'
)
UPDATE public.adhesion_requests a
SET status = 'rejected'
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- 3. Partial unique indexes on adhesion_requests — normalized, pending-only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_adhesion_pending_titular_dni
  ON public.adhesion_requests ((regexp_replace(titular_dni, '\D', '', 'g')))
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_adhesion_pending_titular_cuil
  ON public.adhesion_requests ((regexp_replace(titular_cuil, '\D', '', 'g')))
  WHERE status = 'pending' AND titular_cuil IS NOT NULL;

-- 4. Affiliate identity: one profile per CUIL (mirrors profiles.dni usage),
-- NULL-tolerant so doctors (who have no CUIL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_cuil
  ON public.profiles ((regexp_replace(cuil, '\D', '', 'g')))
  WHERE cuil IS NOT NULL;
