# Tasks: Doctor Shift Hardening

> **Confirmed override**: `MAX_SHIFT_HOURS = 8` (not design.md's suggested 16h default). Every reference below uses 8h.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~480–620 (migration ~55, repo logic ~70, repo deletion -22, dashboard listener ~40, new `DoctorShiftRepository.test.ts` ~180-230, `DoctorDashboard.test.tsx` additions ~50-70, RLS verification script ~90-120) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (migration + RLS verification) → PR 2 (repo logic + tests) → PR 3 (dashboard listener + tests + cleanup) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user must pick before apply |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RLS replacement + stale-shift backfill on `doctor_work_shifts`/`office_locations` | PR 1 | Additive/backward-compatible migration; safe alone; verified via scratch script |
| 2 | 8h abandoned-shift logic + `getAllDoctorShifts()` removal + repo tests | PR 2 | Depends on PR 1's `'abandoned'`-tolerant RLS; independent of PR 3 |
| 3 | Best-effort clock-out on tab close + dashboard tests | PR 3 | Independent of PR 2; can ship in parallel once PR 1 lands |

## Phase 1: Migration — RLS + Stale-Shift Backfill

- [x] 1.1 Create `supabase/migrations/20260719070000_harden_doctor_shift_rls.sql`. (Renumbered from the originally-planned `20260719020000` — that timestamp collided with an already-applied unrelated migration, `20260719020000_add_locality_neighborhood_to_profiles.sql`. Renumbered to `20260719070000`, the next free slot after every same-day migration already applied locally.)
- [x] 1.2 Add backfill UPDATE first: `status='active'` rows with `clock_in < now() - interval '8 hours'` → `status='abandoned'`, `clock_out=now()`, `duration_minutes=NULL` (mirrors the dedupe-before-index pattern from `adhesion-duplicate-guard`'s migration).
- [x] 1.3 `DROP POLICY IF EXISTS` the 2 permissive `doctor_work_shifts` policies; `CREATE POLICY` the 3 doctor-scoped (`SELECT`/`INSERT`/`UPDATE` on `doctor_id = auth.uid()`) + 1 admin `FOR ALL USING/WITH CHECK is_admin()` per design.md §3.1.
- [x] 1.4 `DROP POLICY IF EXISTS` the 2 permissive `office_locations` policies; `CREATE POLICY` `"Authenticated read office_locations"` (SELECT, `USING(true)`) + `"Admins manage office_locations"` (FOR ALL, `is_admin()`) per design.md §3.2.
- [x] 1.5 Apply locally (`npx supabase migration up --local`); confirm clean apply, no duplicate-policy errors. Applied cleanly; verified resulting `pg_policies` rows match design.md §3.1/§3.2 exactly.
- [x] 1.6 Write `scratch/test_doctor_shift_rls.mjs` (pg client, `BEGIN`/`SET LOCAL role='authenticated'` + `request.jwt.claim.sub`, mirrors `scratch/test_rls_insert.mjs`): assert doctor A cannot SELECT/UPDATE doctor B's shift; doctor A can read/write own; admin claim reads all rows; non-admin office write rejected; authenticated office read succeeds. `ROLLBACK` every case. Also covers doctor A cannot INSERT a shift for doctor B (WITH CHECK) and admin CAN write office_locations — 11 assertions total, single wrapping transaction + per-expected-failure `SAVEPOINT`, final `ROLLBACK`.
- [x] 1.7 Run script against local DB; capture pass/fail per scenario in the PR description. Result: 11/11 passed. Confirmed zero residual test rows after rollback (profiles/office_locations/doctor_work_shifts counts all 0 post-run).

## Phase 2: Abandoned-Shift Logic (TDD)

- [x] 2.1 RED: created `src/repositories/__tests__/DoctorShiftRepository.test.ts` (new file — none existed before). 4 tests: `getActiveShift()` auto-abandons + returns `null` when `clock_in` > 8h old (asserts UPDATE payload `status:'abandoned'`, `duration_minutes:null`, `clock_out` set, and `.eq('id', ...)`); returns shift unchanged (no UPDATE call) when within 8h; `autoCloseOldShifts()` (invoked via `(repository as any).autoCloseOldShifts(...)` since it's TS-private only) classifies >8h rows `abandoned`/`duration_minutes:null` and <8h rows `completed`/computed-duration unchanged. Ran against pre-change code: 2 of 4 failed exactly as expected (the 2 unchanged-behavior tests passed against old code, confirming they capture real pre-existing behavior).
- [x] 2.2 GREEN: added `const MAX_SHIFT_HOURS = 8;` module-level constant in `DoctorShiftRepository.ts`.
- [x] 2.3 GREEN: extended `getActiveShift()` — after fetch, computes `shiftAgeHours`; if `> MAX_SHIFT_HOURS`, fires `UPDATE ... status='abandoned', clock_out=now, duration_minutes=NULL` filtered by `.eq('id', data.id)`, returns `null`; otherwise returns the shift unchanged.
- [x] 2.4 GREEN: extended `autoCloseOldShifts()` to branch by `diffHours > MAX_SHIFT_HOURS`: older rows → `abandoned`/`duration_minutes:null`; rows within the window → unchanged existing `completed`/computed-duration path (verified byte-identical behavior via the RED test that passed even before this task's edits).
- [x] 2.5 Deleted `getAllDoctorShifts()` entirely. Confirmed zero callers via fresh grep of `src/` both before and after deletion (only self-reference in the method's own definition, now gone).
- [x] 2.6 Ran `npm test -- DoctorShiftRepository --run`: 4/4 passed. Ran full `npm test --run` twice: failures were confined to the known pre-existing rotating baseline (`VideoRoom.test.tsx`, `AppointmentRepository.test.ts` `createAppointment`, `crypto.test.ts`, `MedicalHistory.test.tsx`/`Profile.test.tsx` — 7-9 flaky failures across runs, unrelated to this change and unchanged in identity between runs). No new failures introduced by Phase 2 changes. Also updated `DoctorWorkShift.status` type in `src/types.ts` to include `'abandoned'` (necessary since the repository now produces/reads that value).

## Phase 3: Best-Effort Clock-Out on Tab Close

- [x] 3.1 RED: extended `src/pages/doctor/__tests__/DoctorDashboard.test.tsx` with a new `DoctorDashboard - Best-Effort Clock-Out on Tab Close` describe block. Mocked `doctorShiftRepository` (new module mock; previously unmocked in this file) and `supabase.auth.getSession` (spied on the real singleton, not a full module mock, to avoid disturbing the untouched realtime-channel code path already exercised by the pre-existing tests). 4 tests: `visibilitychange`(hidden) fires a `keepalive` PATCH `fetch` to `/rest/v1/doctor_work_shifts?id=eq.<id>` with `apikey`/`Authorization: Bearer <token>` when `activeShift` is set; same for `pagehide`; and two negative tests confirming no fetch fires on either event when there is no active shift. Ran against pre-change code: 2 of 4 failed exactly as expected (the 2 positive-assertion tests); the 2 negative tests passed trivially even before the change (no fetch code existed yet), correctly captured as a regression guard.
- [x] 3.2 GREEN: added a new `useEffect` (deps: `[activeShift]`) in `DoctorDashboard.tsx` registering `visibilitychange` + `pagehide` listeners. On fire (only when `activeShift` is set, guarded by early-return), resolves `supabase.auth.getSession()` then issues `fetch(`${supabaseUrl}/rest/v1/doctor_work_shifts?id=eq.${shift.id}`, { method: 'PATCH', keepalive: true, headers: { apikey, Authorization: Bearer <token>, Content-Type, Prefer: return=minimal }, body: { clock_out, duration_minutes, status: 'completed' } })` directly against the Supabase REST endpoint (not the JS client) per design.md §4 — explicitly best-effort, failures silently absorbed via `.catch()`. Exported `supabaseUrl`/`supabaseAnonKey` from `src/services/supabase.ts` (previously module-local consts) so the component could construct the REST URL/headers without duplicating env-var reads.
- [x] 3.3 Verified: `npx vitest run src/pages/doctor/__tests__/DoctorDashboard.test.tsx` — 7/7 passed (3 pre-existing + 4 new). Listener cleanup returns both `removeEventListener` calls keyed off the same effect, torn down on unmount or whenever `activeShift` changes (e.g., after clock-out) — no leak.

## Phase 4: Verification & Cleanup

- [x] 4.1 Confirmed in code (re-verified for this PR): `DashboardRepository.getAdminAnalytics()` — `workMinutes` sums `shift.duration_minutes || 0` (line ~326, null-safe for `abandoned` rows since their `duration_minutes` is `NULL`) and `avgSessionTime` (`grandTotalDuration`/`grandCompletedCount`) derives exclusively from the `appData` (`appointments`) loop — the `shiftData` (`doctor_work_shifts`) loop only ever populates `workMinutes`/`workHours`, never `totalDuration`/`completedCount`. No code change needed.
- [x] 4.2 Confirmed: `src/App.tsx` wraps the `OCCSettings` route (line 195-196) in `<ProtectedRoute user={user} allowedRoles={['admin']}>`. Office-write UI is admin-gated. No change needed.
- [x] 4.3 Grepped `src/` for `getAllDoctorShifts` post-deletion (fresh grep for this final PR): zero matches. Confirms PR 2's deletion is clean and nothing in PR 3 reintroduced a reference.
- [x] 4.4 Ran full `npm test -- --run`: 71/78 passed, 7 failed. Failures confined exactly to the known pre-existing rotating baseline: `VideoRoom.test.tsx` (Doctor Notes Panel, 3 tests), `crypto.test.ts` (tampered-signature test), `AppointmentRepository.test.ts` (`createAppointment`), `Profile.test.tsx` (2 tests) — all unrelated to this change, none newly introduced. `DoctorDashboard.test.tsx` and `DoctorShiftRepository.test.ts` (this change's test files) both fully passed within the run.
