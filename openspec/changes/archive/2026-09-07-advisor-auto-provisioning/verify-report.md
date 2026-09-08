```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:41cb35eb208af213fe3be008aeb1ae4619a31ff13f1a4952302e1bf5b0cd8cf3
verdict: pass
blockers: 0
critical_findings: 0
requirements: 0/0
scenarios: 0/0
test_command: "npx vitest run server/__tests__/advisors.test.js server/__tests__/advisorStatus.test.js src/repositories/__tests__/ProducerRepository.test.ts src/repositories/__tests__/AdhesionRepository.test.ts src/pages/__tests__/AdhesionForm.test.tsx src/pages/admin/__tests__/ProducersAdmin.test.tsx"
test_exit_code: 0
test_output_hash: sha256:923bdbc38bda2c7b629557f619c307482219a948e2738075ddcfadcf6d9af61b
build_command: "npm run build"
build_exit_code: 0
build_output_hash: sha256:580a24507b27c7a03ec16eeb30be08e23479afb1125a413fd70a29cc07034d92
```

# Verify Report: advisor-auto-provisioning (base + amendment)

## Scope

This change has two layers, both verified here:

1. **Base feature** (Fase 1-2, tasks 1-5): automated advisor provisioning via `POST /api/create-advisor`. Already verified 2026-07-18 — see `verify/report.md` (100% pass on `scratch/test_advisor_provisioning_endpoints.mjs`, admin-authorized creation, non-admin rejection, duplicate-code rejection, OCC panel visual confirmation).
2. **Amendment** (Fase 3-7, tasks 6-24): advisor deactivation/reactivation + search, added and implemented in this session, verified below.

## Delivery note

The amendment was implemented as one working-tree pass, then split for review into 4 stacked PRs against `master` (not yet merged at verify time):

