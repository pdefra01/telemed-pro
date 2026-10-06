-- Migration: Lock down contact_verifications
-- Description: 20260718001000 added "Public ..." policies that let `anon` (and
-- `authenticated`) insert OTP challenges with any column values (including a
-- preset `verified_at`), read pending challenges including `otp_code`, and
-- update them. That made the server-side email verification gate
-- (server/emailVerification.js `isEmailVerified`, used by
-- POST /api/adhesion/:id/activate) bypassable with the public anon key.
--
-- The guest (pre-adhesion) OTP flow goes exclusively through
-- /api/email-verification/send|verify with the service role, so the browser
-- never needs anon access to this table. The logged-in profile 2FA flow
-- (src/repositories/ContactVerificationRepository.ts) keeps working through
-- the "Users ... own verifications" policies, scoped to user_id = auth.uid().

-- 1. Remove the public (anon + authenticated) policies.
DROP POLICY IF EXISTS "Public insert verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Public select verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Public update verifications" ON public.contact_verifications;

-- 2. anon gets no table privileges at all (granted in 20260719010000).
REVOKE ALL ON TABLE public.contact_verifications FROM anon;

-- 3. Authenticated self-service: own rows only. A new challenge must start
--    unverified with no failed attempts, so a client cannot insert a row that
--    already counts as verified. Updates cannot move a row to another user
--    (or to user_id NULL, the namespace of server-issued guest challenges).
DROP POLICY IF EXISTS "Users view own verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Users insert own verifications" ON public.contact_verifications;
DROP POLICY IF EXISTS "Users update own verifications" ON public.contact_verifications;

CREATE POLICY "Users view own verifications" ON public.contact_verifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own verifications" ON public.contact_verifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND verified_at IS NULL AND attempts = 0);

CREATE POLICY "Users update own verifications" ON public.contact_verifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
