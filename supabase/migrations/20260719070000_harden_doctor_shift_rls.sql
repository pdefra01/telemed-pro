-- Migration: Harden RLS for doctor_work_shifts and office_locations
-- Replaces permissive USING(true) demo policies with owner/admin-scoped policies.
-- Base GRANTs already exist (20260719010000). is_admin() defined in 20260427000000.
--
-- NOTE: originally planned as 20260719020000 per design.md/tasks.md, but that
-- timestamp was already taken by 20260719020000_add_locality_neighborhood_to_profiles.sql
-- (applied after design/tasks were written). Renumbered to 20260719070000 to land
-- after every other same-day migration already applied locally.

-- ── Backfill: close orphaned/stale active shifts BEFORE tightening RLS ──
-- Any shift still 'active' after more than 8 hours is treated as forgotten
-- (doctor never clocked out). Mark it 'abandoned' with duration_minutes=NULL
-- so it is naturally excluded from any average-session analytics.
UPDATE public.doctor_work_shifts
SET status = 'abandoned',
    clock_out = now(),
    duration_minutes = NULL
WHERE status = 'active'
  AND clock_in < now() - interval '8 hours';

-- ── doctor_work_shifts ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all read doctor_work_shifts"  ON public.doctor_work_shifts;
DROP POLICY IF EXISTS "Allow all write doctor_work_shifts" ON public.doctor_work_shifts;

-- Doctor reads only own shifts
CREATE POLICY "Doctors read own shifts"
  ON public.doctor_work_shifts FOR SELECT TO authenticated
  USING (doctor_id = auth.uid());

-- Doctor inserts only own shifts (clockIn)
CREATE POLICY "Doctors insert own shifts"
  ON public.doctor_work_shifts FOR INSERT TO authenticated
  WITH CHECK (doctor_id = auth.uid());

-- Doctor updates only own shifts (clockOut, autoCloseOldShifts) — no doctor DELETE
CREATE POLICY "Doctors update own shifts"
  ON public.doctor_work_shifts FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Admin full access (getAdminAnalytics all-rows read + any future admin ops)
CREATE POLICY "Admins manage all shifts"
  ON public.doctor_work_shifts FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── office_locations ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all read office_locations"  ON public.office_locations;
DROP POLICY IF EXISTS "Allow all write office_locations" ON public.office_locations;

-- Any authenticated user may read offices (clockIn geofence check via
-- OfficeLocationRepository.getAllOffices(), client-side anon-key read)
CREATE POLICY "Authenticated read office_locations"
  ON public.office_locations FOR SELECT TO authenticated
  USING (true);

-- Only admins may create/update/delete offices
CREATE POLICY "Admins manage office_locations"
  ON public.office_locations FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
