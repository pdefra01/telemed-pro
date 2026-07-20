-- Migration: Allow anonymous SELECT on producers
-- Description: AdhesionRepository.submitApplication() validates promoter_id
-- against public.producers before accepting a public adhesion request — but
-- the adhesion form (/adhesion) is intentionally unauthenticated (no login
-- required), so that SELECT runs as the `anon` role. producers only ever
-- granted SELECT to `authenticated` (20260720020000), so every anonymous
-- submission with a promoter code hit a genuine 42501 permission-denied
-- error. The code path treats any SELECT error as non-blocking ("could not
-- validate, proceed anyway"), so submissions still succeeded and the
-- promoter_id string still got saved — but the actual point of that check,
-- rejecting invalid/inactive promoter codes, never ran for anyone filling
-- out the form without a session.

GRANT SELECT ON public.producers TO anon;

CREATE POLICY "Anonymous read producers"
ON public.producers FOR SELECT
TO anon
USING (true);
