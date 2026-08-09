# Design: Affiliate Credential Provisioning

## Technical Approach

Boundary map: `UI (SetPassword/Auth) -> Repository (AuthRepository) -> Supabase` for the client half, and `Express route (server.js) -> capability module (server/affiliateActivation.js) -> Supabase Admin / SMTP` for the server half. The change adds **one** new server module and **one** new page; `server.js` keeps only routing/orchestration, exactly as it already does for `server/mercadopago.js` (server.js:145-151 states this convention explicitly).

The activation link is **not** delivered through GoTrue's `redirect_to` machinery. It is built by us from `generateLink(...).properties.hashed_token` and consumed by `supabase.auth.verifyOtp({ type: 'recovery', token_hash })` on `/activar`. See Decision D2 — this is forced by the app being a `HashRouter` (src/App.tsx:2).

## Architecture Decisions

### D1 — Base URL env var: reuse `PUBLIC_APP_URL`, do not invent one

**Choice**: reuse the existing `PUBLIC_APP_URL` (server.js:155, used for MP `back_url`s at 325/419-421/473, documented in `docs/prd-mercadopago-debito-automatico.md:44`).
**Rejected**: `APP_BASE_URL` / `SITE_URL` (proposal assumed none existed — that is factually wrong for this repo; a second base-URL var would be a divergence bug waiting to happen).
**Consequence**: `PUBLIC_APP_URL` graduates from "MP-only" to "required for activation email". Add a startup `console.warn` when empty, mirroring the `mercadoPagoEnabled` warning at server.js:161-163. There is no `.env.example` in the repo, so no file to update.

### D2 — `token_hash` + `verifyOtp`, not `redirectTo` + `detectSessionInUrl`

**Choice**: `generateLink({ type: 'recovery', email })` without `options.redirectTo`; we compose `${PUBLIC_APP_URL}/#/activar?token_hash=<hashed_token>`.
**Rejected**: `options: { redirectTo: '<base>/#/activar' }` relying on `detectSessionInUrl: true` (src/services/supabase.ts:60).
**Rationale**: (a) the app uses `HashRouter`, so the route already occupies the URL fragment — GoTrue's implicit-flow response also lives in the fragment, and the two collide; (b) `supabase/config.toml:156` shows the redirect allow-list does not contain the production origin, so a `redirectTo` path adds a dashboard-config dependency that can silently break the link; (c) the action link would be consumed by any corporate mail scanner that prefetches URLs, whereas a `token_hash` is only spent when the page calls `verifyOtp`. React Router parses `?token_hash=` inside the hash normally, so `useSearchParams()` works unchanged.
**Contingency**: if GoTrue refuses `type: 'recovery'` for a passwordless user, switch to `type: 'magiclink'` — same `hashed_token` shape, one-word change in the module and in `verifyOtp`.

### D3 — Email step goes AFTER the MercadoPago back-fill

**Choice**: insert the activation-email call between the MP block (server.js:1489-1528) and `res.status(200)` (1530-1531). The MP block is not touched — the diff is purely additive around it.
**Rationale**: both steps are best-effort with their own `try/catch` and share no state (the email reads `authUser.email` / `titularFullName` / `userId`, all settled at step 2), so ordering is correctness-neutral by construction — that independence is the requirement, and it is enforced by the isolated `try/catch`, not by position. Position is then chosen on two secondary grounds: SMTP is the slowest hop in the handler (in dev `createMailTransporter()` provisions an Ethereal account over the network) and must not delay the money path; and appending after the MP block keeps that payment-adjacent code byte-identical, which is what makes the "single revert" rollback plan true.

### D4 — Extract the `createUser` payload into a pure builder

**Choice**: `buildPatientAuthUser(request)` in the new module returns `{ email, email_confirm: true, user_metadata }` — **no `password` key at all** (not `password: undefined`). server.js calls `createUser(buildPatientAuthUser(request))` and reads `payload.email` where it currently uses `targetEmail`.
**Rejected**: editing the object literal in place.
**Rationale**: Strict TDD needs a RED test asserting the security property ("no password derived from DNI"). `server.js` exports nothing and cannot be unit-tested; a pure builder makes the one security-critical assertion testable at zero runtime risk. The `${dni}@medinex-paciente.com` fallback email, `email_confirm: true` and the full `user_metadata` (including `dni`) move verbatim.

### D5 — `/activar` is client-side only; no new Express route

**Choice**: a React page, no server route. `verifyOtp` and `updateUser` are anon-key client SDK calls; adding a server endpoint would require handling the recovery token server-side — strictly more attack surface for zero gain. Express already serves the SPA, so `/#/activar` needs no server change.

### D6 — Bounded DNI fallback: at most one legacy attempt

