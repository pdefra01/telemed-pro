-- Migration: Restrict producers table writes to admins
-- Description: "Manage producers" was `FOR ALL TO authenticated USING (true)`,
-- meaning any logged-in user — patient, doctor, advisor — could read AND
-- write (insert/update/delete) any row in public.producers, including
-- commission_rate and status for advisors that are not their own. Read
-- access is left exactly as-is (needed for producer-code lookups during
-- signup/subscription flows); only writes are now admin-scoped, matching
-- the public.is_admin() pattern already used everywhere else.

DROP POLICY IF EXISTS "Manage producers" ON public.producers;

CREATE POLICY "Authenticated read producers"
  ON public.producers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins write producers"
  ON public.producers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update producers"
  ON public.producers FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete producers"
  ON public.producers FOR DELETE TO authenticated
  USING (public.is_admin());
