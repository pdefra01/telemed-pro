# Verify Report: affiliate-credential-provisioning

**Verdict**: PASS WITH WARNINGS (0 CRITICAL, 3 WARNING, 2 SUGGESTION) -- ready to commit.

## Test Evidence

- `npx vitest run` (full suite): 339 passed / 13 failed / 352 total, 44 files (6 failing). Exit code non-zero due to pre-existing baseline failures only.
- Failing tests (all pre-existing, confirmed unrelated to this change):
  - `src/repositories/__tests__/DashboardRepository.test.ts` > getMetrics > should fetch total doctors, patients and appointments (1)
  - `src/utils/__tests__/crypto.test.ts` > should fail verification if prescription data is tampered with (1)
  - `src/pages/patient/__tests__/MedicalHistory.test.tsx` (2: should render the component and load data, should switch tabs and show empty state for prescriptions)
  - `src/pages/patient/__tests__/Payments.test.tsx` > receipt-download-disabled (1)
  - `src/pages/patient/__tests__/Profile.test.tsx` (2: renders read-only and editable fields with initial user data, calls updateAffiliate and updates active session on successful submission)
  - `src/pages/__tests__/VideoRoom.test.tsx` (6, all ReferenceError: user is not defined at VideoRoom.tsx:252, a pre-existing bug on master unrelated to this change)
  - Total: 1+1+2+1+2+6 = 13, matching apply-progress.md's claim exactly.
  - None of these files were touched by this change (change touches: server/affiliateActivation.js, server.js, src/App.tsx, src/pages/AdhesionForm.tsx, src/pages/Auth.tsx, src/pages/SetPassword.tsx, src/pages/admin/Affiliates.tsx, src/repositories/AdhesionRepository.ts, src/repositories/AuthRepository.ts, src/utils/patientIdentifier.ts, plus their test files).
- `npx tsc --noEmit`: 6 pre-existing errors (4 in src/pages/patient/PatientDashboard.tsx, 2 in src/pages/VideoRoom.tsx -- same user bug as above). Zero new type errors from any file this change touched.
- Focused suites re-run independently, all green:
  - server/__tests__/affiliateActivation.test.js, server/__tests__/approveAdhesionAuth.test.js, src/repositories/__tests__/AdhesionRepository.test.ts -- 3 files, 25 tests passing.
  - src/pages/__tests__/SetPassword.test.tsx, src/pages/__tests__/Auth.login.test.tsx, src/utils/__tests__/patientIdentifier.test.ts, src/repositories/__tests__/AuthRepository.test.ts -- 4 files, 28 tests passing.

## Requirement-by-Requirement Verdict

### 1. No Plaintext-DNI Password On Approval -- PASS
server/affiliateActivation.js:24-38 buildPatientAuthUser returns an object with email, email_confirm: true, user_metadata only -- no password key anywhere in the object literal (confirmed by direct read, not inference). server.js:1325,1330 calls createUser(buildPatientAuthUser(request)). Covered by server/__tests__/affiliateActivation.test.js (passing).

### 2. Best-Effort Activation Email (Non-Blocking) -- PASS
server.js:1530-1544: the sendActivationEmail call is wrapped in its own try/catch (activationEmailSent defaults false, only flipped inside the try), placed strictly after the MercadoPago block (server.js:1489-1528, confirmed byte-identical to the pre-change block via diff -- only the trailing comment changed) and before res.status(200) at server.js:1547. A thrown error from sendActivationEmail is caught at server.js:1542-1543 and logged; the response still returns 200 with activationEmailSent: false. sendActivationEmail itself (server/affiliateActivation.js:104-141) also never throws (its own internal try/catch), so this is a double-guaranteed non-blocking path.

### 3. Self-Service Password Activation via /activar -- PASS
src/pages/SetPassword.tsx implements the exact D2/D5 state machine: verifying (on-mount verifyOtp type recovery + token_hash, lines 30-55) -> ready/invalid; ready -> submitting -> success (updateUser then signOut then navigate to /login, lines 70-84) | error (retryable, form stays visible). Route wiring in src/App.tsx:278-281 (Route path /activar element SetPassword), isActivarPath/isPublicPath at lines 258-259, and pathname-to-hash redirect at lines 251-252 -- byte-identical pattern to the pre-existing /adhesion and /encuesta routes. Post-fix signOut-on-abandonment confirmed present and correctly gated: sessionEstablishedRef (line 28) is set true only on successful verifyOtp (line 43), the useEffect cleanup (lines 47-53) signs out and resets the ref only if it is still true (i.e. user never reached success, which itself clears the ref before its own signOut at line 81) -- no double signOut, no signOut on the invalid-token path (ref never set), no interference with the success path. src/pages/__tests__/SetPassword.test.tsx (7/7 passing) covers the full state machine.

