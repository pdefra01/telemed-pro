# Apply Progress: affiliate-credential-provisioning

Batch 2 (this session) completed all remaining work from the reconstructed
Batch 1 checkpoint (Phase 3 remainder, Phase 4, Phase 5). Phase 6 remains an
explicit manual/staging checklist, out of `sdd-apply` scope per `tasks.md`.

## Done (verified passing) — cumulative across both batches

- **Phase 1 — `server/affiliateActivation.js`**: `buildPatientAuthUser`,
  `buildActivationUrl`, `buildActivationEmail`, `sendActivationEmail` — all
  implemented per design Interfaces/Contracts, no `password` key ever in the
  createUser payload. Tests: `server/__tests__/affiliateActivation.test.js` — passing.
- **Phase 1 — `server.js` integration**: `createUser` literal replaced with
  `buildPatientAuthUser(request)`; activation email step added AFTER the
  MercadoPago back-fill block (D3), try/catch non-blocking; `PUBLIC_APP_URL`
  startup warning added; `requireAuth, requireAdmin` added to
  `/api/approve-adhesion` (D7). Tests: `server/__tests__/approveAdhesionAuth.test.js` — passing.
- **Phase 2 — `src/repositories/AdhesionRepository.ts`**: `approveApplication`
  now fetches the session and sends `Authorization: Bearer` header, mirroring
  `resetPasswordFromAdmin` (D7 client side). Tests updated in
  `src/repositories/__tests__/AdhesionRepository.test.ts` — passing.
- **Phase 3 — `src/utils/patientIdentifier.ts`**: `isEmailLike`,
  `toLegacyPatientEmail` extracted per design. Tests:
  `src/utils/__tests__/patientIdentifier.test.ts` — passing.
- **Phase 3 — `src/repositories/AuthRepository.ts`**: `login()`'s
  "Invalid login credentials" branch now throws an `Error` with
  `.code = 'invalid_credentials'`. Tests updated in
  `src/repositories/__tests__/AuthRepository.test.ts` — passing.
- **Phase 3 — `src/pages/Auth.tsx` (GREEN, this batch)**: patient LOGIN path
  (`role === 'patient' && !isRegistering`) now resolves exactly ONE auth email
  via `patientIdentifier.isEmailLike`/`toLegacyPatientEmail`, calls
  `authRepository.login` exactly once (no retry), and on
  `err.code === 'invalid_credentials'` for a legacy-mapped (non-email) input
  shows an explicit "use your email" message; any other error (including the
  inactive-account message, which carries no `.code`) is shown as-is. Login
  identifier label switches to `'Correo Electrónico'` for the patient LOGIN
  view only; patient registration keeps `'Celular N°'` and its untouched
  branching/`registerPatient` call. Doctor/admin/advisor paths untouched.
  Tests: `src/pages/__tests__/Auth.login.test.tsx` (4/4 passing).
  **Deviation/fix required to reach GREEN (see Issues Found below)**: added
  `id="auth-identifier"` / `id="auth-password"` to the two `Input`s in this
  form (previously no `id`/`name`, so the rendered `<label>` had no
  `htmlFor`/associated control — `getByLabelText` could not find them, a
  pre-existing accessibility gap now fixed as a side effect) and narrowed the
  identifier field's inline error condition to exclude the patient-login path
  (`!(role === 'patient' && !isRegistering)`) so the shared generic error
  banner and the per-field inline error do not both render the same message
  text (would otherwise trip `getByText`'s multiple-match error on any
  patient-login failure, including the pre-existing inactive-account path).
- **Phase 4 — `src/pages/SetPassword.tsx` (new, this batch)**: state machine
  `verifying` (on-mount `verifyOtp({type:'recovery', token_hash})`) ->
  `ready` | `invalid` (missing/expired/used token — admin-reset message, no
  self-service resend); `ready` -> `submitting` -> `success` (`updateUser`
  then `signOut()` then `navigate('/login')`) | `error` (retryable, form
  stays visible with the error message). Password rule: min 6 chars +
  confirmation match, mirroring `Auth.tsx`. Tests:
  `src/pages/__tests__/SetPassword.test.tsx` (7/7 passing).
