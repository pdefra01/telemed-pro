# Verify Report: doctor-shift-hardening

**Verdict: PASS WITH WARNINGS**

## Scope Verified

Three stacked branches, all committed locally, working tree clean:
1. `feat/doctor-shift-hardening-1-migration` (e7f0b9b) — RLS migration
2. `feat/doctor-shift-hardening-2-repo-logic` (703cb68) — 8h abandoned-shift logic + `getAllDoctorShifts()` removal
3. `feat/doctor-shift-hardening-3-tabclose` (5cc71e1, checked out) — best-effort tab-close clock-out + Phase 4 verification

None of the 3 branches are pushed/merged to remote yet (process note, not a code defect — matches the confirmed `stacked-to-main` delivery strategy from tasks.md).

## Completeness — Tasks (20/20)

All 20 tasks across 4 phases are marked `[x]` in `tasks.md` AND independently re-verified against actual code/test output (not trusted from checkmarks alone):

| Phase | Tasks | Status |
|---|---|---|
| 1 — Migration (RLS + backfill) | 7/7 | Verified: migration file exists, correct SQL, applied locally AND on staging (confirmed via `supabase migration list --linked` — `20260719070000` present in both `local` and `remote` columns) |
| 2 — Abandoned-shift logic (TDD) | 6/6 | Verified: `MAX_SHIFT_HOURS=8`, stale-guard in `getActiveShift()`, age-branch in `autoCloseOldShifts()`, `getAllDoctorShifts()` deleted, 4 new tests genuinely exercise the logic |
| 3 — Tab-close best-effort | 3/3 | Verified: `useEffect` listener + REST PATCH implementation matches description; 4 new tests genuinely exercise fetch-firing/non-firing behavior |
| 4 — Verification & cleanup | 4/4 | Re-verified independently: `getAdminAnalytics()` null-safe + KPI derivation confirmed by direct code read; `OCCSettings` admin-gated confirmed; `getAllDoctorShifts` grep = 0 matches; full-suite baseline re-confirmed (see below) |

No unchecked or partially-done tasks found.

## Spec Compliance Matrix

