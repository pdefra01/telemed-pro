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

```
npx vitest run src/repositories/__tests__/AdhesionRepository.test.ts src/pages/__tests__/AdhesionForm.test.tsx
```
Result: **2 test files passed, 8 tests passed (8/8)**. Includes the two rewritten tests asserting `Titular: ...` and `Familiar Maria Perez: ...` prefixes -- read the diff and the test source directly, not just trusted the pass/fail count.

### 2.2 `npx vitest run` (full suite), run three times for stability

Run 1 (transient extra failure): Test Files 5 failed / 18 passed (23) | Tests 8 failed / 62 passed (70)
Run 2: Test Files 4 failed / 19 passed (23) | Tests 7 failed / 63 passed (70)
Run 3 (extra confirmation): Test Files 4 failed / 19 passed (23) | Tests 7 failed / 63 passed (70)

Runs 2 and 3 produced identical named failures, matching the documented 7-failure master baseline exactly:
- VideoRoom.test.tsx: should show the notes panel only for doctor users
- VideoRoom.test.tsx: should call saveAppointmentNotes when the doctor clicks save
- VideoRoom.test.tsx: should save notes and complete appointment when clicking "Finalizar Consulta"
- crypto.test.ts: should fail verification if prescription data is tampered with
- AppointmentRepository.test.ts: should insert a new appointment into Supabase
- Profile.test.tsx: renders read-only and editable fields with initial user data
- Profile.test.tsx: calls updateAffiliate and updates active session on successful submission

Run 1's extra failure was the same transient `dashboardRepository.getDoctorKPIs is not a function` / undici WebSocket unhandled-rejection flake already documented in apply-progress as pre-existing test-environment flakiness unrelated to this change -- did not reproduce in runs 2 or 3. No new regressions.

### 2.3 `scratch/test_adhesion_check_duplicates.mjs` (Phase 2 integration test)

Result: **19 passed, 0 failed.** All 7 scenarios intact, including NULL-cuil-never-collides (scenario 6) and concurrent-insert 23505 propagation (scenario 7). Unchanged from prior verify pass -- confirms nothing regressed in the backend endpoint.

### 2.4 `scratch/test_approve_adhesion_cuil.mjs` (Phase 3 integration test) -- run TWICE consecutively to confirm the idempotency fix

Run 1: **4 passed, 0 failed.**
Run 2 (immediately after, no manual cleanup in between): **4 passed, 0 failed.**

This is the exact repro of the prior FAIL: rerunning the script back-to-back previously produced a 500 on `uq_profiles_cuil` because of a stale `profiles` row. With the hardened cleanup block (read in full, confirmed it nulls the circular FK and deletes in dependency order: `family_members` -> FK-null `profiles.family_group_id` -> `family_groups` -> `profiles`), both runs pass cleanly. C-2 is genuinely fixed, not just claimed.

### 2.5 Process hygiene

`tasklist` for `node.exe` checked before and after all test runs: same 5 PIDs both times (21788, 31708, 3584, 29148, 22780). No orphaned process created by this verification session.

`git status --short` after all runs: only the untracked `verify-report.md` itself; no stray files left by the scratch scripts.

---

## 3. Spec Compliance Matrix (updated)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| DNI/CUIL titular vs affiliate | DNI ya afiliado | check-duplicates scenario 1 | COMPLIANT |
| DNI/CUIL titular vs affiliate | CUIL ya afiliado | check-duplicates scenario 2 | COMPLIANT |
| DNI/CUIL titular vs family_members | DNI de titular = family_members.dni | not directly tested | PARTIAL -- unchanged, see W-3 |
| DNI/CUIL titular vs pending | DNI pendiente existente | check-duplicates scenario 4 | COMPLIANT |
| Reenvio tras rechazo | rejected no bloquea | check-duplicates scenario 5 | COMPLIANT |
| Familiar vs affiliate | DNI de familiar coincide con afiliado | no dedicated scenario | UNTESTED -- unchanged, see W-3 |
| Familiar vs family_members | DNI de familiar en otro grupo | check-duplicates scenario 3 | COMPLIANT |
| Familiar vs pending | CUIL de familiar = pending titular_cuil | no dedicated scenario | UNTESTED -- unchanged, see W-3 |
| DNI/CUIL independientes | Solo CUIL coincide, DNI nuevo | scenario 2 | COMPLIANT |
| DNI/CUIL independientes | Solo DNI coincide, CUIL nuevo | scenario 1 (asymmetric) | PARTIAL -- unchanged, see S-1 |
| Rechazo atomico completo | No se persiste nada si un identificador falla | AdhesionRepository.test.ts asserts insertMock never called on 409 | COMPLIANT |
| Rechazo atomico completo | Mensaje identifica a la persona y al identificador | AdhesionRepository.test.ts: two updated assertions for titular and named-family-member prefixes | COMPLIANT -- was FAILING (C-1), now fixed and covered by a passing test |
| Normalizacion DNI | DNI con puntos se normaliza | no test uses differently-formatted duplicate | UNTESTED (correct by inspection) -- unchanged, see W-2 |
| Normalizacion CUIL | CUIL con/sin guiones se normaliza | same gap | UNTESTED -- unchanged, see W-2 |
| Guardarrail DB / condicion de carrera | Doble insert concurrente propaga error de constraint | check-duplicates scenario 7 | COMPLIANT |
| Alcance limitado al envio | Datos preexistentes no se tocan | migration dedupe CTE | PARTIAL / disputed -- unchanged, see W-1 |

