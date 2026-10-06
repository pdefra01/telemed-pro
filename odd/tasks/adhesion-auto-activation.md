# Feature: Activate adhesions automatically after email verification

## Objective
An affiliate who completes the public adhesion form must become active
(auth user, active profile, family group, activation email) automatically,
without waiting for an admin to press "Aprobar". Payment confirmation (MP or
manual transfer check) must NOT gate activation.

## Decisions (user-confirmed 2026-10-06)
- No dependency on manual admin approval.
- No dependency on payment confirmation; payment keeps reconciling later
  (webhook posts to ledger once the adhesion is approved — already works).
- Mandatory email verification (OTP) replaces the admin as the anti-abuse
  gate, enforced server-side (never trusting the browser's `email_verified`).

## Problem / evidence
- Activation only happens in `POST /api/approve-adhesion` (server.js ~1125-1385,
  requireAdmin), all inline, handler body untested.
- Rows are inserted anonymously from the browser (RLS `WITH CHECK (true)`),
  the browser supplies `email_verified`.
- `EMAIL_VERIFICATION_REQUIRED = false` hard-coded (server.js:40); client uses
  `VITE_EMAIL_VERIFICATION_REQUIRED`. `/api/email-verification/verify` only
  writes `contact_verifications.verified_at`. OTP uses `Math.random`.
- Status update has no `status='pending'` guard → concurrent approvals can
  double-create users. Approval does not re-run duplicate checks.

## Design
- Extract the approve body into a testable module
  `server/adhesionActivation.js` → `activateAdhesion(deps, adhesionId, { source })`
  returning `{ status, body }`. Admin endpoint and the new public endpoint
  both call it.
- Atomic claim before creating the auth user (conditional update guarded by
  `status='pending'`, e.g. an `activation_claimed_at` column) so concurrent
  triggers create at most one user; release the claim on failure so the admin
  fallback can retry.
- Record `activated_at` + `activation_source` ('auto' | 'admin').
- New public `POST /api/adhesion/:id/activate`: requires the row `pending`,
  a server-side verified OTP for the row's `titular_email`
  (`contact_verifications.verified_at`), re-runs duplicate checks
  (`server/adhesionChecks.js`) before activating.
- Email verification ON by default (server + client), OTP via `crypto.randomInt`.
- Form calls `/activate` right after a successful submit; activation failure is
  non-blocking for the payment step (row stays pending → admin fallback).
- Admin "Aprobar" stays as manual fallback for rows auto-activation could not
  complete; reject stays.

## Tasks
- [x] T1 Extract `activateAdhesion` module + atomic claim migration + tests; admin endpoint delegates (no behavior change besides the guard).
- [x] T2 Enforce email verification server-side (default ON, crypto OTP) + helper to check a verified email; tests.
- [x] T3 Public `POST /api/adhesion/:id/activate` (verified email + duplicate re-check + activateAdhesion) + tests.
- [x] T4 Form calls `/activate` after submit; success screen reflects activation; client verification default ON; tests.
- [ ] T5 Docs: MANUAL_DE_USUARIO / admin notes on the new flow.

## Route
- Delegated direct (writer trigger: 2+ non-trivial files; mapping done by explorer).

## Checks
- `npm test` (vitest) per task; `npx tsc --noEmit` for client tasks.

## Delivery
- Strategy: ask-on-risk → chain strategy `stacked-to-main` (user-chosen
  2026-10-06): one PR per task slice targeting master, merged in order.
  Slice 1 = T1 (f23a2ca + doc commits).

## Progress
- Branch `feat/adhesion-auto-activation` created.
- T1 done (route: delegated writer). `server/adhesionActivation.js` exports
  `activateAdhesion(deps, adhesionId, { source })` → `{ status, body }`; admin
  endpoint is a thin wrapper (`source: 'admin'`). Migration
  `20260924000000_adhesion_activation_claim.sql` adds `activation_claimed_at`,
  `activated_at`, `activation_source` (CHECK auto|admin) and extends
  `protect_adhesion_payment_fields` to blank them for anon/authenticated.
  Checks: `npm test` 807 passed / 5 failed (same 5 fail on base: VideoRoom x3,
  DashboardRepository x1, crypto x1); new `adhesionActivation.test.js` 16/16
  (RED observed first: module missing). `npx tsc --noEmit` exit 0. pgTAP file
  `supabase/tests/adhesion_activation_claim.sql` added, not run locally.
  Commit: f23a2ca.

- T1 review: assessed medium (`slice_budget_reached`), consent granted,
  native review approved + acknowledged (lineage review-989c967c3691a5ea,
  reviewed boundary = 50a3fa3). Advisory (non-blocking) follow-ups:
  approve-update result unverified (adhesionActivation.js:262-274); claim
  never released once an auth user exists (351-358) → row stuck at 409, needs
  an admin recovery path; deleteUser result unchecked (214-221); pgTAP file
  not executed.

- T2 done (route: delegated writer). New `server/emailVerification.js`:
  `normalizeEmail`, `isEmailVerificationRequired(env)` (ON unless
  `EMAIL_VERIFICATION_REQUIRED=false`), `generateOtpCode` (`crypto.randomInt`),
  `isEmailVerified(supabaseAdmin, email, { now, maxAgeMs })` (verified email
  challenge whose `verified_at` is within 24h; throws on DB error). Freshness is
  measured from `verified_at`, not the OTP `expires_at`, so shortening the OTP
  window later does not expire a just-verified email mid-form. server.js reads
  the env var and uses the helpers in the OTP endpoints; env var documented in
  COOLIFY_DEPLOYMENT.md (no `.env.example` exists). Checks: RED observed
  (module missing); `emailVerification.test.js` 16/16; `npm test` 823 passed /
  5 failed (known base failures); `npx tsc --noEmit` exit 0.
  BLOCKER found (outside T2 surface): RLS on `contact_verifications`
  (migration 20260718001000) lets anon INSERT with `WITH CHECK (true)` (can
  insert a row with `verified_at` already set) and SELECT unverified rows
  including `otp_code`. Server-side verification is bypassable with the anon
  key until a migration drops the anon policies/grants (the OTP endpoints use
  the service role; `ContactVerificationRepository.ts` is the only client user,
  via `ContactValidationModal`).

- T3 done (route: delegated writer). `server/adhesionAutoActivation.js`
  `autoActivateAdhesion(deps, id)`; public route `POST /api/adhesion/:id/activate`
  in server.js. `adhesionChecks.js` refactored (no behavior change) to export
  `buildPeople`, `matchIdentityConflicts`, `findRegisteredIdentityConflicts`
  (profiles + family_members only, so the pending row never matches itself;
  titular and the row's family members are checked). Contract:
  200 `{activated:true,message,activationEmailSent}` (user id not exposed) |
  200 `{alreadyActive:true,message}` | 202 `{processing:true,message}` (claim
  held elsewhere; do not retry) | 400 invalid UUID / not pending / activation
  precondition (incl. browser `email_verified` false when verification is on) |
  403 email not verified server-side | 404 | 409 `{ok:false,error,conflicts}` |
  500 | 503. No rate limiter exists in the codebase: per-IP limit is a
  follow-up (TODO at the route). Checks: RED observed (module missing);
  `adhesionAutoActivation.test.js` 21/21, `adhesionChecks.test.js` 16/16;
  `npm test` 846 passed / 5 failed (known base failures); `npx tsc --noEmit`
  exit 0.

- T2 blocker fixed (route: delegated writer). Migration
  `20260925000000_lock_down_contact_verifications.sql` drops the three
  "Public ..." policies, `REVOKE ALL ... FROM anon`, and recreates the
  authenticated own-row policies with INSERT `WITH CHECK (user_id = auth.uid()
  AND verified_at IS NULL AND attempts = 0)` and UPDATE `WITH CHECK (user_id =
  auth.uid())`. No browser code touches the table for the guest flow (only
  `ContactVerificationRepository.ts` via `ContactValidationModal`, logged-in
  2FA; still compatible). pgTAP `supabase/tests/contact_verifications_rls.sql`
  added, not run locally (no Docker). Commit: 338c0ff.
  Residual risk: the profile 2FA flow is client-trusted (client reads
  `otp_code` and sets `verified_at` on its own row), and `isEmailVerified`
  does not filter `user_id IS NULL`, so a logged-in user can still mark an
  arbitrary email verified in their own row and pass the 403 gate. Fix: add
  `.is('user_id', null)` to `isEmailVerified` (server/emailVerification.js).

- T4 done (route: delegated writer). `AdhesionRepository.activateApplication(id)`
  → `POST /api/adhesion/:id/activate`, never throws, returns
  `ActivationResult` (`activated` | `already_active` | `processing` |
  `failed`). The form fires it once, after the Mercado Pago step succeeded
  (activation back-fills the MP subscription created by that step, so it must
  not run before it); the success screen says the account is active (password
  email, check spam) or keeps the pending-review wording. Client verification
  default ON (only `VITE_EMAIL_VERIFICATION_REQUIRED=false` disables it, read
  at render time). Checks: RED observed (24 new tests failing: method missing,
  copy absent, flag default off); focused 80/80; `npm test` 872 passed / 5
  failed (known base failures); `npx tsc --noEmit` exit 0. Commit:
  `feat(adhesion): activate the affiliate right after the form is submitted`
  (e05dccb).
- Residual gap closed (route: inline, one-line fix): `isEmailVerified` now
  filters `.is('user_id', null)` (guest OTP rows from `/send` never set
  user_id). RED observed (query assertion failing), then
  emailVerification + adhesionAutoActivation 37/37. Commit: 935aa4e.
- Slice 2 = branch `feat/adhesion-auto-activation-endpoint` (99803c1, 41fa783,
  338c0ff, e05dccb, 935aa4e), stacked on slice 1.
- Follow-ups (not in scope): no rate limit on public `/activate`; claim stuck
  after auth user exists needs an admin recovery path; pgTAP files not run.

## Next step
- Review slice 2, then T5 (docs).
