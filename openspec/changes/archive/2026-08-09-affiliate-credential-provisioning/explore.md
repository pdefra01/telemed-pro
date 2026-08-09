# Exploration: affiliate-credential-provisioning

## Current State

When an affiliate completes the adhesion form and MercadoPago payment, an admin later approves the request from `src/pages/admin/Affiliates.tsx`. Approval hits `POST /api/approve-adhesion` in `server.js` (lines 1282-1536), which calls `supabaseAdmin.auth.admin.createUser` with `password: request.titular_dni.trim()` (line 1316, used at 1321-1330) — the applicant's plaintext DNI becomes their permanent Supabase Auth password, set silently server-side. No email is sent to the affiliate at approval time despite a fully working Nodemailer/SMTP pipeline (`createMailTransporter()`, `server.js:971-994`) already used for the OTP step (`/api/email-verification/send`, line 1000+) — that pipeline is never invoked from `/api/approve-adhesion`.

`AdhesionForm.tsx` never collects a password from the applicant (confirmed: no password field anywhere in the file). Step 6 (submission-success screen, lines 1419-1439) tells them at line 1437: "loguéate ... usando tu DNI ... como usuario y contraseña temporal" — shown immediately on form submit, BEFORE any admin review/approval/account creation happens.

`src/pages/Auth.tsx` has a DNI-mode (default for patients) that builds `authEmail = ${inputValue}@medinex-paciente.com` purely client-side (lines 88-91) with zero DB lookup/RPC. But `titular.email` is a REQUIRED field in `AdhesionForm.tsx` (validated at line 439, `required` attr at line 745), so `server.js` line 1315's real-email branch (`request.titular_email?.trim() || fallback`) is always taken for adhesion-approved affiliates — the `@medinex-paciente.com` synthetic-email fallback is effectively dead code for this flow (it only applies to the separate self-registration path in `AuthRepository.registerPatient`). Net effect: DNI-login mode cannot resolve the correct account for effectively **any** affiliate who went through adhesion+approval (not just "most" — email is mandatory to even submit the form). The step-6 message is actively wrong for the production flow.

Two more manual admin-only surfaces reinforce the plaintext-DNI-password pattern, neither emailing the affiliate:
- `Affiliates.tsx` `handleActivate` → `AffiliateRepository.activateAffiliate` (line 375) just flips `profiles.is_active`/`plan_status` — unrelated to credentials.
- `ResetPasswordModal.tsx` + `POST /api/reset-user-password` (`server.js:894-924`, `requireAuth`+`requireAdmin`) uses `admin.updateUserById`; the modal has a one-click "Usar DNI como clave" shortcut (lines 50-58) and sends no notification.

## Affected Areas
- `server.js:1282-1536` — `/api/approve-adhesion`: sets plaintext-DNI password, never emails a welcome/credential message.
- `server.js:965-994` — proven SMTP transporter (env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; Ethereal dev fallback) — currently used only by the OTP endpoint, reusable for a welcome/invite email.
- `server.js:894-924` — `/api/reset-user-password`: manual admin reset, no notification.
- `src/pages/AdhesionForm.tsx:1419-1439` (line 1437) — premature/incorrect DNI-credentials success message; confirmed no password field anywhere in the form.
- `src/pages/Auth.tsx:78-97` (esp. 82-97) — client-side synthetic-email construction for DNI-login, no server lookup.
- `src/repositories/AuthRepository.ts:8-42` (`registerPatient`, the real consumer of `@medinex-paciente.com`) and `:147-162` (`resetPasswordFromAdmin`).
- `src/pages/admin/Affiliates.tsx:253-279` — `handleActivate` (unrelated) vs. `handleApproveRequest` (the real approval trigger → `/api/approve-adhesion`).
- `src/components/admin/ResetPasswordModal.tsx` — manual reset UI, "DNI as password" shortcut, no email.
- `package.json:18` — `@supabase/supabase-js: ^2.104.1` confirmed; supports `auth.admin.generateLink` (invite/recovery/etc.) and `auth.admin.inviteUserByEmail`, both currently unused anywhere in the codebase (zero grep matches).
- `server.js:81-93` — `supabaseAdmin` service-role client, the established pattern for privileged auth ops; any fix must stay server-side on this client, consistent with the non-blocking best-effort side-effect pattern already used for the MercadoPago link back-fill (lines 1489-1528).

## Existing Test Coverage (TDD baseline)
- No test file covers `/api/approve-adhesion` anywhere in the repo (only `server/__tests__/mercadopago.test.js` exists under `server/__tests__/`).
- `src/pages/__tests__/AdhesionForm.test.tsx` covers CUIL validation, duplicate-rejection toast, and MP preapproval creation — not step-6 messaging or credential logic.
- `src/repositories/__tests__/AuthRepository.test.ts` covers `login()` branches — not DNI-login email construction (lives untested in `Auth.tsx`) nor `registerPatient`/`resetPasswordFromAdmin`.
- Conclusion: all three flows need tests written from scratch under Strict TDD Mode.

## Approaches

1. **Invite-link flow** (`admin.generateLink({type:'invite'})` or `admin.inviteUserByEmail`, sent via existing SMTP pipeline) — applicant sets own password after approval.
   - Pros: DNI never becomes a real credential; reuses proven SMTP path; Supabase-native.
   - Cons: depends on reliable email delivery (already a hard dependency today); needs a `/set-password` callback route and step-6 copy change.
   - Effort: Medium.
2. **Keep `createUser({password: dni})` + forced-password-change gate + welcome email.**
   - Pros: smallest diff to the approval endpoint; SMTP reuse closes the "no email" gap.
   - Cons: needs new schema (`must_change_password` doesn't exist) and login-flow enforcement; DNI still briefly a real password.
   - Effort: Medium-High.
3. **`admin.generateLink({type:'recovery'})` after `createUser` (no/random password), reusing SMTP.**
   - Pros: same core benefit as #1.
   - Cons: semantically "reset" rather than "invite" for a brand-new account; needs a reset-callback page (unverified whether one exists — flag for a later phase).
   - Effort: Medium.

Any option must also fix the step-6 message and the DNI-login mode in `Auth.tsx` (remove it, or add a server-side DNI→email lookup) — it is currently non-functional for the primary approval flow and must not silently keep pointing users at broken credentials.

## Recommendation

Approach 1 (invite-link, no real password ever set to the DNI) — eliminates the plaintext-DNI-as-permanent-password risk entirely rather than mitigating it, reuses the already-proven SMTP transporter, and needs no new DB schema. Pair with correcting the step-6 message and redesigning DNI-login (removal or a real server-side lookup), while preserving the still-valid self-registration path that legitimately uses `@medinex-paciente.com`.

## Risks

- `/api/approve-adhesion` is payment-adjacent (MercadoPago link back-fill) — any change must preserve its non-blocking best-effort pattern.
- SMTP delivery isn't guaranteed in all environments — a welcome/invite email must not become a hard blocker for approval succeeding.
- Zero existing test coverage for all three affected flows — `sdd-tasks` must budget for TDD from scratch.
- Removing/changing DNI-login mode is user-facing and must not break the separate, still-valid self-registration path (`AuthRepository.registerPatient`) that genuinely uses the synthetic email.
- `ResetPasswordModal`'s DNI-shortcut and missing reset-notification are a smaller, separable issue — may be deferred to a follow-up change if scope needs to shrink.

## Ready for Proposal

Yes — all 4 prior ad-hoc findings are independently verified against current code with exact line references, and no blocking unknowns remain for scoping.

---
Engram topic key: `sdd/affiliate-credential-provisioning/explore` (obs #1811)
