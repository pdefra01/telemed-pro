# Technical Design: Doctor Shift Hardening

> Scope: harden the already-working doctor clock-in/out feature. No new user-facing feature.
> Store: hybrid (this file + Engram `sdd/doctor-shift-hardening/design`).

## 0. Verification Log (facts checked against code, not assumed)

| Claim in proposal | Verified result |
|---|---|
| Tightening `doctor_work_shifts` RLS may break the doctor KPIs shipped today ("Atenciones/Consultas/Promedio Sesión") | **FALSE.** `DashboardRepository.getDoctorKPIs()` (lines 161-222) queries **only** `appointments` (pending count, completed count, avg via `appointments.duration_minutes`). It never touches `doctor_work_shifts`. The doctor dashboard KPIs are unaffected. |
| Some admin query needs SELECT over all `doctor_work_shifts` rows | **TRUE, but it is a different method.** `DashboardRepository.getAdminAnalytics()` (lines 227-252) selects `doctor_work_shifts` with optional `doctor_id` filter; called from `AdminDashboard.tsx:116` with `selectedDoctorId` that can be `'global'` (all rows). Runs client-side through the anon-key `supabase` client under the admin's JWT. This is the real caller that owner-only RLS would break → it needs an admin read policy. |
| `office_locations` SELECT is read client-side by `clockIn()` | **TRUE.** `OfficeLocationRepository` imports the anon `supabase` client; `clockIn()` → `getAllOffices()` → `.from('office_locations').select('*')`. `detectCurrentIp()` calls ipify/seeip over HTTP, not the DB. So SELECT must stay open to authenticated; only writes get locked to admin. |
| `getAllDoctorShifts()` has zero callers | **TRUE.** Grep across `src/` finds only its own definition (`DoctorShiftRepository.ts:133`) and doc mentions. Safe to delete. |
| No background job runner exists | **TRUE.** `supabase/functions/` contains only request-triggered edge functions (`livekit-token`, `ai-medical-assistant`, `whatsapp-inbound`, `finalize-consultation`). No `pg_cron`, no scheduled invocation. A pure server-side sweep is not feasible without new infrastructure. |
| Admin RLS pattern to mirror | `profiles` (migration `20260427000000`) uses `public.is_admin()` — a `SECURITY DEFINER` function backed by `user_roles`, recursion-free — with the shape **"Admins FOR ALL (USING/WITH CHECK is_admin()) + separate self-scoped SELECT/UPDATE"**. That same migration replaced policies via `DROP POLICY IF EXISTS` + `CREATE POLICY`, so replacement (not just additive grants) is an established precedent in this repo. |
| Base table GRANTs exist | **TRUE.** `20260719010000_fix_missing_table_grants.sql` already grants CRUD on `doctor_work_shifts` and `office_locations` to `authenticated`, `service_role`. No new GRANT needed; only the policies change. `is_admin()` already has EXECUTE granted to `authenticated`. |

## 1. Architecture Approach

Two established patterns are reused verbatim; nothing new is invented:

1. **Authorization**: mirror the `profiles` RLS shape using the canonical `public.is_admin()` helper (NOT the weaker `auth.jwt() ->> 'role' = 'admin'` variant seen in `plans`/`agreements`; JWT custom claims are not reliably populated in this project, whereas `is_admin()` reads `user_roles` and is already the pattern `profiles` depends on).
2. **Orphan mitigation**: extend the **existing lazy** `autoCloseOldShifts()` mechanism rather than adding infrastructure — deterministic, zero new infra — plus a cheap best-effort graceful-close hook.

Layering is unchanged: React page (`DoctorDashboard`/`AdminDashboard`) → repository (`DoctorShiftRepository`/`OfficeLocationRepository`/`DashboardRepository`) → anon-key `supabase` client → Postgres + RLS. The hardening lives at the RLS boundary and inside the repository; the UI/timer/toasts are untouched.

## 2. Component & Data-Flow Map

