# Proposal: Affiliate Credential Provisioning

## Intent

Today an approved affiliate's password **is their plaintext DNI**, set silently at `server.js:1316-1330` (`createUser({ password: request.titular_dni })`). In Argentina a DNI is not a secret: it appears on receipts, forms, ID photocopies and the adhesion form itself. Anyone who has seen it and can guess the affiliate's email owns the account — this is effectively **no authentication** on a health platform holding clinical data.

Worse, nobody tells the affiliate anything: `/api/approve-adhesion` never uses the working SMTP transporter (`server.js:971-994`). The only credential message they get is `AdhesionForm.tsx:1437` ("your DNI is your username and password"), shown **before** approval, and pointing at a `Auth.tsx` DNI-login mode that cannot resolve any adhesion-approved account (email is mandatory, so the `${dni}@medinex-paciente.com` guess never matches).

Success: an approved affiliate receives an email, sets a password only they know, and logs in — with no DNI ever usable as a credential.

## Scope

### In Scope
- `/api/approve-adhesion`: drop `password` from `createUser` (keep `email_confirm: true`, metadata, and all downstream profile/MercadoPago logic untouched).
- Best-effort activation email after successful approval: `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', ... })` + existing `createMailTransporter()`, wrapped in try/catch exactly like `notifyPaymentSettled` — approval must still return 200 if SMTP fails.
- New public `/activar` route to accept the link and call `supabase.auth.updateUser({ password })` (none exists today).
- `AdhesionForm.tsx` step 6: replace the DNI-credentials claim with "we will email you when your application is approved".
- `Auth.tsx`: remove DNI as a first-class login mode; email becomes the patient identifier.

### Out of Scope (deferred follow-ups)
- `ResetPasswordModal` "Usar DNI como clave" shortcut and its missing reset notification.
- Self-service "forgot password" for patients (admin reset remains the interim path).
- Rotating credentials of already-approved affiliates (needs a separate migration decision).

## Capabilities

### New Capabilities
- `affiliate-credential-provisioning`: how an approved affiliate obtains, sets and uses their credentials.

### Modified Capabilities
- None (patient login is not currently specced).

## Approach

Exploration Approach 1 ("no DNI ever becomes a real password"), implemented with `generateLink` rather than `inviteUserByEmail`/`type:'invite'` for two grounded reasons: `invite` **creates** the user and would therefore conflict with the existing `createUser` call this endpoint depends on for `userId`, and `inviteUserByEmail` sends through Supabase's SMTP instead of the project's own proven transporter. `type:'recovery'` returns an action link for the just-created passwordless user and lets us send it ourselves.

**DNI-login decision (explicit):** removed as a UI mode, not deferred. A server-side DNI→email lookup was considered and rejected — DNI is not secret, so such an endpoint is an email-harvesting oracle. Legacy self-registered accounts (real users of `${dni}@medinex-paciente.com`, created by `AuthRepository.registerPatient`) are preserved by a bounded fallback: if the identifier has no `@`, retry once against the legacy domain, then fail with an explicit message. No new enumeration surface, no locked-out legacy users, no false promise.

Requires a new app-base-URL env var for `redirectTo` (no `SITE_URL`/`redirectTo` exists in the repo today).

## User Decisions (confirmed 2026-08-09)

- **Scope**: forward-flow only. Rotating credentials for already-approved affiliates stays a deferred follow-up, not part of this change.
- **DNI login**: bounded legacy fallback confirmed (retry once against `${dni}@medinex-paciente.com` when the identifier has no `@`, then fail explicitly) — not removed outright.
- **Expired activation link**: admin manual reset via the existing `ResetPasswordModal` is the accepted interim path. No self-service "resend activation" in this change.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server.js:1314-1335` | Modified | Remove plaintext-DNI password from `createUser` |
| `server.js:~1489-1528` | New | Best-effort activation email beside the MP back-fill |
| `src/pages/SetPassword.tsx` + `src/App.tsx` | New | Public `/activar` route |
| `src/pages/AdhesionForm.tsx:1419-1439` | Modified | Correct step-6 copy |
| `src/pages/Auth.tsx:18,35,78-97` | Modified | Remove DNI mode, bounded legacy fallback |
| `.env.example` | New | App base URL for `redirectTo` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SMTP down → affiliate never notified | Med | Non-blocking; log failure; admin sees status and can reset manually |
| Recovery link expires (~24h) before use | Med | Explicit expiry copy; admin reset is the interim recovery path |
| Regression in payment-adjacent approval handler | Low | Strict TDD; new tests written first (zero coverage exists on this endpoint) |
| Legacy synthetic-email patients lose login | Low | Bounded no-`@` retry against legacy domain |
| Existing affiliates keep DNI passwords | High | Acknowledged; rotation deferred, must be surfaced to the owner |

## Rollback Plan

Single revert: restore `password: request.titular_dni.trim()` in `createUser`, delete the email block and `/activar` route, restore step-6 copy and the `Auth.tsx` DNI toggle. No DB schema, no migration, no data written — rollback is code-only. Accounts created while the change was live keep no password and recover via admin reset.

## Dependencies

- `@supabase/supabase-js ^2.104.1` (already installed, supports `generateLink`).
- `SMTP_*` env vars configured in production (dev falls back to Ethereal).
- New app-base-URL env var deployed before release, or the link points nowhere.

## Success Criteria

- [ ] Approving an adhesion creates an Auth user with **no** password equal to the DNI.
- [ ] The affiliate receives an activation email and can set their own password at `/activar`.
- [ ] Approval still returns 200 and back-fills the MercadoPago link when SMTP fails.
- [ ] No UI anywhere claims the DNI is a password.
- [ ] Legacy `@medinex-paciente.com` patients can still log in.
