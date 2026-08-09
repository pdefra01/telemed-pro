# Tasks: Affiliate Credential Provisioning

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-800 (14 files: 5 new + 9 modified, each with new/modified tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 2 -> PR 3 -> PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | New `server/affiliateActivation.js` module + tests; `server.js` wiring (builder swap, email step, `PUBLIC_APP_URL` warning, D7 auth middleware) | PR 1 | `npm run test -- server/__tests__/affiliateActivation.test.js` | Manual: approve adhesion in staging, confirm 200 + email received | Revert `server.js` diff + delete `server/affiliateActivation.js`; no schema/state change |
| 2 | `AdhesionRepository.ts` Bearer-token fix (D7 client side, depends on PR 1's server middleware) | PR 1 (same, or PR 1b if split) | `npm run test -- src/repositories/__tests__/AdhesionRepository` | Manual: admin approves from `Affiliates.tsx`, confirm 200 (not 401/403) | Revert single method change in `AdhesionRepository.ts` |
| 3 | `src/utils/patientIdentifier.ts` extraction + tests; `AuthRepository.ts` `invalid_credentials` code + test; `Auth.tsx` login-sequence rewrite (D6) + test | PR 2 | `npm run test -- src/utils/__tests__/patientIdentifier.test.ts src/repositories/__tests__/AuthRepository.test.ts src/pages/__tests__/Auth.login.test.tsx` | Manual: log in with email, with legacy DNI, with wrong DNI | Revert `Auth.tsx` + `AuthRepository.ts` + delete `patientIdentifier.ts`; independent of PR 1 |
| 4 | `SetPassword.tsx` new page + `App.tsx` route wiring + tests | PR 3 | `npm run test -- src/pages/__tests__/SetPassword.test.tsx` | Manual: open `/#/activar?token_hash=...` from a real activation email (needs PR 1 merged for email to exist, but page works standalone with any valid token) | Revert `App.tsx` route/isPublicPath addition + delete `SetPassword.tsx` |
| 5 | `AdhesionForm.tsx` step-6 copy fix + test | PR 4 | `npm run test -- src/pages/__tests__/AdhesionForm.test.tsx` | N/A — pure copy change, no external state to exercise | Revert single-line copy change in `AdhesionForm.tsx` |

**Chain strategy decision needed from user**: stacked-to-main (fast, independent slices — recommended here since units 1-4 touch disjoint files with only PR1->PR2's `requireAuth` middleware as a soft dependency) vs feature-branch-chain (safer rollback, coordinated release). Orchestrator must ask before `sdd-apply`.

## Phase 1: Server Activation Module (PR 1)

- [x] 1.1 RED: `server/__tests__/affiliateActivation.test.js` — `buildPatientAuthUser(request)` returns no `password` key, keeps `email_confirm: true`, metadata, `${dni}@medinex-paciente.com` fallback.
- [x] 1.2 GREEN: implement `buildPatientAuthUser` in `server/affiliateActivation.js`.
- [x] 1.3 RED: `buildActivationUrl(baseUrl, tokenHash)` — trailing-slash trim, `?token_hash=` encoding.
- [x] 1.4 GREEN: implement `buildActivationUrl`.
- [x] 1.5 RED: `buildActivationEmail({fullName, activationUrl})` — contains URL, subject, no DNI/password claim.
- [x] 1.6 GREEN: implement `buildActivationEmail`.
- [x] 1.7 RED: `sendActivationEmail` — happy path returns `{sent:true}`; `generateLink` error, `sendMail` reject, empty `PUBLIC_APP_URL` all return `{sent:false, reason}` and never throw (injected stubs, mirrors `notifyPaymentSettled`).
- [x] 1.8 GREEN: implement `sendActivationEmail` in `server/affiliateActivation.js`.
- [x] 1.9 Modify `server.js`: import module, swap `createUser` literal (1316-1330) for `buildPatientAuthUser(request)`, read `payload.email` in place of `targetEmail`.
- [x] 1.10 Modify `server.js`: insert `sendActivationEmail(...)` call between MP block (1489-1528) and `res.status(200)`, own try/catch, non-blocking.
- [x] 1.11 Modify `server.js`: add startup `console.warn` when `PUBLIC_APP_URL` is empty (mirrors `mercadoPagoEnabled` warning at 161-163).
- [x] 1.12 Modify `server.js`: add `requireAuth, requireAdmin` to `/api/approve-adhesion` route (D7).
- [x] 1.13 RED: route-level test — `/api/approve-adhesion` returns 401 with no Bearer token, 403 for non-admin session, 200 for authenticated admin (light Express harness or route-level assertion).
- [x] 1.14 GREEN: confirm middleware wiring from 1.12 satisfies 1.13 (should already pass if middleware order is correct).

## Phase 2: Client-Side Auth Fix (PR 1, depends on Phase 1)

- [x] 2.1 Modify `src/repositories/AdhesionRepository.ts`: `approveApplication` fetches session and sends `Authorization: Bearer ${session?.access_token || ''}`, mirroring `resetPasswordFromAdmin` (AuthRepository.ts:147-162).
- [x] 2.2 RED/GREEN: `src/repositories/__tests__/AdhesionRepository` (create or extend existing test file) — asserts Bearer header is sent on `approveApplication` call.

## Phase 3: Identifier Utils + Login Rewrite (PR 2, independent of Phase 1/2)

- [x] 3.1 RED: `src/utils/__tests__/patientIdentifier.test.ts` — `isEmailLike` true/false cases; `toLegacyPatientEmail` (DNI <=8 chars, phone >8 digits-only-stripped).
- [x] 3.2 GREEN: create `src/utils/patientIdentifier.ts`, extract `isEmailLike`/`toLegacyPatientEmail` verbatim from `Auth.tsx:82-97`.
- [x] 3.3 RED: `src/repositories/__tests__/AuthRepository.test.ts` — invalid-credentials error carries `code = 'invalid_credentials'`; inactive-account error (`is_active === false`) does NOT carry that code.
- [x] 3.4 GREEN: modify `src/repositories/AuthRepository.ts` — attach `code = 'invalid_credentials'` only to the credentials-error branch (line ~54), leave inactive-account branch (~95) untouched.
- [x] 3.5 RED: `src/pages/__tests__/Auth.login.test.tsx` — email input triggers exactly 1 login call; DNI input triggers exactly 1 legacy-mapped call (no premature attempt with raw DNI as email); legacy retry failure shows explicit "use your email" message; inactive-account error shows its own message with zero retries.
- [x] 3.6 GREEN: rewrite login sequence in `src/pages/Auth.tsx` per D6 using `patientIdentifier.ts` helpers; update patient field copy `Celular N°` -> `Correo Electrónico` + legacy hint. Registration path untouched.

## Phase 4: SetPassword Page + Routing (PR 3, independent of Phase 1-3)

- [x] 4.1 RED: `src/pages/__tests__/SetPassword.test.tsx` — `verifying` state calls `verifyOtp({type:'recovery', token_hash})` on mount; success -> `ready`; expired/invalid/absent token -> `invalid` (shows admin-reset instruction, no `updateUser` call attempted).
- [x] 4.2 RED (same file): `ready` -> submit -> `submitting` -> `success` calls `updateUser({password})` then `signOut()` then redirects to `/login`; `updateUser` failure -> `error` state, retryable.
- [x] 4.3 GREEN: create `src/pages/SetPassword.tsx` implementing the state machine (`verifying`/`ready`/`invalid`/`submitting`/`success`/`error`), password rule min 6 chars + confirmation (matches `Auth.tsx:71`).
- [x] 4.4 Modify `src/App.tsx`: import `SetPassword`, add `<Route path="/activar">` before the `*` catch-all (476); add `/activar` to `isPublicPath` (252-254); add pathname->hash redirect beside 244-249.
- [ ] 4.5 RED/GREEN: extend `App.tsx` test coverage (or add if none exists) confirming `/activar` renders outside `Layout`/`AdminLayout`. **Not done** — no `App.tsx` test file exists anywhere in the repo (same as the pre-existing `/adhesion`/`/encuesta` routes, which are also untested at the App-shell level); adding one would be new test infrastructure outside this batch's explicit scope. `/activar` follows the byte-identical `isPublicPath` pattern already used for `/adhesion`/`/encuesta`, so its risk profile matches existing untested routes exactly. Flagging for orchestrator decision rather than silently closing.

## Phase 5: AdhesionForm Copy Fix (PR 4, independent, smallest unit)

- [x] 5.1 RED: `src/pages/__tests__/AdhesionForm.test.tsx` — step-6 assertion updated to expect "credentials arrive by email after approval" copy and assert absence of any DNI-as-password claim.
- [x] 5.2 GREEN: modify `src/pages/AdhesionForm.tsx` step 6, list item 3 (line ~1437) — text only, no logic change.

## Phase 6: Manual/Integration Verification (post-merge, all PRs)

- [ ] 6.1 Staging checklist: approve a real adhesion -> 200 returned, MP link back-filled, activation email received, `/activar` sets password, login works end-to-end (server.js handler has no exports and is not unit-testable; this is the accepted integration gate per design).
- [ ] 6.2 Confirm `PUBLIC_APP_URL` is set in production before deploy (D1 rollout precondition).
- [ ] 6.3 Smoke-test `generateLink({type:'recovery'})` against the live project for a password-less user; fallback to `type:'magiclink'` if refused (D2 contingency, open question in design).
