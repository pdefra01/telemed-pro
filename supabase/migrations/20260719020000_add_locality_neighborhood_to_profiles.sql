-- Description: The advisor self-management form (AdvisorDashboard.tsx) reads/writes
-- profiles.locality and profiles.neighborhood, but no migration ever added these
-- columns to `profiles` (they only exist on `adhesion_requests`). This caused
-- GET .../profiles?select=phone,address,locality,neighborhood to fail with 400
-- for every advisor loading their dashboard.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locality TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT;