**Choice**: patient login resolves the identifier as: if it contains `@` → use as typed, single attempt, no fallback. If it does not → map through the **existing** legacy rule (>8 chars → digits-only phone; else DNI) to `<value>@medinex-paciente.com` and attempt **once**, then fail with an explicit message.
**Refinement vs. the brief**: a bare DNI is not a valid email, so sending it as attempt #1 guarantees a `400 email_address_invalid`, burns a GoTrue rate-limit slot and surfaces a misleading error. We skip that certain-failure call; the bound the proposal specifies (at most one legacy retry, then explicit failure) is preserved exactly.
**Retry gate**: `AuthRepository.login` already distinguishes invalid credentials (line 54) from the inactive-account error (line 95). We attach `code = 'invalid_credentials'` to the former so the caller keys off a code, never a message string. `is_active === false` must never trigger a legacy retry — that account exists and authenticated.

### D7 — Add `requireAuth, requireAdmin` to `/api/approve-adhesion`; client sends the Bearer token

**Choice**: `app.post('/api/approve-adhesion', requireAuth, requireAdmin, async (req, res) => {...})`, matching the existing convention at `/api/reset-user-password` (server.js:894) and `/api/update-user-email` (server.js:935). `AdhesionRepository.approveApplication` (src/repositories/AdhesionRepository.ts:174-187) is updated to fetch the session and send `Authorization: Bearer ${session?.access_token || ''}`, byte-identical to `AuthRepository.resetPasswordFromAdmin` (AuthRepository.ts:147-162).
**Rationale**: discovered during design review that this endpoint had no auth check at all — since this change makes it create a real Auth user and send an email (both privileged, side-effecting operations), leaving it open is no longer acceptable, and the fix is a two-line addition given the middleware and client pattern both already exist verbatim elsewhere in this codebase. User confirmed folding this into the same change rather than opening a separate one.
**Consequence**: `req.user`/`req.userRole` become available inside the handler (set by `requireAuth`/`requireAdmin`) but are not otherwise used by the existing approval logic — no other behavior changes. `rejectApplication` (AdhesionRepository.ts:192-202) is a DIFFERENT path — a direct anon-client `.update()` on `adhesion_requests`, protected by RLS, not an Express route — so it does not share this gap and is out of scope for this decision.

