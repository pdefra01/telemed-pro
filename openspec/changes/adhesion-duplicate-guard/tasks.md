# Tasks: Anti-Duplicate Guards in the Adhesion Form (DNI + CUIL)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550–750 (migration ~45, server.js ~100, server tests ~150-220, repo ~20, repo tests ~70-80, form ~60-90, form tests ~50-70, PRD.md ~20-40) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB migration) → PR 2 (backend endpoint + approve-adhesion + tests) → PR 3 (frontend repo/form + tests) → PR 4 (PRD.md doc) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | New columns + dedupe + 3 partial unique indexes | PR 1 | Additive/backward-compatible; safe alone |
| 2 | `POST /api/adhesion/check-duplicates` + `approve-adhesion` CUIL persistence + tests | PR 2 | Depends on PR 1 columns; endpoint unused until PR 3 wires it |
| 3 | `AdhesionRepository` + `AdhesionForm.tsx` + tests | PR 3 | Depends on PR 2's response contract |
| 4 | `PRD.md` update | PR 4 | Depends on 1-3 being final; trivial diff |

## Phase 1: Database Foundation

- [x] 1.1 Create `supabase/migrations/20260719030000_adhesion_dni_cuil_guards.sql`: add `profiles.cuil`, `family_members.cuil`, `adhesion_requests.titular_cuil` (all `TEXT`, nullable, `IF NOT EXISTS`).
- [x] 1.2 Same migration: dedupe CTE marking all but the latest pending row per normalized `titular_dni` AND per normalized `titular_cuil` as `rejected`, before the indexes.
- [x] 1.3 Same migration: create `uq_adhesion_pending_titular_dni` and `uq_adhesion_pending_titular_cuil` partial unique indexes (regexp_replace-normalized, `WHERE status='pending'`; cuil index also `WHERE titular_cuil IS NOT NULL`).
- [x] 1.4 Same migration: create `uq_profiles_cuil` partial unique index (normalized, `WHERE cuil IS NOT NULL`).
- [x] 1.5 Apply locally (`npx supabase migration up --local`) and confirm clean apply.

## Phase 2: Backend — Duplicate-Check Endpoint (TDD)

- [x] 2.1 RED: write integration tests covering DNI-only match, CUIL-only match, family_members match, pending match, rejected-reapply allowed, concurrent-insert 23505 propagation.
- [x] 2.2 GREEN: add shared `normalize(value)` helper in `server.js` (digits-only), reused by endpoint and `approve-adhesion`.
- [x] 2.3 GREEN: implement `POST /api/adhesion/check-duplicates` in `server.js` (`supabaseAdmin`-backed) — 3 `.or()` queries per design; return 200 `{ok:true}` or 409 `{ok:false, conflicts:[]}` with `identifier`/`reason`/`message`.
- [x] 2.4 REFACTOR: extract the conflict-message builder (affiliate/family_member/pending_request × dni/cuil) into a pure, testable function.
- [x] 2.5 Verify Phase 2 tests pass.

## Phase 3: Backend — Approve-Adhesion CUIL Persistence

- [x] 3.1 RED: extend tests asserting `/api/approve-adhesion` writes `cuil` into the `profiles.update()` call and into each `family_members` insert row.
- [x] 3.2 GREEN: add `cuil: request.titular_cuil?.trim() || null` to the `profiles.update()` (~line 608).
- [x] 3.3 GREEN: add `cuil: member.cuil ? String(member.cuil).trim() : null` to the `insertMembers` mapping (~line 667).
- [x] 3.4 Verify Phase 3 tests pass.

## Phase 4: Frontend — Repository & Form

- [x] 4.1 RED: extend `src/repositories/__tests__/AdhesionRepository.test.ts` asserting `submitApplication()` calls the check endpoint pre-insert, throws the returned message on 409, and includes `titular_cuil` + family `cuil` in the insert payload.
- [x] 4.2 GREEN: in `AdhesionRepository.submitApplication()`, add the pre-insert call to `/api/adhesion/check-duplicates`; throw on `!ok`; add `titular_cuil` to the existing hand-built insert and `cuil` to each family jsonb entry — no restructuring.
- [x] 4.3 GREEN: add `titularCuil` to `AdhesionForm.tsx` titular state + Step 1 CUIL input, validating `NN-DDDDDDDD-C` like the existing DNI check.
- [x] 4.4 GREEN: add `cuil` to `newFamilyMember` state + Step 3 mini-form, included in `addFamilyMember()`'s `mappedMember`.
- [x] 4.5 GREEN: wire `handleSubmit()` to surface the 409 conflict message via existing `toast()`, identifying person + identifier.
- [x] 4.6 Add/extend an `AdhesionForm` test covering the CUIL input and the duplicate-rejection toast path.
- [x] 4.7 Verify Phase 4 tests pass; run full `npm test`.

## Phase 5: Documentation

- [x] 5.1 Update root `PRD.md`: document the CUIL identifier, the DNI-OR-CUIL duplicate-prevention flow (app-layer + DB backstop), and the new endpoint contract.