| Component | Change | Data flow after change |
|---|---|---|
| Postgres RLS `doctor_work_shifts` | Replace 2 permissive policies with 4 scoped policies | Doctor: only rows where `doctor_id = auth.uid()`. Admin: all rows via `is_admin()`. |
| Postgres RLS `office_locations` | Replace 2 permissive policies with 2 policies | Any authenticated user: SELECT. Admin only: INSERT/UPDATE/DELETE. |
| `DoctorShiftRepository.getActiveShift()` | Add stale guard | If the found active shift's `clock_in` exceeds `MAX_SHIFT_HOURS`, auto-close it as `abandoned` and return `null` (clean "Fichar Entrada" state, no runaway timer). |
| `DoctorShiftRepository.autoCloseOldShifts()` | Add age classification | Prior open shifts older than `MAX_SHIFT_HOURS` close as `status='abandoned'` (duration `NULL`); recent ones keep the current `completed` behavior. |
| `DoctorShiftRepository.getAllDoctorShifts()` | **Delete** (lines 133-154) | Dead code removed. |
| `DoctorDashboard.tsx` | Add best-effort `pagehide`/`visibilitychange` listener | On tab hide/close with an active shift, fire a best-effort clock-out; not relied on for correctness. |
| `DashboardRepository.getAdminAnalytics()` | No code change; **must keep working** under admin RLS | Confirmed compatible: admin SELECT-all policy preserves the `'global'` and per-doctor reads. |
| `DashboardRepository.getDoctorKPIs()` | No change | Untouched; queries only `appointments`. |

## 3. RLS Design (exact policies)

### 3.1 `doctor_work_shifts`

Drop permissive:
- `"Allow all read doctor_work_shifts"` (SELECT USING true)
- `"Allow all write doctor_work_shifts"` (ALL USING true)

Create scoped (least privilege — doctors never delete; delete is admin-only):

```sql
-- Doctor reads only own shifts
CREATE POLICY "Doctors read own shifts"
ON public.doctor_work_shifts FOR SELECT TO authenticated
USING (doctor_id = auth.uid());

-- Doctor inserts only own shifts (clockIn)
CREATE POLICY "Doctors insert own shifts"
ON public.doctor_work_shifts FOR INSERT TO authenticated
WITH CHECK (doctor_id = auth.uid());

-- Doctor updates only own shifts (clockOut, autoCloseOldShifts)
CREATE POLICY "Doctors update own shifts"
ON public.doctor_work_shifts FOR UPDATE TO authenticated
USING (doctor_id = auth.uid())
WITH CHECK (doctor_id = auth.uid());

-- Admin full access (getAdminAnalytics all-rows read + any future admin ops)
CREATE POLICY "Admins manage all shifts"
ON public.doctor_work_shifts FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
```

