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
- [ ] T2 Enforce email verification server-side (default ON, crypto OTP) + helper to check a verified email; tests.
- [ ] T3 Public `POST /api/adhesion/:id/activate` (verified email + duplicate re-check + activateAdhesion) + tests.
- [ ] T4 Form calls `/activate` after submit; success screen reflects activation; client verification default ON; tests.
- [ ] T5 Docs: MANUAL_DE_USUARIO / admin notes on the new flow.

## Route
- Delegated direct (writer trigger: 2+ non-trivial files; mapping done by explorer).

## Checks
- `npm test` (vitest) per task; `npx tsc --noEmit` for client tasks.

## Delivery
- Strategy: ask-on-risk. Forecast ~600-800 authored lines → will ask chain strategy before exceeding ~400.

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

## Next step
- T2.
