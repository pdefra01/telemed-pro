-- Migration: Atomic advisor status toggle (sdd/advisor-auto-provisioning, PR 1)
--
-- Backs `PATCH /api/advisors/:id/status` (design 3.3). Two independent
-- sequential UPDATEs (as done manually in /api/create-advisor's rollback
-- path, server.js) can leave `profiles`/`producers` inconsistent if the
-- second write fails after the first commits. This function runs both
-- writes inside a single implicit transaction: if the `profiles` UPDATE
-- fails, the `producers` UPDATE above it rolls back too. Follows the same
-- SECURITY DEFINER RPC pattern already used by
-- finalize_subscription_enrollment / claim_subscription_enrollment.
--
-- `producers` is the driving row (D2): a placeholder producer row with no
-- linked `profiles`/Auth account (e.g. "Landing Directo (sin asesor)") must
-- still be deactivatable. Zero rows affected on the `profiles` UPDATE is not
-- an error — the RPC reports `has_account = false` for that case instead.
--
-- The `role = 'advisor'` guard on the `profiles` UPDATE is defense in depth:
-- it prevents this RPC from ever being able to flip `is_active` on an admin
-- or patient profile that happens to share the target id.

CREATE OR REPLACE FUNCTION public.set_advisor_status(p_advisor_id UUID, p_active BOOLEAN)
RETURNS TABLE (advisor_id UUID, producer_status TEXT, has_account BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT := CASE WHEN p_active THEN 'active' ELSE 'inactive' END;
  v_producer_rows INT;
  v_profile_rows INT;
BEGIN
  UPDATE public.producers SET status = v_status WHERE id = p_advisor_id;
  GET DIAGNOSTICS v_producer_rows = ROW_COUNT;
  IF v_producer_rows = 0 THEN
    RAISE EXCEPTION 'advisor_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET is_active = p_active
   WHERE id = p_advisor_id AND role = 'advisor';
  GET DIAGNOSTICS v_profile_rows = ROW_COUNT;

  RETURN QUERY SELECT p_advisor_id, v_status, v_profile_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_advisor_status(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_advisor_status(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.set_advisor_status(UUID, BOOLEAN) IS 'Atomically toggles an advisor''s commercial status (producers.status) and login gate (profiles.is_active). Raises advisor_not_found (P0002) when no producers row matches. has_account = false means the target is a placeholder producer row with no linked profiles/Auth account (never fails on that case).';