- **Phase 4 — `src/App.tsx` routing (this batch)**: imported `SetPassword`;
  added `<Route path="/activar" element={<SetPassword />} />` alongside the
  existing `/adhesion`/`/encuesta` routes (before the `*` catch-all); added
  `isActivarPath` to the `isPublicPath` union so `/activar` renders outside
  `Layout`/`AdminLayout`, matching the existing pattern exactly; added the
  matching pathname->hash redirect (`/activar` -> `/#/activar` + preserved
  querystring) beside the existing `/adhesion`/`/encuesta` redirects.
  **Not done**: task 4.5 (a dedicated `App.tsx`-level test asserting
  `/activar` renders outside `Layout`/`AdminLayout`) — no `App.tsx` test file
  exists anywhere in the repo today; the pre-existing `/adhesion` and
  `/encuesta` routes using the identical `isPublicPath` pattern are also
  untested at the App-shell level. `/activar`'s risk here is therefore
  identical to (not worse than) already-shipped, already-untested routes.
  Creating new App-shell test infrastructure was outside the explicit
  remaining-work scope handed to this batch; flagged for an explicit
  orchestrator/user decision rather than silently added or silently dropped.
- **Phase 5 — `src/pages/AdhesionForm.tsx` step-6 copy fix (this batch)**:
  replaced the false "tu DNI ... como usuario y contraseña temporal" claim
  with "Te enviaremos un correo con un enlace para crear tu contraseña y
  acceder a la App de MEDINEX." — matches the actual Phase 1 flow (activation
  email, not DNI-as-password). Test assertion added/updated in
  `src/pages/__tests__/AdhesionForm.test.tsx` confirming the false claim is
  absent and the new copy is present (7/7 passing in that file).

## Explicitly Skipped (per tasks.md — not part of `sdd-apply`)

- Phase 6 (manual/staging integration checklist — approve a real adhesion in
  staging, confirm email delivery, `/activar` end-to-end, login works,
  `PUBLIC_APP_URL` set in prod, `generateLink(type:'recovery')` smoke test
  vs. `magiclink` contingency). Leave as a follow-up for the user/ops —
  cannot be automated from this environment.

## Deferred / needs explicit decision

- Task 4.5 (`App.tsx`-level route test for `/activar`) — see rationale above.
  Recommend either (a) accept as-is since risk matches existing untested
  `/adhesion`/`/encuesta` routes, or (b) open a small follow-up to add the
  first `App.tsx` test file covering all three public routes at once (larger
  scope than this single task warrants).

## TDD Cycle Evidence (this batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.5/3.6 | `src/pages/__tests__/Auth.login.test.tsx` | Component (RTL) | ✅ Pre-existing RED (4/4 failing, confirmed at batch start) | ✅ Already written (prior batch) | ✅ 4/4 passing | ✅ 4 cases (email, legacy-DNI, legacy-failure message, inactive-account no-retry) | ✅ Extracted `isPatientLogin` branch cleanly, no duplication with registration path |
| 4.1-4.4 | `src/pages/__tests__/SetPassword.test.tsx` | Component (RTL) | N/A (new file) | ✅ Written first — confirmed failing with `Cannot resolve import "../SetPassword"` before implementation existed | ✅ 7/7 passing | ✅ 7 cases (verifying->ready, missing token, expired token, short password, mismatched confirm, success->redirect, updateUser error->retryable) | ➖ Single pass sufficed, code already minimal |
| 5.1/5.2 | `src/pages/__tests__/AdhesionForm.test.tsx` | Component (RTL) | ✅ 6/6 passing before new test added | ✅ Written first — confirmed failing (old false-claim text still present) | ✅ 7/7 passing after copy fix | ➖ Single scenario (pure copy, no branching) — skipped per "purely structural, one possible output" rule | ➖ None needed |