Compliance summary: 8/16 cleanly COMPLIANT with a directly covering runtime test (up from 7/16), 3 PARTIAL, 1 disputed, 4 UNTESTED-per-strict-grading (all correct by code inspection, no dedicated test). The one genuine functional gap from the prior pass (person-identification in the rejection message) is now COMPLIANT.

---

## 4. Correctness (Static + Runtime Evidence) -- re-checked, nothing regressed

| Requirement | Status | Notes |
|---|---|---|
| CUIL field collected for titular and each family member | Implemented | Unchanged -- AdhesionForm.tsx |
| POST /api/adhesion/check-duplicates -- 3 sources, DNI+CUIL, OR logic | Implemented | Unchanged -- server.js untouched since prior pass (confirmed via git diff master..HEAD --stat: only AdhesionRepository.ts/its test changed in the fix commit) |
| profiles.cuil / family_members.cuil persistence at approval | Implemented | Unchanged, re-confirmed live via test_approve_adhesion_cuil.mjs passing twice in a row |
| Independent DNI/CUIL evaluation (OR, not AND) | Implemented | Unchanged |
| Rejected-status resubmission allowed | Implemented | Unchanged |
| Atomic whole-request rejection (no partial persistence) | Implemented | Unchanged |
| Message identifies the specific person plus identifier | Implemented (fixed) | AdhesionRepository.ts now prefixes each joined conflict message with a Titular/Familiar-name label before throwing -- read the current file directly, confirmed present at lines ~60-69 |
| Normalization (digits-only) applied symmetrically | Implemented (by inspection) | Unchanged, still no dedicated cross-format test (W-2) |
| DB partial unique indexes (dni pending, cuil pending, profiles.cuil) | Implemented | Unchanged -- migration file untouched since prior pass |
| Dedupe CTE NULL-handling fix | Correct | Unchanged -- migration file untouched, re-confirmed by git diff showing zero changes to the SQL file across the whole stack since the prior deep-dive |
| No DB unique index on family_members.dni / .cuil | Confirmed, accepted design risk | Unchanged |
| No DB unique index on profiles.dni | Confirmed, accepted design risk | Unchanged |

Key confirmation: `git diff master..feat/adhesion-dni-cuil-guards-4-prd --stat` shows the only files touched anywhere in the 5-commit stack are PRD.md, the openspec design/proposal/tasks/spec docs, server.js, src/pages/AdhesionForm.tsx plus its test, src/repositories/AdhesionRepository.ts plus its test, and the migration SQL. The fix commit (b39f28b) only touched AdhesionRepository.ts and its test -- server.js and the migration have had zero changes since the prior verify pass's deep-dive, so those findings carry forward unchanged rather than needing re-derivation.

---

## 5. Migration SQL Deep-Dive -- unchanged, re-confirmed untouched

No changes to supabase/migrations/20260719030000_adhesion_dni_cuil_guards.sql since the prior pass (confirmed via git diff --stat above). The prior deep-dive tracing the NULL-handling fix stands: genuinely correct, not just present. Re-exercised indirectly via test_adhesion_check_duplicates.mjs scenario 6 passing again (19/19).

---

## 6. Coherence (Design vs Implementation vs Spec) -- unchanged except the message-template row

| Decision | Followed? | Notes |
|---|---|---|
| Check endpoint runs server-side via supabaseAdmin, before anon insert | Yes | Unchanged |
| Independent OR logic | Yes | Unchanged |
| profiles.cuil as the new affiliate-CUIL home | Yes | Unchanged |
| Design's literal .in() query snippet | Deviated (correctly) | Unchanged, server.js untouched |
| Design's message-per-identifier templates | Extended, not abandoned | The underlying per-identifier message text is unchanged in server.js; the fix adds a person-identifying prefix at the repository layer, resolving C-1 without touching design's endpoint-side message contract |
| Design's mention of re-validating DNI/CUIL at approval time | Not implemented | Unchanged, informational only per prior pass's analysis |
| Migration dedupes pre-existing PENDING duplicates before creating unique indexes | Tension with spec | Unchanged, see W-1 |