Compatibility check against every real call path:
- `clockIn()` INSERT with `doctor_id = user.id` → `WITH CHECK` passes (auth.uid() == user.id).
- `getActiveShift()` SELECT `.eq('doctor_id', doctorId)` + join `office_locations(name)` → passes (own row + open office SELECT).
- `clockOut()` fetch-by-id then UPDATE-by-id on own row → passes.
- `autoCloseOldShifts()` SELECT+UPDATE own active rows → passes.
- `getAdminAnalytics()` SELECT all (`'global'`) or per-doctor → passes via admin ALL policy. (Multiple permissive policies are OR'd, so an admin also matching nothing else still sees all rows.)

### 3.2 `office_locations`

Drop permissive:
- `"Allow all read office_locations"` (SELECT USING true)
- `"Allow all write office_locations"` (ALL USING true)

Create:

```sql
-- Any authenticated user may read offices (clockIn geofence check)
CREATE POLICY "Authenticated read office_locations"
ON public.office_locations FOR SELECT TO authenticated
USING (true);

-- Only admins may create/update/delete offices
CREATE POLICY "Admins manage office_locations"
ON public.office_locations FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
```

Rationale: the SELECT policy (SELECT-only) is OR'd for non-admins, so `clockIn()`'s `getAllOffices()` still works for every doctor; the FOR ALL policy governs INSERT/UPDATE/DELETE, blocking non-admins from writes. Exactly the `profiles` shape (separate self-SELECT + admin FOR ALL). Office CRUD via `OfficeLocationRepository.create/update` will work when an admin is logged in (or when reached through the service-role admin client, which bypasses RLS). Task phase should confirm office-write UI is admin-gated.

## 4. Orphaned-Shift Mitigation — Chosen Mechanism

**Decision: extend the existing lazy `autoCloseOldShifts()` + stale guard in `getActiveShift()` as the guaranteed backbone, with a best-effort `pagehide`/`visibilitychange` graceful-close hook as a cheap optimization.** Reject a pure server-side scheduled sweep and reject relying on `sendBeacon` alone.

Why not the alternatives:
- **Pure server-side scheduled sweep (option b, cron/edge)**: infeasible without new infrastructure — there is no `pg_cron` and no scheduler for edge functions in this project (verified). Adding one is out of scope and disproportionate to the risk.
- **`navigator.sendBeacon` alone (option a)**: `sendBeacon` cannot attach the `apikey` + `Authorization: Bearer <jwt>` headers that Supabase REST + RLS require (it only sets a body + content-type), so it cannot authenticate the UPDATE. And no unload-time hook survives a crash/process-kill/power-loss. Best-effort at most, and not sufficient by itself.

Design:

1. **Guaranteed-eventually (deterministic, no new infra):**
   - Introduce `MAX_SHIFT_HOURS = 16` (a plausible upper bound well beyond any real shift; a real forgotten clock-out is the target, not a genuine long day).
   - Add a new status value `'abandoned'` alongside `'active'` / `'completed'`. The column is `TEXT NOT NULL DEFAULT 'active'` with **no CHECK constraint** (verified), so this needs **no migration/schema change**.
   - `getActiveShift(doctorId)`: after fetching the active row, if `now - clock_in > MAX_SHIFT_HOURS`, UPDATE it to `status='abandoned'`, `clock_out = now`, `duration_minutes = NULL`, and return `null`. This fires every time the doctor loads their dashboard — cleaning orphans even if they never formally clock in again, and preventing a 300-hour runaway timer.
   - `autoCloseOldShifts(doctorId)` (already runs inside `clockIn()`): classify by age — prior open rows older than `MAX_SHIFT_HOURS` close as `status='abandoned'` (`duration_minutes = NULL`); rows within the window keep today's `completed` + computed-duration behavior.
   - **Analytics honesty**: `abandoned` rows carry `duration_minutes = NULL`, so they are naturally excluded from any average-session computation. Task phase must ensure `getAdminAnalytics()`'s session-duration aggregation counts only `status='completed'` (or non-null durations), so a forgotten shift never poisons "Promedio Sesión". This avoids the trap of marking a multi-day orphan as a legitimate `completed` shift with a bogus huge duration.

2. **Best-effort graceful close (cheap optimization, explicitly not relied upon):**
   - In `DoctorDashboard`, add a listener on `visibilitychange` (when `document.visibilityState === 'hidden'`) and `pagehide` that, when `activeShift` is set, issues a best-effort clock-out.
   - Implement with `fetch(..., { keepalive: true })` to the Supabase REST PATCH endpoint using the current session's access token (NOT `sendBeacon`, which cannot set auth headers). Idempotent: it only affects a still-`active` row; if the doctor already clicked "Fichar Salida", the row is `completed` and the update is a no-op under the same-row scope.
   - Clearly labeled best-effort: it improves the common "closed the tab and walked away" case but is not the correctness guarantee — the lazy backbone above is.

Residual accepted risk: a doctor who closes the tab AND never loads the dashboard again AND never clocks in again leaves an orphan until one of those happens. Given no cron infra, this is the honest, minimal-cost tradeoff; the row is capped/abandoned the moment they next interact, and analytics already ignores null-duration rows.

## 5. Geofence on `clockOut()` — Confirmed Decision

No IP/geofence block on exit (per proposal §4). Enforcing office presence to *close* a shift would strand a doctor who left without clocking out, worsening the orphan problem. **Also decided: do NOT add a `clock_out_ip` column.** It is audit-only nice-to-have with no consumer (no attendance/audit panel exists or is in scope); adding an optional column now is speculative. If audit is later required, add it then. This keeps the migration RLS-only.

## 6. `getAllDoctorShifts()` Removal

Delete `DoctorShiftRepository.ts` lines **133-154** (the entire `async getAllDoctorShifts(): Promise<any[]> { ... }` method). Zero callers confirmed by grep. No other edits needed (no imports reference it). If an admin "Jornadas" panel is ever built, re-create a purpose-built method backed by the new admin RLS policy.

## 7. Migration Plan

New file: `supabase/migrations/20260719020000_harden_doctor_shift_rls.sql` (after the `20260719010000` grants fix, same day).

Pattern: `DROP POLICY IF EXISTS` + `CREATE POLICY` — the same replacement pattern `20260427000000_admin_rls_policies.sql` already used for `profiles`. This is REPLACING permissive `USING (true)` policies, so drop-then-create is correct (additive-only would leave the permissive policies in place and OR'd, defeating the tightening).

```sql
-- Migration: Harden RLS for doctor_work_shifts and office_locations
-- Replaces permissive USING(true) demo policies with owner/admin-scoped policies.
-- Base GRANTs already exist (20260719010000). is_admin() defined in 20260427000000.

-- ── doctor_work_shifts ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all read doctor_work_shifts"  ON public.doctor_work_shifts;
DROP POLICY IF EXISTS "Allow all write doctor_work_shifts" ON public.doctor_work_shifts;

CREATE POLICY "Doctors read own shifts"
  ON public.doctor_work_shifts FOR SELECT TO authenticated
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors insert own shifts"
  ON public.doctor_work_shifts FOR INSERT TO authenticated
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors update own shifts"
  ON public.doctor_work_shifts FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Admins manage all shifts"
  ON public.doctor_work_shifts FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── office_locations ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all read office_locations"  ON public.office_locations;
DROP POLICY IF EXISTS "Allow all write office_locations" ON public.office_locations;

CREATE POLICY "Authenticated read office_locations"
  ON public.office_locations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage office_locations"
  ON public.office_locations FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

Safety / ordering:
- RLS already enabled on both tables (`20260628000005`), and base GRANTs already present (`20260719010000`) — dropping the permissive policies immediately makes RLS effective; no window where the tables become ungranted/unreadable for legitimate roles.
- No schema/data-destructive changes (no column add/drop, no data mutation). `'abandoned'` needs no constraint change.
- Idempotent DROPs (`IF EXISTS`). CREATE is not guarded; re-running would error on duplicate policy names — standard for this repo's forward-only migrations.
- Rollback: drop the four/two new policies and re-create the original `USING (true)` policies from `20260628000005`.

## 8. ADR Summary

- **ADR-1 — Use `public.is_admin()` for admin scoping.** Chosen over `auth.jwt() ->> 'role' = 'admin'` because it is the recursion-free, `user_roles`-backed helper that `profiles` already relies on; JWT custom claims are not reliably populated here. Rejected: the JWT-claim variant (brittle) and a bespoke per-table role check (reinvents `is_admin`).
- **ADR-2 — Owner-scoped SELECT/INSERT/UPDATE + admin FOR ALL on `doctor_work_shifts`; no doctor DELETE.** Matches least privilege and the real call paths; admin ALL preserves `getAdminAnalytics()`. Rejected: a single `USING (doctor_id = auth.uid() OR is_admin())` per-command set (more verbose, same effect, and harder to read than the mirrored `profiles` shape).
- **ADR-3 — Orphan handling via lazy `autoCloseOldShifts()` extension + stale guard + best-effort unload hook.** Rejected pure cron sweep (no infra) and `sendBeacon`-only (cannot auth, cannot survive crash). Introduces `status='abandoned'` (no schema change) so analytics stay honest.
- **ADR-4 — No geofence on clock-out, no `clock_out_ip` column.** Avoids stranding departed doctors and avoids a speculative audit column with no consumer.
- **ADR-5 — Delete `getAllDoctorShifts()`.** Dead code; would break under owner-scoped RLS anyway; re-create purpose-built if an admin panel is ever scoped.

## 9. Open Items for Task Phase
- Confirm `getAdminAnalytics()` session-average aggregation filters to `status='completed'` / non-null `duration_minutes` (so `abandoned` rows don't skew "Promedio Sesión").
- Confirm office-write UI paths are admin-gated (or use the service-role client) so the admin-only `office_locations` write policy doesn't break a legitimate flow.
- Decide exact `MAX_SHIFT_HOURS` value with the product owner (design recommends 16).