| Requirement | Implementation | Test Evidence | Status |
|---|---|---|---|
| Owner-scoped INSERT/SELECT/UPDATE on `doctor_work_shifts` (`doctor_id = auth.uid()`) | Migration `20260719070000...sql` lines 26-39 | RLS script assertions 1-6 (own-row SELECT/UPDATE/INSERT ok; cross-doctor SELECT/UPDATE/INSERT rejected) — 11/11 passed | PASS |
| Admin full SELECT on `doctor_work_shifts` via `is_admin()` | Migration lines 42-45; `DashboardRepository.getAdminAnalytics()` unchanged, confirmed compatible | RLS script assertion 7 (`is_admin()` resolves true, admin sees both doctors' rows) | PASS |
| `office_locations` write restricted to admin | Migration lines 58-61 | RLS script assertions 8 (non-admin rejected), 10 (admin succeeds) | PASS |
| `office_locations` SELECT open to authenticated | Migration lines 53-55 | RLS script assertion 9 | PASS |
| Orphaned-shift mitigation (8h threshold) | `DoctorShiftRepository.getActiveShift()`/`autoCloseOldShifts()` (deterministic) + `DoctorDashboard.tsx` pagehide/visibilitychange listener (best-effort) | `DoctorShiftRepository.test.ts` 4/4; `DoctorDashboard.test.tsx` new describe block 4/4 | PASS |
| `clockOut()` has no geofence check | Read `DoctorShiftRepository.ts:112-149` directly — no IP/office lookup present | N/A (absence-of-behavior, confirmed by code read) | PASS |
| `getAllDoctorShifts()` removed, no dangling refs | Method absent from `DoctorShiftRepository.ts`; grep across src/ for getAllDoctorShifts returns 0 matches | N/A | PASS |

## RLS SQL Correctness (direct spot-check)

- Migration ordering: backfill `UPDATE ... WHERE status='active' AND clock_in < now() - interval '8 hours'` (lines 10-19) runs before the `DROP POLICY`/`CREATE POLICY` statements (lines 21+). Correct — stale rows are reclassified under the old permissive policy before RLS tightens, avoiding any window where the backfill itself could be blocked.
- OR-semantics of permissive policies: none of the 6 new `CREATE POLICY` statements specify `AS RESTRICTIVE`, so all are default-permissive. Per Postgres RLS semantics, multiple permissive policies for the same command on the same table combine via OR. Concretely: for SELECT on `doctor_work_shifts`, "Doctors read own shifts" (`doctor_id = auth.uid()`) and "Admins manage all shifts" (FOR ALL, `is_admin()`, which also covers SELECT) are evaluated together and OR'd — an admin sees all rows, a non-admin doctor sees only their own, and neither policy set can accidentally AND-restrict the other. Confirmed correct, matches design.md's compatibility-check table, and empirically confirmed by RLS script assertion 7 (admin sees both doctors' rows) and assertions 1/3 (doctor isolation holds independently).
- No RESTRICTIVE policies exist anywhere in this migration, so there is no risk of an unintended AND-combination silently narrowing access.

## Best-Effort Tab-Close — Documented as Non-Guaranteed

Confirmed at three levels, consistent with "accepted limitation, not a defect":
- Code comment (DoctorDashboard.tsx:158-161): "Best-effort clock-out on tab close/hide. Not the correctness guarantee — the 8h abandoned-shift fallback in DoctorShiftRepository is the deterministic backstop. sendBeacon is NOT used here because it cannot set the apikey/Authorization headers Supabase REST + RLS require." Failures are silently absorbed via `.catch()`.
- design.md section 4: explicitly rejects sendBeacon-only and pure-cron approaches, labels the pagehide/visibilitychange hook "a cheap optimization, explicitly not relied upon," and documents the residual accepted risk (tab closed + dashboard never reopened + never re-clocked-in = orphan persists until one of those happens).
- spec.md Requirement "Mitigacion de turnos huerfanos": explicitly states the requirement describes an observable criterion, not a mandated mechanism, and leaves the choice of best-effort vs. server sweep vs. both to design.

## Test Execution (run directly, not trusted from prior claims)

RLS verification script — `node scratch/test_doctor_shift_rls.mjs`:
```
Resultado: 11 passed, 0 failed.
```
Matches expected 11/11 exactly.

Targeted vitest — `npx vitest run src/repositories/__tests__/DoctorShiftRepository.test.ts src/pages/doctor/__tests__/DoctorDashboard.test.tsx`:
```
Test Files  2 passed (2)
     Tests  11 passed (11)
```
(4 DoctorShiftRepository + 7 DoctorDashboard, including the 4 new tab-close tests.)

Full suite — `npm test -- --run`, run 3 times:

| Run | Result | Failing files |
|---|---|---|
| 1 | 7 failed / 71 passed | VideoRoom.test.tsx (x3), AppointmentRepository.test.ts (x1), crypto.test.ts (x1), Profile.test.tsx (x2) |
| 2 | 8 failed / 70 passed | Same as above + MedicalHistory.test.tsx (x1) |
| 3 | 7 failed / 71 passed | Same as run 1 |

All failures in all 3 runs are confined exactly to the previously-documented rotating baseline set (VideoRoom, AppointmentRepository, crypto, MedicalHistory, Profile). Zero failures in DoctorDashboard.test.tsx or DoctorShiftRepository.test.ts across all 3 full-suite runs.

DoctorDashboard.test.tsx flake claim — isolated `npx vitest run` 3 additional times: 7/7 passed every time, no flake. Combined with the 3 clean full-suite runs above and the orchestrator's own prior observations (3x clean isolation + 1x clean full-suite before a single flake was seen), this is now 6 additional clean runs with zero reproductions. The characterization holds: the previously-seen pagehide flake was a rare test-parallelism timing artifact under full-suite load, not a reproducible defect in the implementation. Not blocking, but worth a WARNING for future monitoring.

## Issues

### CRITICAL
None found.

### WARNING
1. Pre-existing unhandled-rejection noise, not introduced by this change: every render of DoctorDashboard in DoctorDashboard.test.tsx triggers `TypeError: dashboardRepository.getDoctorKPIs is not a function`, because the file's DashboardRepository mock (lines 35-39) only stubs `getDoctorQueue`, never `getDoctorKPIs`. Confirmed via `git diff master...feat/doctor-shift-hardening-3-tabclose -- src/pages/doctor/__tests__/DoctorDashboard.test.tsx`: this mock block is untouched by any of the 3 PRs in this change — it already existed on master before this work started, and affects the pre-existing "Consultation History" describe block too, not just the new tab-close tests. This is pre-existing test debt, out of scope for doctor-shift-hardening, and does not fail any assertions (Vitest treats it as a background unhandled-rejection warning, not a test failure). Recommend a small follow-up ticket to add a `getDoctorKPIs` stub to the mock.
2. Rare full-suite-parallel flake, not reproduced: the orchestrator previously observed the new pagehide test fail once under full-suite parallel execution. 3 additional full-suite runs (this verification) plus 3 additional isolated runs all passed cleanly. Treat as a timing-sensitive test artifact (fetch/timer/microtask race under parallel worker load), not a code defect. Worth keeping an eye on in CI, not blocking.
3. Delivery not yet pushed: all 3 branches are stacked locally only, not pushed to remote or opened as PRs. Confirmed intentional (tasks.md: "stacked-to-main" confirmed, "Decision needed before apply: No"). Orchestrator should proceed to push/PR creation per the confirmed delivery strategy.

### SUGGESTION
- When convenient, fix the DashboardRepository mock gap in DoctorDashboard.test.tsx (see WARNING 1) to eliminate console noise in every future test run touching this file.

## Final Verdict

PASS WITH WARNINGS — every spec requirement is implemented and test-verified with real runtime evidence (RLS script + vitest, run directly by this verification, not trusted from prior claims), all 20 tasks are genuinely complete, the migration SQL is correct (ordering and OR-semantics both verified), and the best-effort tab-close mechanism is properly documented as a non-guaranteed, accepted limitation at both the code and spec/design level. The 3 warnings are pre-existing test debt, a non-reproducing rare flake, and a pending delivery step — none block correctness or require rework of this change's implementation.