## Data Flow

    Admin -> POST /api/approve-adhesion (server.js:1282)
      1. fetch + validate adhesion_requests row
      2. createUser(buildPatientAuthUser(request))   <- no password
      3. profiles update / family group / status='approved'   [unchanged]
      4. MercadoPago preapproval back-fill + D-H sweep        [UNTOUCHED]
      5. sendActivationEmail(...)  try/catch, never throws  --+
      6. res 200                                              |
                                                              v
      supabaseAdmin.auth.admin.generateLink({type:'recovery'})
              -> properties.hashed_token
              -> `${PUBLIC_APP_URL}/#/activar?token_hash=...`
              -> createMailTransporter().sendMail()

    Affiliate -> /#/activar  (SetPassword.tsx)
      verifyOtp({type:'recovery', token_hash}) -> temp session
      updateUser({password})  -> signOut() -> /#/login

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/affiliateActivation.js` | Create | `buildPatientAuthUser`, `buildActivationUrl`, `buildActivationEmail`, `sendActivationEmail`. Injected deps, mirrors `server/mercadopago.js`. |
| `server/__tests__/affiliateActivation.test.js` | Create | Vitest + hand-rolled stubs, same style as `mercadopago.test.js`. |
| `server.js` | Modify | Import module; swap the `createUser` literal (1316-1330) for the builder; add step 5 after line 1528; `PUBLIC_APP_URL` startup warning; add `requireAuth, requireAdmin` to the `/api/approve-adhesion` route (D7). |
| `src/repositories/AdhesionRepository.ts` | Modify | `approveApplication` fetches the session and sends `Authorization: Bearer` header, mirroring `resetPasswordFromAdmin` (D7). |
| `server/__tests__/*` (integration-level, via a light Express test harness or route-level assertion) | Create/Modify | Assert 401 with no token, 403 for non-admin, 200 for admin — see spec's new "Authenticated, Admin-Only Adhesion Approval" requirement. |
| `src/pages/SetPassword.tsx` | Create | `/activar` page, sibling of `Auth.tsx`. |
| `src/pages/__tests__/SetPassword.test.tsx` | Create | State-machine coverage. |
| `src/App.tsx` | Modify | Import + `<Route path="/activar">` before the `*` catch-all (476); add `/activar` to `isPublicPath` (252-254) so it renders outside `Layout`/`AdminLayout`; add the pathname→hash redirect beside 244-249. |
| `src/utils/patientIdentifier.ts` | Create | `isEmailLike`, `toLegacyPatientEmail` (extracted verbatim from Auth.tsx:82-97). |
| `src/utils/__tests__/patientIdentifier.test.ts` | Create | Pure-function coverage. |
| `src/pages/Auth.tsx` | Modify | Login sequence per D6; patient field copy `Celular N°` → `Correo Electrónico` + legacy hint. Registration path untouched. |
| `src/pages/__tests__/Auth.login.test.tsx` | Create | Attempt-count and error-path coverage. |
| `src/repositories/AuthRepository.ts` | Modify | `code = 'invalid_credentials'` on the credentials error only. |
| `src/repositories/__tests__/AuthRepository.test.ts` | Modify | Assert the code is present / absent on the inactive path. |
| `src/pages/AdhesionForm.tsx` | Modify | Step-6 list item 3 (line 1437) only — text, no logic. |
| `src/pages/__tests__/AdhesionForm.test.tsx` | Modify | Assert no DNI-as-password claim. |

## Interfaces / Contracts

```js
// server/affiliateActivation.js
export function buildPatientAuthUser(request)               // pure -> createUser payload, never has `password`
export function buildActivationUrl(baseUrl, tokenHash)      // pure -> `${base}/#/activar?token_hash=...`, trims trailing '/'
export function buildActivationEmail({ fullName, activationUrl })  // pure -> { subject, text, html }
export async function sendActivationEmail(
  { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
  { email, fullName }
)  // -> { sent: boolean, reason?: string }  NEVER throws (mirrors notifyPaymentSettled, server/mercadopago.js:307-323)
```

`sendActivationEmail` returns `{ sent: false, reason: 'missing_public_app_url' | 'generate_link_failed' | 'send_failed' }` and `console.error`s; it never sends a link with an empty origin.

Email copy (Spanish, AdhesionForm register): subject `Activá tu cuenta Medinex`; body — greeting by `fullName`, "tu afiliación fue aprobada", one CTA (`Crear mi contraseña`) to `activationUrl`, plain-text URL fallback, single-use + expiry note, and "si el enlace venció, contactate con administración". No DNI, no password, ever, in the message. HTML reuses the dark-card inline-styled template of the OTP email (server.js:1038-1056).

`SetPassword.tsx` states: `verifying` (on-mount `verifyOtp`) → `ready` | `invalid` (expired/used/absent token, offers the admin-reset path) ; `ready` → `submitting` → `success` (then `signOut()` + redirect to `/login`) | `error` (retryable). Password rule: min 6 chars + confirmation, matching Auth.tsx:71.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (server) | `buildPatientAuthUser` has **no** `password` key, keeps `email_confirm: true`, metadata and the synthetic-email fallback | Vitest, pure |
| Unit (server) | `buildActivationUrl` trailing-slash + encoding; `buildActivationEmail` contains the URL and no credential claim | Vitest, pure |
| Unit (server) | `sendActivationEmail`: happy path; `generateLink` error; `sendMail` rejects; empty `PUBLIC_APP_URL` → all return `{sent:false}` and **never throw** | Injected stubs |
| Unit (client) | `isEmailLike` / `toLegacyPatientEmail` (DNI ≤8, phone >8 digits-stripped) | Vitest, pure |
| Unit (client) | `AuthRepository.login` error carries `invalid_credentials`; inactive-account error does not | Mocked supabase (existing test file) |
| Component | `Auth.tsx`: email input → exactly 1 login call; DNI input → exactly 1 legacy-mapped call; failure → explicit message; inactive error → no retry | RTL + mocked `authRepository` |
| Component | `SetPassword.tsx`: each state; `updateUser` called with the typed password; `signOut` on success | RTL + mocked supabase client |
| Component | `AdhesionForm` step 6 asserts the new copy and the absence of "contraseña" + DNI | Existing test file |
| Manual/integration | Approve a real adhesion in staging: 200 returned, MP link back-filled, email received, `/activar` sets the password, login works | Checklist — `server.js`'s handler is not unit-testable (no exports) and will NOT be refactored in this change |

## Threat Matrix

N/A — no routing-shell, subprocess, VCS/PR automation, executable-file classification or process-integration boundary. The new `/activar` route is a client-side React route, not a shell or process boundary; every row of `references/threat-matrix.md` (documentation-like paths, git selection, commit state, push state, PR commands) is inapplicable.

## Migration / Rollout

No DB schema change — **confirmed**. Activation state lives entirely in Supabase Auth (user with no password + one-time recovery token); nothing new is written to `adhesion_requests` or `profiles`. Deliberate consequence: a failed send is only visible in server logs, not in the admin UI. Adding an `activation_email_sent_at` column was considered and rejected as scope creep against the proposal; the accepted interim is the admin `ResetPasswordModal`.

Rollout order matters: `PUBLIC_APP_URL` must already be set in the production environment (it is, for MercadoPago) before deploy. Rollback stays code-only per the proposal.

## Open Questions

- [ ] Recovery-token TTL on the hosted project is unverified (`supabase/config.toml:227` is local-only, `otp_expiry = 3600`). Keep the duration in one module constant and confirm against the production Auth settings before writing a number into the email copy.
- [ ] `generateLink({ type: 'recovery' })` for a user created without a password must be smoke-tested against the live project; contingency is `type: 'magiclink'` (D2).
- [x] `/api/approve-adhesion` (server.js:1282) had **no** `requireAuth`/`requireAdmin`, unlike `/api/update-user-email` (935). User confirmed folding the fix into this change — see D7. No longer open.
