-- Migration: end a cancelled affiliate's sessions on the server.
--
-- The client already refuses to log in a cancelled affiliate, but a session
-- opened before the cancellation became effective kept working: the access
-- token renews with its refresh token forever, and almost no RLS policy checks
-- is_active. Once a cancellation applies, the affiliate is now banned in
-- Supabase Auth (refresh and new logins refused, also through the API) and
-- their sessions are deleted (their refresh tokens go with them). An access
-- token already issued stays valid until it expires (jwt_expiry).
--
-- A cancellation is terminal today (nothing reactivates a cancelled
-- affiliate). If an admin ever takes a profile out of plan_status 'cancelled',
-- the ban is lifted automatically.

-- 1. Sweep: also ban and revoke.
CREATE OR REPLACE FUNCTION public.apply_due_affiliate_cancellations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_count INTEGER;
BEGIN
  WITH due AS (
    UPDATE public.affiliate_cancellations c
       SET applied_at = now()
     WHERE c.applied_at IS NULL AND c.effective_at <= now()
    RETURNING c.profile_id
  )
  SELECT array_agg(profile_id) INTO v_ids FROM due;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.profiles p
     SET is_active = false, plan_status = 'cancelled'
   WHERE p.id = ANY (v_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.revoke_cancelled_affiliate_access(v_ids);

  RETURN v_count;
END;
$$;

-- 2. Ban in Supabase Auth and delete the sessions of the given profiles.
CREATE OR REPLACE FUNCTION public.revoke_cancelled_affiliate_access(p_profile_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A far-future date, like the Admin API's ban_duration '876000h' (100 years):
  -- GoTrue reads banned_until as a Go time, which cannot hold 'infinity'.
  UPDATE auth.users
     SET banned_until = now() + interval '100 years'
   WHERE id = ANY (p_profile_ids);

  -- auth.refresh_tokens rows go with their session (ON DELETE CASCADE).
  DELETE FROM auth.sessions WHERE user_id = ANY (p_profile_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_cancelled_affiliate_access(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_cancelled_affiliate_access(UUID[]) TO service_role;

-- 3. Lift the ban if an admin takes the profile out of 'cancelled'.
CREATE OR REPLACE FUNCTION public.unban_reactivated_affiliate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.plan_status = 'cancelled' AND NEW.plan_status IS DISTINCT FROM 'cancelled' THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.unban_reactivated_affiliate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS unban_reactivated_affiliate ON public.profiles;
CREATE TRIGGER unban_reactivated_affiliate
  AFTER UPDATE OF plan_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.unban_reactivated_affiliate();

-- 4. Backfill: cancellations already applied before this migration.
SELECT public.revoke_cancelled_affiliate_access(
  ARRAY(SELECT profile_id FROM public.affiliate_cancellations WHERE applied_at IS NOT NULL)
);
