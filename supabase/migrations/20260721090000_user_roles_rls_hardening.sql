-- Migration: user_roles RLS hardening (privilege-escalation fix)
-- Description:
-- `public.user_roles` (created 20260427000000_admin_rls_policies.sql) backs
-- `is_admin()` — every admin-only check in this app (assign_plan,
-- renew_coverage_window, the receivables-ledger RPCs, profiles/plans/
-- invoices RLS, etc.) ultimately trusts this table. It was created with RLS
-- never enabled and `GRANT ALL ... TO authenticated`, meaning any logged-in
-- patient could run `supabase.from('user_roles').upsert({user_id, role:
-- 'admin'})` from the browser client and self-promote — legitimately
-- passing every is_admin() check afterward, since the function's logic is
-- correct but its data source was unprotected. Found by judgment-day review
-- of the cuenta-corriente-billing PR2 receivables ledger, which raised the
-- stakes from "role confusion" to "forge financial ledger entries."
--
-- Fix: enable RLS, restrict writes to admins (via is_admin() itself — safe,
-- no recursion, because is_admin() is SECURITY DEFINER and therefore
-- bypasses this table's RLS when it reads it). The base GRANT stays ALL for
-- `authenticated` (Postgres checks GRANTs before RLS — revoking write GRANTs
-- entirely would block even a real admin's direct write, since RLS never
-- gets a chance to run; this mirrors the existing `profiles` table's own
-- pattern: GRANT ALL + RLS policies do the actual restricting). The role-
-- sync trigger (`sync_user_role`, same source migration) is also SECURITY
-- DEFINER, so legitimate role changes (an admin editing profiles.role) keep
-- working unaffected — only a non-admin's direct write to user_roles itself
-- is blocked, by RLS.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own role" ON public.user_roles;
CREATE POLICY "Users read own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all roles" ON public.user_roles;
CREATE POLICY "Admins manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- GRANT stays ALL (unchanged from the original migration) — RLS above is
-- the layer doing the actual restricting, matching the `profiles` table's
-- own established pattern in this codebase.

COMMENT ON TABLE public.user_roles IS 'Backs is_admin(). RLS: self can SELECT own row; only admins (via is_admin(), SECURITY DEFINER, bypasses this RLS) can write — GRANT ALL stays in place because Postgres checks GRANTs before RLS, so revoking it would block even a real admin''s direct write. Role changes normally happen via the sync_user_role trigger on profiles.role (also SECURITY DEFINER), not direct writes to this table.';