### 4. Accurate Credential Messaging in Adhesion Form -- PASS
src/pages/AdhesionForm.tsx:1437: step-6 copy now reads "Te enviaremos un correo con un enlace para crear tu contrasena y acceder a la App de MEDINEX." No DNI-as-password claim found anywhere in the file (grepped for DNI/contrasena/email/correo -- the only other DNI/correo references are the unrelated OTP-email-verification and form-field labels, confirmed by manual read). src/pages/__tests__/AdhesionForm.test.tsx updated with an assertion for the new copy and absence of the old claim (7/7 passing in that file).

### 5. Bounded Identifier Resolution in Login -- PASS
src/pages/Auth.tsx:55-74: patient-login branch (role patient and not registering) resolves authEmail via isEmailLike/toLegacyPatientEmail (src/utils/patientIdentifier.ts) and calls authRepository.login exactly once -- no loop, no second attempt. On failure, only retries-the-message (not the call) when the input was not email-like and err.code equals invalid_credentials (line 70), showing the explicit use-your-email message; any other error (including the inactive-account message, which the repository never tags with .code, confirmed at src/repositories/AuthRepository.ts:100-102) passes through unchanged. toLegacyPatientEmail (src/utils/patientIdentifier.ts:20-26) reuses the existing 8-char DNI/phone split rule verbatim. No server-side DNI lookup endpoint was added (confirmed: no new route in server.js for identifier resolution). Covered by src/pages/__tests__/Auth.login.test.tsx (4/4 passing) and src/utils/__tests__/patientIdentifier.test.ts.

### 6. Authenticated, Admin-Only Adhesion Approval -- PASS
server.js:1289: app.post registers /api/approve-adhesion with requireAuth, requireAdmin, async handler -- confirmed by direct read, matching the /api/reset-user-password and /api/update-user-email convention. requireAuth (server.js:100-126) returns 401 for missing/invalid Bearer token before any body is read; requireAdmin (server.js:132-144) returns 403 for non-admin roles. src/repositories/AdhesionRepository.ts:182-200 approveApplication fetches supabase.auth.getSession() and sends an Authorization Bearer header using session access_token or empty string (line 188) -- never omits the header, matching AuthRepository.resetPasswordFromAdmin's pattern. Route-level 401/403/200 scenarios covered by server/__tests__/approveAdhesionAuth.test.js (passing); Bearer-header-sent assertion covered by src/repositories/__tests__/AdhesionRepository.test.ts:190-231 (passing).

## Post-Apply Judgment Day Fixes -- Verified Fully Applied

1. HTML-escaping in buildActivationEmail -- server/affiliateActivation.js:53-60 defines escapeHtml; line 72 calls escapeHtml(fullName) into safeFullName, and the HTML body (line 80, greeting with safeFullName) uses the escaped value while the plain-text body (line 71) correctly uses the raw fullName (no HTML context, no escaping needed). Confirmed complete, not partial.
2. activationEmailSent threaded end-to-end -- server.js:1535,1541,1554 sets and returns it in the JSON response; AdhesionRepository.ts:182,198-199 types the return as a promise of an object with activationEmailSent boolean and derives it defensively (falls back to true unless explicitly false, so a malformed/missing response still surfaces as sent rather than false-alarming -- reasonable default); src/pages/admin/Affiliates.tsx:266-277 handleApproveRequest destructures it and shows a distinct error-type toast (Restablece su contrasena manualmente) when false, vs. the success toast when true. Confirmed complete, all three hops present and consistent.
3. sessionEstablishedRef/signOut-on-unmount in SetPassword.tsx -- verified above under Requirement 3; logic is complete and correctly gated (no double-signOut, no signOut on already-completed success, no signOut on the invalid/no-token path).

## Design Deviations (both accepted, narrowly scoped)

