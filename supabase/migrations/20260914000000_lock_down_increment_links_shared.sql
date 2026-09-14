-- Migration: lock down increment_links_shared (Judgment Day finding K1)
--
-- `increment_links_shared(row_id uuid)` (20260719000000_add_increment_links_shared_fn.sql)
-- is SECURITY DEFINER with no `SET search_path` and no REVOKE/GRANT
-- restriction, so any authenticated/anon client could call it directly via
-- `supabase.rpc()` with an arbitrary `row_id`, incrementing ANY producer's
-- `links_shared_count` (IDOR) and bypassing server.js's own role/is_active
-- checks in POST /api/advisor/increment-share. Locks it down using the exact
-- same pattern as `20260907000000_set_advisor_status.sql`'s
-- set_advisor_status function: pin search_path, then restrict execution to
-- service_role only. After this, only the backend's service-role client can
-- call it — and server.js already does its own role/is_active/ownership
-- checks before calling the RPC.

ALTER FUNCTION public.increment_links_shared(uuid) SET search_path = public;

REVOKE ALL ON FUNCTION public.increment_links_shared(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_links_shared(uuid) TO service_role;