### Test Summary (this batch)
- **Total tests written this batch**: 8 (1 new in `Auth.login.test.tsx` scope — actually 0 new, 4 pre-existing RED made GREEN; 7 new in `SetPassword.test.tsx`; 1 new in `AdhesionForm.test.tsx`)
- **Total tests passing this batch's touched files**: 4 (Auth.login) + 7 (SetPassword) + 7 (AdhesionForm, full file) = 18
- **Layers used**: Component/RTL (3 files), 0 new unit-only files this batch
- **Pure functions created this batch**: 0 (patientIdentifier.ts was prior batch); SetPassword/Auth remain component-level per design

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command / result | `npx vitest run src/pages/__tests__/Auth.login.test.tsx src/pages/__tests__/SetPassword.test.tsx src/pages/__tests__/AdhesionForm.test.tsx` → 3 files, 18 tests, all passing |
| Runtime harness | N/A for Auth.tsx/AdhesionForm.tsx (pure client-side logic/copy, no server boundary in this batch). SetPassword.tsx's real runtime boundary (Supabase `verifyOtp`/`updateUser` against a live project, real activation email) is Phase 6's manual staging checklist — explicitly out of `sdd-apply` scope per `tasks.md`, not automatable here. |
| Rollback boundary | `src/pages/Auth.tsx` diff is self-contained (revert to restore old label/branching); `src/pages/SetPassword.tsx` is a new file (delete + revert the 3 `App.tsx` hunks to fully roll back); `src/pages/AdhesionForm.tsx` is a single-line copy revert. None share state or DB schema. |

## Full suite verification (this batch, after all changes)

`npx vitest run` → **339 passed, 13 failed, 352 total** across 44 files (6 files
failing). The 13 failures are **exactly** the known pre-existing baseline,
confirmed by file+test-name match against the Batch-1 checkpoint list:

- `src/repositories/__tests__/DashboardRepository.test.ts` > `getMetrics` > `should fetch total doctors, patients and appointments` (1)
- `src/utils/__tests__/crypto.test.ts` > `should fail verification if prescription data is tampered with` (1)
- `src/pages/patient/__tests__/MedicalHistory.test.tsx` (2)
- `src/pages/patient/__tests__/Payments.test.tsx` > receipt download disabled (1)
- `src/pages/patient/__tests__/Profile.test.tsx` (2)
- `src/pages/__tests__/VideoRoom.test.tsx` (6 — `ReferenceError: user is not defined` at `VideoRoom.tsx:252`, from an unrelated commit already on `master` before this change, per `git log`)

No test file touched or created by this change (`Auth.login.test.tsx`,
`SetPassword.test.tsx`, `AdhesionForm.test.tsx`, `patientIdentifier.test.ts`,
`AuthRepository.test.ts`, `AdhesionRepository.test.ts`,
`affiliateActivation.test.js`, `approveAdhesionAuth.test.js`) appears in the
failing list. No new failures introduced.

`npx tsc --noEmit` shows only pre-existing, unrelated errors in
`src/pages/patient/PatientDashboard.tsx` (4) and `src/pages/VideoRoom.tsx` (2,
same `user` bug as the test failures above) — zero new type errors from any
file this change touched.

## Delivery note

User explicitly accepted **`size:exception`** — single PR, no chained split,
despite the review-budget forecast (~650-800 lines, high risk). Do not split
into multiple PRs. Do not ask again about chaining.

## Files changed this batch

| File | Action | What Was Done |
|------|--------|----------------|
| `src/pages/Auth.tsx` | Modified | D6 patient-login sequence, label switch, `id` attributes added to identifier/password inputs, error-display de-duplication for the patient-login path |
| `src/pages/SetPassword.tsx` | Created | `/activar` page, full D2/D5 state machine |
| `src/pages/__tests__/SetPassword.test.tsx` | Created | 7 tests covering the full state machine |
| `src/App.tsx` | Modified | Import + route + `isPublicPath` + pathname redirect for `/activar` |
| `src/pages/AdhesionForm.tsx` | Modified | Step-6 copy fix (single line) |
| `src/pages/__tests__/AdhesionForm.test.tsx` | Modified | New test asserting absence of the false DNI-as-password claim and presence of the new copy |
| `openspec/changes/affiliate-credential-provisioning/tasks.md` | Modified | All Phase 1-5 tasks marked `[x]`; task 4.5 left `[ ]` with rationale |

## Status

All `sdd-apply`-scoped tasks (Phases 1-5) are complete. Phase 6 is an explicit
manual/staging checklist, out of scope. Task 4.5 is the one open item —
flagged above for an explicit decision, not silently resolved either way.
Ready for `sdd-verify`.
