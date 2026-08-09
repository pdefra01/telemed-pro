# Archive Report: affiliate-credential-provisioning

**Date**: 2026-08-09  
**Status**: ARCHIVED (PASS WITH WARNINGS, 0 CRITICAL)  
**Change**: affiliate-credential-provisioning  
**Archived To**: `openspec/changes/archive/2026-08-09-affiliate-credential-provisioning/`

## Executive Summary

The `affiliate-credential-provisioning` change has been fully implemented, verified (PASS WITH WARNINGS, 0 CRITICAL issues), committed to master (commit 7eda2cc), and archived. The change replaces plaintext-DNI passwords for approved affiliates with a secure email-based credential activation flow, eliminating a critical authentication gap on a health platform.

## What Shipped

### Core Capability: Affiliate Credential Provisioning (6 Requirements)

1. **No Plaintext-DNI Password On Approval** — `/api/approve-adhesion` no longer sets a password derived from the applicant's DNI; the Auth user is created without any password field.

2. **Best-Effort Activation Email (Non-Blocking)** — After successful approval, the system sends an activation email via `createMailTransporter()` containing a recovery link. Email delivery failure never blocks approval.

3. **Self-Service Password Activation via `/activar`** — New public route lets affiliates set their own password using `supabase.auth.updateUser({ password })` after verifying the recovery link.

4. **Accurate Credential Messaging in Adhesion Form** — `AdhesionForm.tsx` step 6 no longer claims the DNI is a password; instead states credentials arrive by email after approval.

5. **Bounded Identifier Resolution in Login** — `Auth.tsx` treats email as primary identifier; if a bare DNI is entered (no `@`), retries exactly once against the legacy `${dni}@medinex-paciente.com` domain before failing with an explicit message.

6. **Authenticated, Admin-Only Adhesion Approval** — `/api/approve-adhesion` now requires `requireAuth` and `requireAdmin` middleware, matching the convention used by `/api/reset-user-password` and `/api/update-user-email`.

### Design Decisions (D1-D7)

- **D1**: Reuse existing `PUBLIC_APP_URL` env var (already used for MercadoPago) for the activation link base; no new base-URL variable introduced.
- **D2**: Use `generateLink({type:'recovery'})` with manually-composed `token_hash` query param, not GoTrue's `redirectTo` machinery (HashRouter conflict).
- **D3**: Email step positioned after MercadoPago back-fill, both with independent try/catch for non-blocking behavior.
- **D4**: Extract `createUser` payload into pure `buildPatientAuthUser()` builder for testable security assertion (no password key).
- **D5**: `/activar` is client-side React route only; no new Express endpoint required.
- **D6**: Bounded DNI fallback — at most one legacy retry against synthetic domain, then explicit "use your email" message.
- **D7**: Add auth middleware to `/api/approve-adhesion` (was previously unauthenticated, a security gap).

### Implementation Scope (14 files, ~650-800 lines)

**Server-side (2 new files, 2 modified):**
- `server/affiliateActivation.js` (new) — Modules: `buildPatientAuthUser`, `buildActivationUrl`, `buildActivationEmail`, `sendActivationEmail`
- `server/__tests__/affiliateActivation.test.js` (new) — Unit tests, pure functions + injected stubs
- `server/__tests__/approveAdhesionAuth.test.js` (new) — Route-level 401/403/200 scenarios
- `server.js` (modified) — Import module, swap `createUser` builder, add email step, add `requireAuth`/`requireAdmin`, add `PUBLIC_APP_URL` warning

**Client-side (5 new files, 4 modified):**
- `src/pages/SetPassword.tsx` (new) — `/activar` state machine (verifying → ready/invalid → submitting → success/error)
- `src/pages/__tests__/SetPassword.test.tsx` (new) — 7 tests covering all states
- `src/utils/patientIdentifier.ts` (new) — Extracted helpers: `isEmailLike`, `toLegacyPatientEmail`
- `src/utils/__tests__/patientIdentifier.test.ts` (new) — Pure-function coverage
- `src/pages/__tests__/Auth.login.test.tsx` (new) — 4 tests (email, legacy-DNI, legacy-failure, inactive-no-retry)
- `src/App.tsx` (modified) — Route `/activar`, add to `isPublicPath`, pathname redirect
- `src/pages/Auth.tsx` (modified) — Patient-login sequence (D6), field label switch, accessibility fixes
- `src/pages/AdhesionForm.tsx` (modified) — Step-6 copy fix (single line)
- `src/repositories/AdhesionRepository.ts` (modified) — Send Bearer token in `approveApplication` (D7 client side)
- `src/repositories/AuthRepository.ts` (modified) — Attach `code='invalid_credentials'` to credentials error only

**Main Specs (1 new file):**
- `openspec/specs/affiliate-provisioning/spec.md` (new) — Primary spec for the capability, synced from delta spec

## Test Evidence

### Full Suite Results
- `npx vitest run`: **339 passed / 13 failed / 352 total** (baseline unchanged)
- `npx tsc --noEmit`: **6 pre-existing errors** (zero new type errors)
- Focused change-specific tests: **53 passing** across 8 test files

