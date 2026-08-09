# Affiliate Credential Provisioning Specification

## Purpose

Defines how an approved affiliate obtains, sets, and uses login credentials, replacing the current plaintext-DNI password with an email-based activation flow, and how the login form resolves identifiers without treating DNI as a secret.

## Requirements

### Requirement: No Plaintext-DNI Password On Approval

`/api/approve-adhesion` MUST NOT set a real, usable password derived from the applicant's DNI when creating the Supabase Auth user. The created user MUST be recoverable via `generateLink({ type: 'recovery' })`, not via any password field.

#### Scenario: Admin approves a pending adhesion request

- GIVEN a pending adhesion request with `titular_dni`
- WHEN an admin approves it
- THEN a Supabase Auth user is created with `email_confirm: true` and no password equal to (or derived from) the DNI
- AND calling `generateLink({ type: 'recovery' })` for that user returns a valid action link

#### Scenario: Downstream approval logic is unaffected

- GIVEN the password field is removed from `createUser`
- WHEN approval completes
- THEN profile creation and MercadoPago link back-fill logic execute exactly as before

### Requirement: Best-Effort Activation Email (Non-Blocking)

After a successful approval, the system SHOULD send an activation email via the existing SMTP transporter containing a real `redirectTo` recovery action link. Email delivery failure MUST NOT block or fail the approval response.

#### Scenario: SMTP succeeds

- GIVEN approval created the Auth user successfully
- WHEN the recovery link is generated
- THEN an activation email is sent through `createMailTransporter()` with the link as `redirectTo`
- AND the approval endpoint returns 200

#### Scenario: SMTP is down

- GIVEN approval created the Auth user successfully
- WHEN sending the activation email throws
- THEN the error is caught and logged (mirroring `notifyPaymentSettled`)
- AND the approval endpoint still returns 200
- AND the MercadoPago link back-fill still runs

### Requirement: Self-Service Password Activation via `/activar`

The system MUST provide a public `/activar` route that accepts the Supabase recovery-link callback and lets the user set their own password via `supabase.auth.updateUser({ password })`.

#### Scenario: Valid, unexpired activation link

- GIVEN an affiliate opens their unexpired activation link at `/activar`
- WHEN they submit a new password
- THEN `supabase.auth.updateUser({ password })` succeeds
- AND they are redirected to the login page

#### Scenario: Expired or invalid activation link

- GIVEN an affiliate opens an expired or tampered activation link
- WHEN `/activar` attempts to resolve the recovery session
- THEN a clear error message is shown instructing them to contact support/admin for a manual reset
- AND no password update is attempted

### Requirement: Accurate Credential Messaging in Adhesion Form

`AdhesionForm.tsx` step 6 MUST NOT claim the applicant's DNI will be their username and password. It MUST state that credentials arrive by email after approval.

#### Scenario: Applicant reaches step 6

- GIVEN an applicant completes the adhesion form through step 6
- WHEN the final step renders
- THEN it displays a message stating credentials will be emailed after approval
- AND no DNI-as-password claim appears anywhere in the form

### Requirement: Bounded Identifier Resolution in Login

`Auth.tsx` MUST treat email as the primary patient identifier. If the entered identifier contains no `@`, the system MUST retry exactly once against the legacy `${dni}@medinex-paciente.com` domain before failing with an explicit error. No server-side DNI-to-email lookup endpoint MUST be introduced.

#### Scenario: Adhesion-approved affiliate logs in with email

- GIVEN an affiliate has set their own password via `/activar`
- WHEN they log in with their real email and new password
- THEN authentication succeeds

#### Scenario: Legacy self-registered patient logs in with DNI

- GIVEN a patient self-registered via `AuthRepository.registerPatient` at `${dni}@medinex-paciente.com`
- WHEN they enter their DNI (no `@`) as the identifier
- THEN the system retries login against the legacy synthetic-domain address
- AND authentication succeeds

#### Scenario: Adhesion-approved affiliate mistakenly types DNI instead of email

- GIVEN an approved affiliate's account is not registered at the legacy synthetic domain
- WHEN they enter their DNI (no `@`) as the identifier
- THEN the legacy-domain retry fails
- AND a clear error message tells them to use their email address

### Requirement: Authenticated, Admin-Only Adhesion Approval

`/api/approve-adhesion` MUST require an authenticated admin session, matching the `requireAuth, requireAdmin` convention already used by `/api/reset-user-password` and `/api/update-user-email`. Since this endpoint now also triggers Auth user creation and an activation email, an unauthenticated caller MUST NOT be able to invoke it.

#### Scenario: Unauthenticated request is rejected

- GIVEN no valid session Bearer token is sent
- WHEN a request hits `/api/approve-adhesion`
- THEN the request is rejected with 401 before any Supabase Auth or MercadoPago logic runs

#### Scenario: Non-admin authenticated user is rejected

- GIVEN a valid session for a non-admin role (e.g. patient or doctor)
- WHEN that user calls `/api/approve-adhesion`
- THEN the request is rejected with 403

#### Scenario: Admin approves normally

- GIVEN an authenticated admin session
- WHEN they approve a pending adhesion request from `src/pages/admin/Affiliates.tsx`
- THEN the client sends the session Bearer token
- AND approval proceeds exactly as specified in the other requirements of this document

## Out of Scope

The following are explicitly excluded from this specification (deferred follow-ups per confirmed proposal decisions):

- Rotating credentials of already-approved affiliates who currently hold DNI-derived passwords.
- `ResetPasswordModal`'s "Usar DNI como clave" shortcut.
- Self-service "resend activation" for expired links (admin manual reset via `ResetPasswordModal` is the accepted interim path).