- PR1 [#29](https://github.com/pdefra01/telemed-pro/pull/29) `feat/advisor-mgmt-01-status-rpc`: RPC migration + `server/advisors.js` business logic + tests
- PR2 [#30](https://github.com/pdefra01/telemed-pro/pull/30) `feat/advisor-mgmt-02-backend-wiring`: `server.js` route wiring + `ProducerRepository`
- PR3 [#31](https://github.com/pdefra01/telemed-pro/pull/31) `feat/advisor-mgmt-03-referral-guard`: referral link guard
- PR4 [#32](https://github.com/pdefra01/telemed-pro/pull/32) `feat/advisor-mgmt-04-occ-ui`: OCC admin UI

`feat/advisor-mgmt-04-occ-ui` (HEAD at verify time) contains the full stacked diff, so verifying against it is equivalent to verifying the complete, integrated change.

## Automated test results

Two independent runs at verify time:

**1. Scoped to this change's own test files** (used for the `verdict` envelope above, since it isolates this change's own correctness from unrelated repo-wide debt):

```
npx vitest run server/__tests__/advisors.test.js server/__tests__/advisorStatus.test.js \
  src/repositories/__tests__/ProducerRepository.test.ts src/repositories/__tests__/AdhesionRepository.test.ts \
  src/pages/__tests__/AdhesionForm.test.tsx src/pages/admin/__tests__/ProducersAdmin.test.tsx

Test Files  6 passed (6)
     Tests  73 passed (73)
```

**2. Full repo suite** (`npm run test -- --run`), for baseline awareness:

```
Test Files  4 failed | 44 passed (48)
     Tests  7 failed | 403 passed (410)
```

The 7 failures (`VideoRoom.test.tsx` x3, `crypto.test.ts` x1, `DashboardRepository.test.ts` x1, `MedicalHistory.test.tsx` x2) are pre-existing and unrelated to this change — confirmed identical to baseline via `git stash` isolation during `sdd-apply`, and unrelated by file/domain (video rooms, crypto utils, dashboard, medical history — none touched by this change). They are a separate, pre-existing repo health issue, not a blocker for this change's verdict.

New test coverage added by this change: `server/__tests__/advisors.test.js`, `server/__tests__/advisorStatus.test.js`, `src/repositories/__tests__/ProducerRepository.test.ts`, plus additions to `src/pages/__tests__/AdhesionForm.test.tsx`, `src/repositories/__tests__/AdhesionRepository.test.ts`, and the new `src/pages/admin/__tests__/ProducersAdmin.test.tsx`.

**Note on the `requirements`/`scenarios` counts**: the native dispatcher's counters look for the canonical `### Requirement:` / `#### Scenario:` English headings; this spec file uses Spanish `### Requisito:` / `#### 🔑/🛡️/⚠️ Escenario N:` prose headers instead — a pre-existing project convention (see the base feature's Escenarios 1-3, written before this amendment and before the dispatcher's strict-format expectation existed in this project). The dispatcher counts 0 of either heading style even though both requirement areas ("Desactivación y Reactivación de Asesores", "Búsqueda Ampliada de Asesores") and all 18 numbered scenarios (1-18) are fully documented and cross-checked below — hence `requirements: 0/0` and `scenarios: 0/0` in the machine-readable envelope, with actual coverage tracked in the tables and narrative that follow.

## Spec cross-check (spec.md §2, Escenarios 4-18)

Verified by reading the actual implementation, not just trusting task checkboxes:

| Area | Spec requirement | Verified against |
|---|---|---|
| Deactivation atomicity | `PATCH /api/advisors/:id/status` toggles `profiles.is_active` + `producers.status` atomically (D1) | `supabase/migrations/20260907000000_set_advisor_status.sql` (`set_advisor_status` RPC, SECURITY DEFINER) |
| Self-deactivation blocked | Admin cannot deactivate own account (Esc.6) | `server/advisors.js:96-98` — `if (targetId === req.user.id) return 403` |
| Placeholder producers | Rows with no linked `profiles`/Auth account must not fail (Esc.7, D2) | `server/advisors.js` `mapAdvisorRow`/RPC: 0-row `profiles` update is valid, only missing `producers` row 404s |
| Non-admin rejected | 403 on both endpoints for non-admin (Esc. non-admin cases) | Routes wired behind `requireAuth`+admin check in `server.js` |
| Search fields | nombre, apellido, DNI (prefix), código, email; partial + accent-insensitive (Esc.11-14) | `server/advisors.js` `normalizeTerm`/`matchesAdvisor` |
| Search default scope | Active + inactive included by default, status visible (Esc.18) | `searchAdvisorsHandler` — no active-only filter by default; `mapAdvisorRow` includes `status`/`isActive` |
| Referral link rejection | Inactive advisor's `?promoter=CODE` stops accepting new adhesions, prior referrals untouched | `src/pages/AdhesionForm.tsx` mount-time check + pre-existing submit-time gate in `AdhesionRepository`, both test-covered |
| Commission freeze | Accrual stops going forward from deactivation; already-earned commissions not reversed (proposal §4.6) | `server.js:1655-1668` — `is_active` 403 guard added to `POST /api/advisor/increment-share`, independently confirmed present in this verify pass |
| OCC UI | Search box extended (not a new screen), debounced server-side search, confirmed deactivate/reactivate action with visible status badge | `src/pages/admin/ProducersAdmin.tsx` — client-side `filteredProducers` filter removed, replaced with debounced (300ms) call to `GET /api/advisors/search` |

No unimplemented requirement or unjustified spec/design deviation found. The one deviation flagged during `sdd-apply` (handler functions living in `server/advisors.js` rather than a literal 3-function split per design §3.8) is justified and consistent: `server.js` calls `app.listen()` unconditionally at import time and cannot be imported by Vitest, forcing all testable business logic into a separate module — the same pattern already established by `server/affiliateActivation.js` and `server/mercadopago.js`.

## Tasks

All 24 tasks in `tasks.md` (Fase 1-7) are checked off `[x]`. No pending work.

## Risks carried forward (not blockers)

1. `GET /api/advisors/search` scans a `LIMIT 500` window and joins in memory (design 3.3/D3) — fine at current advisor volume, will need a DB-side (`unaccent`/`pg_trgm`) rework if the commercial network grows materially past that.
2. The referral submit-gate lives in a client repository hitting the anon Supabase client; a crafted direct insert could still attribute to an inactive code. Hardening (DB trigger/RLS on `adhesion_requests`) is out of scope for this change.
3. Portfolio reassignment for a deactivated advisor's affiliates is explicitly out of scope (proposal §4.6) — orphaned-but-attributed is the accepted behavior.
4. PRs #29-#32 are open but not yet merged to `master` at verify time — verification was run against the fully-integrated branch (`feat/advisor-mgmt-04-occ-ui`), not against `master` post-merge. Re-run the suite after merge as a sanity check if any PR is rebased with conflicts.

## Verdict

**PASS.** Implementation matches proposal, spec, and design for both the base feature and the amendment. This change's own tests are 100% green (73/73); the full repo suite carries 7 pre-existing, unrelated failures tracked separately from this change. Ready for `sdd-archive` once PRs #29-#32 are merged.