---

## 7. Strict TDD Compliance -- updated

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | Fix commit message documents "Found by sdd-verify", matching RED (prior verify) -> GREEN (fix commit) cycle |
| All tasks have tests | Yes | Unchanged |
| RED confirmed | Yes | Prior verify pass's C-1 finding is itself the RED evidence (existing tests passed against generic messages, new tests written expecting person-identifying prefixes) |
| GREEN confirmed (tests pass on live execution) | 4/4 | vitest targeted suite: 8/8 pass. test_adhesion_check_duplicates.mjs: 19/19 pass. test_approve_adhesion_cuil.mjs: 4/4 pass, run twice consecutively. Full suite: 7/7 pre-existing failures only, no new ones, stable across 2 of 3 runs. Up from 3/4 in the prior pass. |
| Triangulation adequate | Yes | Unchanged |
| Safety Net for modified files | Yes | Unchanged |

TDD Compliance: 6/6 checks passed (up from 5/6).

### Assertion Quality (re-read the diff directly)

The two rewritten AdhesionRepository.test.ts assertions are non-tautological: they assert the exact literal joined message strings for both the titular branch and the family-member-with-name branch of the new prefix logic, not just a substring match that could pass trivially.

---

## 8. Issues Found (re-verified)

### CRITICAL

None. Both prior CRITICAL findings are closed:

- C-1 -- RESOLVED. Verified via direct source read of src/repositories/AdhesionRepository.ts (current HEAD) and passing test assertions in src/repositories/__tests__/AdhesionRepository.test.ts (ran live, 8/8 pass, including the 2 rewritten person-identifying assertions).
- C-2 -- RESOLVED. Verified by running scratch/test_approve_adhesion_cuil.mjs twice consecutively in this session with no manual cleanup in between: 4/4 pass both times. Read the hardened cleanup block directly, confirmed correct FK-dependency ordering (family_members -> null the circular FK -> family_groups -> profiles).

### WARNING (carried forward, unresolved -- none of these were in scope of the orchestrator's fix)

- W-1 -- Migration's dedupe step still in literal tension with the "Datos preexistentes no se tocan" scenario. Unaddressed; still recommend explicit product ratification as an accepted exception before archive.
- W-2 -- Normalization scenarios (dotted DNI, dashed/undashed CUIL) still lack a dedicated covering test. Unaddressed; implementation still correct by code inspection.
- W-3 -- family-vs-affiliate and family-vs-pending scenarios still not independently tested. Unaddressed.

### SUGGESTION

- S-1 -- Scenario 1 (DNI-only match) still doesn't assert absence of a CUIL conflict. Unaddressed.
- S-2 -- CUIL format still validated as "11 digits" not strict NN-DDDDDDDD-C. Unaddressed, still a reasonable documented deviation.
- S-3 -- RESOLVED as a side effect of the C-2 fix. The suggestion to harden test_approve_adhesion_cuil.mjs's cleanup to match its sibling script's broader pattern was effectively implemented (with additional FK-layer handling beyond what S-3 anticipated, since the circular profiles.family_group_id <-> family_groups.primary_affiliate_id FK pair was discovered during the fix).

---

## 9. Verdict

PASS WITH WARNINGS. Both CRITICAL findings from the prior verify pass are confirmed fixed by direct source inspection and live re-execution (not just trusted from the orchestrator's summary):
- C-1: AdhesionRepository.ts's conflict-message join now identifies the specific person (titular or named family member); covered by 2 passing tests with non-tautological literal-string assertions.
- C-2: test_approve_adhesion_cuil.mjs is now idempotent; passed twice in a row with no manual intervention between runs, confirming the FK-dependency-ordered cleanup fix holds.

Everything previously verified as correct (DB migration incl. the NULL-handling fix, duplicate-check endpoint's OR logic, CUIL persistence, normalization) remains untouched and unregressed -- confirmed via git diff --stat showing the fix commit touched only AdhesionRepository.ts and its test, plus 3 consecutive full-suite runs showing only the same 7 pre-existing master-baseline failures with no new ones. Process hygiene confirmed clean (same 5 node.exe PIDs before and after).

3 WARNING and 2 SUGGESTION items remain open (W-1, W-2, W-3, S-1, S-2) -- none of these were in scope of the requested fix, none are blocking, and none regressed. Recommend the orchestrator/product either accept them as-is or schedule a small follow-up before sdd-archive if stricter test coverage of the normalization and family-symmetric scenarios (W-2/W-3) or explicit ratification of the pending-request dedupe exception (W-1) is desired. None of these block archiving on their own.

Recommended next step: sdd-archive.