1. Added id="auth-identifier" / id="auth-password" to Auth.tsx's two Input components (src/pages/Auth.tsx:288,338) -- a pure accessibility fix (pre-existing label had no htmlFor/associated control) required to make getByLabelText resolve in RTL tests. Purely additive DOM attribute, no behavior change. Accepted.
2. Narrowed inline-error visibility on the identifier field for the patient-login path (src/pages/Auth.tsx:304) -- confirmed the generic error banner (src/pages/Auth.tsx:351-356) still renders unconditionally on any error state, so patient-login errors are never silently dropped; this change only suppresses the duplicate inline-field rendering of the same message that was tripping RTL's getByText multiple-match assertion. All other roles/registration paths keep both inline and banner rendering unchanged. Accepted, narrowly scoped, no regression.

## Issues

### CRITICAL
None.

### WARNING
- W1 -- server/__tests__/approveAdhesionAuth.test.js reimplements requireAuth/requireAdmin rather than importing them from server.js (server.js has no exports, per design's accepted constraint). The file's header comment claims the copies are byte-identical; this is not independently enforced by tooling (no diff-check against the real middleware), so a future edit to the real requireAuth/requireAdmin in server.js could silently desync from this test's copy. This was already surfaced and knowingly deferred as a single-judge Judgment Day finding (see sdd/affiliate-credential-provisioning/apply-progress, Not fixed list). Route registration itself (order of requireAuth, requireAdmin) IS verified against the live server.js source via regex at approveAdhesionAuth.test.js:116, so the 401/403/200 status-code contract is real; only the innards of the two middleware functions are a maintained copy. Non-blocking.
- W2 -- DNI/phone format validation (dniSchema/phoneSchema) is not applied on the patient-login path (src/pages/Auth.tsx:55-74), only on registration/other roles (Auth.tsx:81-89). This is a UX-only gap (a malformed DNI on login now reaches toLegacyPatientEmail unchecked, then fails auth with the existing no-account-found message rather than a format-validation message) -- not a spec violation, since the spec's Requirement 5 scenarios only require bounded retry behavior, which is intact. Already flagged and knowingly deferred per Judgment Day (single-judge, lower priority). Non-blocking.
- W3 -- Task 4.5 gap (no App.tsx-level route test for /activar) -- confirmed as described: no App.tsx test file exists anywhere in the repo, and the pre-existing /adhesion and /encuesta routes using the identical isPublicPath/redirect pattern are equally untested at the App-shell level. /activar's risk profile is therefore identical to, not worse than, already-shipped routes. Explicitly flagged as a known, accepted gap per the orchestrator's instructions -- not a blocker.

### SUGGESTION
- S1 -- Cross-tab session-swap edge case on shared browsers and the StrictMode dev-only double-verifyOtp race (both noted in the Judgment Day apply-progress record as deferred, single-judge, lower-priority findings) remain unaddressed. Neither is a spec requirement; both are reasonable follow-up hardening candidates for a future change.
- S2 -- AdhesionRepository.approveApplication's defensive fallback (treats activationEmailSent as true unless explicitly false) means a network response with a malformed/missing body (e.g. non-JSON 200) will report activationEmailSent true even though the actual email status is unknown. This favors optimism over caution for a security-adjacent signal (admin visibility into orphaned passwordless accounts). Low-risk given res.status(200).json always includes the field on the success path server-side; only a truly malformed response body would trigger it.

## Task Completion Check

All tasks in tasks.md Phases 1-5 are marked done and verified against actual code (not just checkbox state) above. Task 4.5 is not done, explicitly and correctly documented as a deferred/accepted gap in both tasks.md and apply-progress.md, matching this report's W3. Phase 6 (6.1-6.3) is an explicit manual/staging checklist, correctly out of sdd-apply/sdd-verify automated scope.

## Conclusion

Implementation matches spec.md's 6 requirements and design.md's D1-D7 decisions with source-level, test-verified evidence for every scenario. All 3 post-apply Judgment Day fixes are fully and correctly applied end-to-end. Both documented deviations are narrowly scoped and non-regressive. Full test suite (339/352 passing) and typecheck show zero new failures -- the 13 failing tests and 6 type errors are exactly the pre-existing baseline, confirmed by name-for-name match, and none touch any file this change modified. No CRITICAL issues. Ready to commit / proceed to sdd-archive.