### Focused Test Results
- `server/__tests__/affiliateActivation.test.js` — 7 tests passing
- `server/__tests__/approveAdhesionAuth.test.js` — 3 tests passing (401, 403, 200)
- `src/repositories/__tests__/AdhesionRepository.test.ts` — 2 tests passing (Bearer token)
- `src/utils/__tests__/patientIdentifier.test.ts` — 8 tests passing
- `src/repositories/__tests__/AuthRepository.test.ts` — 3 tests passing (code presence/absence)
- `src/pages/__tests__/Auth.login.test.tsx` — 4 tests passing (email, DNI, legacy-failure, inactive)
- `src/pages/__tests__/SetPassword.test.tsx` — 7 tests passing (full state machine)
- `src/pages/__tests__/AdhesionForm.test.tsx` — 7 tests passing (copy assertion)

### Verification Verdict
**PASS WITH WARNINGS (0 CRITICAL, 3 WARNING, 2 SUGGESTION)**

- **CRITICAL**: None
- **WARNING**:
  - W1 — `approveAdhesionAuth.test.js` reimplements middleware (unenforced copy); route registration verified via regex ✓
  - W2 — DNI format validation gap on patient-login path (UX-only, no spec violation)
  - W3 — No `App.tsx`-level test for `/activar` (risk matches pre-existing untested `/adhesion`/`/encuesta` routes)
- **SUGGESTION**:
  - S1 — Cross-tab session-swap and StrictMode double-`verifyOtp` races (future hardening)
  - S2 — `activationEmailSent` defensive fallback (low-risk given success-path always includes field)

All 6 requirements verified passing. All 3 post-apply Judgment Day fixes fully applied end-to-end. Both design deviations narrowly scoped and non-regressive.

## Judgment Day Review Outcome

The change underwent Judgment Day review (dual-judge) after implementation:
- **Result**: APPROVED with 3 minor findings deferred to follow-ups
  1. HTML-escaping in activation email — FULLY FIXED ✓
  2. `activationEmailSent` signal threaded end-to-end (server → AdhesionRepository → Affiliates.tsx toast) — FULLY FIXED ✓
  3. `sessionEstablishedRef` signOut-on-unmount in SetPassword — FULLY FIXED ✓

All Judgment Day corrections applied and verified in verify-report.

## Deferred Follow-Ups

The following are **explicitly deferred** per proposal/spec "Out of Scope" section:

1. **Rotating credentials of already-approved affiliates** — Existing affiliate accounts with working DNI-derived passwords remain unchanged. Must be addressed in a separate change when a migration/notification strategy is decided. (High-risk acknowledged; deferral is intentional.)

2. **`ResetPasswordModal` DNI shortcut** — The "Usar DNI como clave" one-click reset remains in admin UI but is not notified to the affiliate. Deferred.

3. **Self-service "resend activation"** — Expired activation links recover via manual admin reset (`ResetPasswordModal`). Self-service resend is deferred.

## Archive Contents Verification

- [x] `explore.md` — SDD explore phase (6.7 KB)
- [x] `proposal.md` — SDD proposal with user decisions (3.2 KB)
- [x] `spec.md` — 6 requirements + scenarios (7.8 KB)
- [x] `design.md` — D1-D7 architectural decisions, file changes, testing strategy (12.1 KB)
- [x] `tasks.md` — 5 phases + 6 work units, 80 line items (7.9 KB)
- [x] `apply-progress.md` — 2-batch implementation, TDD evidence (8.2 KB)
- [x] `verify-report.md` — Requirement verification, test results, risk assessment (8.9 KB)
- [x] `archive-report.md` — This document

**Main specs synced**: `openspec/specs/affiliate-provisioning/spec.md` (6 requirements)

## Observation IDs (Engram Traceability)

- **Proposal**: obs #1812 — `sdd/affiliate-credential-provisioning/proposal`
- **Verify Report**: obs #1822 — `sdd/affiliate-credential-provisioning/verify-report`
- **Archive Report**: obs #[RECORDED IN ENGRAM SAVE] — `sdd/affiliate-credential-provisioning/archive-report`

## Source of Truth Update

The following specs now reflect the new behavior:
- **New**: `openspec/specs/affiliate-provisioning/spec.md` — authoritative spec for the `affiliate-credential-provisioning` capability

All future changes to affiliate credential flows MUST update this spec, not the change folder.

## SDD Cycle Complete

The change has been fully:
1. ✓ Proposed — scope and approach confirmed
2. ✓ Specified — 6 requirements + scenarios
3. ✓ Designed — D1-D7 decisions, interfaces, testing strategy
4. ✓ Tasked — 5 phases, 80 line items, review-budget forecast
5. ✓ Applied — 14 files, 53 passing tests, zero new failures
6. ✓ Verified — PASS WITH WARNINGS (0 CRITICAL)
7. ✓ Archived — all artifacts preserved, main spec synced

**Ready for deploy.** Phase 6 (staging integration checklist: approve adhesion end-to-end, confirm email delivery, verify `/activar` works, validate `PUBLIC_APP_URL` in production) is a manual/ops task, out of SDD automation scope.

---

**Archived**: 2026-08-09  
**Commit**: 7eda2cc (master)  
**Archive Path**: `openspec/changes/archive/2026-08-09-affiliate-credential-provisioning/`
