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

- [ ] 2.1 RED: create `src/repositories/__tests__/DoctorShiftRepository.test.ts` (new file — none exists today) mocking `supabase`; cover: `getActiveShift()` returns `null` + fires abandon-UPDATE when `clock_in` > 8h old; returns shift unchanged when within 8h; `autoCloseOldShifts()` marks >8h-old open rows `abandoned`/`duration_minutes=NULL` and <8h-old rows `completed` as today.
- [ ] 2.2 GREEN: add `const MAX_SHIFT_HOURS = 8;` to `DoctorShiftRepository.ts`.
- [ ] 2.3 GREEN: extend `getActiveShift()` — after fetch, if `now - clock_in > MAX_SHIFT_HOURS`, UPDATE row to `status='abandoned'`, `clock_out=now`, `duration_minutes=NULL`, return `null`.
- [ ] 2.4 GREEN: extend `autoCloseOldShifts()` (lines 156-176) to classify by age: rows older than 8h → `abandoned`/`duration_minutes=NULL`; rows within 8h → existing `completed`/computed-duration path.
- [ ] 2.5 Delete `getAllDoctorShifts()` (lines 133-154) — zero callers confirmed by grep in this session.
- [ ] 2.6 Verify Phase 2 tests pass; run `npm test -- DoctorShiftRepository`.

## Phase 3: Best-Effort Clock-Out on Tab Close

- [ ] 3.1 RED: extend `src/pages/doctor/__tests__/DoctorDashboard.test.tsx` asserting a `pagehide`/`visibilitychange`(hidden) listener fires a `keepalive` `fetch` PATCH to the shift's REST endpoint only when `activeShift` is set.
- [ ] 3.2 GREEN: in `DoctorDashboard.tsx`, add a `useEffect` (deps: `activeShift`) registering `visibilitychange`+`pagehide` listeners; on fire, `fetch` Supabase REST PATCH with `apikey`+`Authorization: Bearer <session token>` headers and `keepalive: true` (NOT `sendBeacon` — cannot set auth headers per design.md §4).
- [ ] 3.3 Verify Phase 3 tests pass; confirm no listener leak (cleanup on unmount/dep change).

## Phase 4: Verification & Cleanup

- [ ] 4.1 Confirm `DashboardRepository.getAdminAnalytics()` — verified in code: `workMinutes` sums `shift.duration_minutes || 0` (already null-safe for `abandoned` rows) and `avgSessionTime` derives solely from `appointments`, never `doctor_work_shifts` — no code change needed; note this in the PR description.
- [ ] 4.2 Confirm office-write UI (`src/pages/admin/OCCSettings.tsx`) is behind `ProtectedRoute allowedRoles={['admin']}` (verified in `src/App.tsx`) — no change needed.
- [ ] 4.3 Grep `src/` for `getAllDoctorShifts` post-deletion; confirm zero references remain.
- [ ] 4.4 Run full `npm test`.
