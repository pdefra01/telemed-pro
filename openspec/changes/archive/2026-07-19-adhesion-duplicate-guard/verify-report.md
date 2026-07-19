# Verification Report: Anti-Duplicate Guards in the Adhesion Form (DNI + CUIL)

**Status: PASS WITH WARNINGS** (0 CRITICAL -- both prior CRITICAL findings confirmed fixed and re-verified live; 3 WARNING items carried forward unresolved; 2 SUGGESTION items carried forward, 1 resolved)

**Change**: adhesion-duplicate-guard
**Scope reviewed**: cumulative diff of all 4 stacked branches (migration, backend, frontend, PRD.md), currently checked out at `feat/adhesion-dni-cuil-guards-4-prd` (`e091923`), including fixup commit `b39f28b` on top of `feat/adhesion-dni-cuil-guards-3-frontend`
**Mode**: Strict TDD (enabled)
**Re-verification**: this report supersedes the prior `FAIL` verdict (same file, same Engram topic `sdd/adhesion-duplicate-guard/verify-report`). Re-ran all live tests myself in this session; did not trust the orchestrator's fix summary at face value.

---

## 0. What Changed Since the FAIL Verdict

1. **C-1 fixed** -- commit `b39f28b` (`fix(adhesion): identify the specific person in conflict messages`) on `src/repositories/AdhesionRepository.ts`. `submitApplication()`'s conflict-message join now prefixes each message with `Titular: ` or `Familiar <name>: ` before joining, using `conflict.person`/`conflict.name` that the endpoint already returned but the repository previously discarded. `src/repositories/__tests__/AdhesionRepository.test.ts` updated in the same commit (2 tests rewritten to assert the person-identifying prefix; RED confirmed before the fix per the diff, GREEN after).
2. **C-2 fixed** -- `scratch/test_approve_adhesion_cuil.mjs` cleanup block hardened (gitignored, untracked file, not part of any commit). Now deletes `auth.users` by email, `adhesion_requests` by `titular_dni`, `family_members` by `cuil`, nulls out the circular `profiles.family_group_id` <-> `family_groups.primary_affiliate_id` FK pair, deletes `family_groups`, then `profiles` -- in correct dependency order. This resolves the non-idempotency the prior verify pass hit (stale `profiles.cuil` row colliding with `uq_profiles_cuil` on rerun).

Both fixes verified directly below, not assumed.

---

## 1. Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 21 |
| Tasks complete (checked in tasks.md, verified against code) | 21 |
| Tasks incomplete | 0 |

No change from the prior pass. All 21 tasks across Phases 1-5 remain checked in `openspec/changes/adhesion-duplicate-guard/tasks.md` with corresponding code. No unchecked tasks.

---

## 2. Build & Tests Execution (all run live in this session)

### 2.1 Targeted vitest run

Result: **2 test files passed, 8 tests passed (8/8)**. Includes the two rewritten tests asserting `Titular: ...` and `Familiar Maria Perez: ...` prefixes.

### 2.2 `npx vitest run` (full suite), run three times for stability

Runs 2 and 3 produced identical named failures, matching the documented 7-failure master baseline exactly.

### 2.3 `scratch/test_adhesion_check_duplicates.mjs` (Phase 2 integration test)

Result: **19 passed, 0 failed.**

### 2.4 `scratch/test_approve_adhesion_cuil.mjs` (Phase 3 integration test) -- run TWICE consecutively

Run 1: **4 passed, 0 failed.**
Run 2 (immediately after, no manual cleanup in between): **4 passed, 0 failed.**

---

## 3. Spec Compliance Matrix (updated)

Compliance summary: 8/16 cleanly COMPLIANT with a directly covering runtime test (up from 7/16), 3 PARTIAL, 1 disputed, 4 UNTESTED-per-strict-grading (all correct by code inspection, no dedicated test). The one genuine functional gap from the prior pass (person-identification in the rejection message) is now COMPLIANT.

---

## 4. Correctness (Static + Runtime Evidence) -- re-checked, nothing regressed

All implementation requirements confirmed correct. Key confirmation: `git diff master..feat/adhesion-dni-cuil-guards-4-prd --stat` shows the only files touched anywhere in the 5-commit stack are PRD.md, the openspec design/proposal/tasks/spec docs, server.js, src/pages/AdhesionForm.tsx plus its test, src/repositories/AdhesionRepository.ts plus its test, and the migration SQL. The fix commit (b39f28b) only touched AdhesionRepository.ts and its test -- server.js and the migration have had zero changes since the prior verify pass's deep-dive.

---

## 5. Migration SQL Deep-Dive

No changes to the migration since the prior pass. The NULL-handling fix and all three partial unique indexes are correct.

---

## 6. Coherence (Design vs Implementation vs Spec)

All design decisions implemented correctly and followed. The person-identification in rejection messages extends design-specified per-identifier templates without abandoning them.

---

## 7. Issues Found (re-verified)

### CRITICAL

None. Both prior CRITICAL findings are closed:

- C-1 -- RESOLVED. Verified via direct source read and passing test assertions.
- C-2 -- RESOLVED. Verified by running tests twice consecutively with no manual cleanup in between.

### WARNING (carried forward, unresolved)

- W-1 -- Migration's dedupe step still in tension with "Datos preexistentes no se tocan" scenario. Unaddressed; recommend explicit product ratification.
- W-2 -- Normalization scenarios lack dedicated covering test. Implementation correct by code inspection.
- W-3 -- family-vs-affiliate and family-vs-pending scenarios not independently tested.

### SUGGESTION

- S-1 -- Scenario 1 doesn't assert absence of CUIL conflict.
- S-2 -- CUIL format validated as "11 digits" not strict NN-DDDDDDDD-C. Reasonable documented deviation.
- S-3 -- RESOLVED as a side effect of C-2 fix.

---

## 8. Verdict

PASS WITH WARNINGS. Both CRITICAL findings from the prior verify pass are confirmed fixed by direct source inspection and live re-execution (not just trusted from the orchestrator's summary):
- C-1: AdhesionRepository.ts's conflict-message join now identifies the specific person (titular or named family member).
- C-2: test_approve_adhesion_cuil.mjs is now idempotent; passed twice in a row with no manual intervention between runs.

3 WARNING and 2 SUGGESTION items remain open -- none of these were in scope of the requested fix, none are blocking, and none regressed. Recommended next step: sdd-archive.
