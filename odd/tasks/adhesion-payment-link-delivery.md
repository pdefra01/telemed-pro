# Feature: Deliver the MP payment link through a channel the advisor picks

## Objective
Step 6 of AdhesionForm.tsx (the "¡Solicitud Enviada!" screen) must let the
person completing the form choose how the Mercado Pago payment link
(`mpInitPoint`) reaches the affiliate, instead of only opening in the same
browser/device — which breaks when an advisor completes the sign-up on their
own phone (Mercado Pago opens logged in as the advisor, not the affiliate).

## Decisions (user-confirmed 2026-09-22)
- Three channels, always shown together (advisor or self sign-up, no
  conditional on `?promoter=`):
  1. WhatsApp, sent automatically from the company's WAHA number (same
     mechanism as prescription delivery) — never from the advisor's own phone.
  2. "Copiar link" — copies `mpInitPoint` to the clipboard; the person shares
     it however they want. No backend involved.
  3. Email to the affiliate, reusing the existing activation-email
     transporter (`createMailTransporter` / `FROM_ADDRESS` / `server.js`).
- Phone and email already exist on the `adhesion_requests` row
  (`titular_phone`, `titular_email`) — no new form fields needed; new
  endpoints take only the adhesion request id.
- Existing direct "Ir a pagar con Mercado Pago" link/behavior stays as one of
  the options, not removed.

## Design (assistant, from the code map)
- WhatsApp: `server/whatsapp.js` only has `sendFile` (WAHA client) for
  prescriptions. Add `sendText` to `createWahaClient`, plus a
  `sendPaymentLinkViaWhatsApp` function mirroring
  `sendPrescriptionViaWhatsApp`'s shape (phone from `titular_phone` via
  `normalizeArgentinePhone`, resend guard, delivery log) but reading
  `mp_init_point`/similar from `adhesion_requests` instead of a prescription.
- Email: mirror `affiliateActivation.js`'s pattern — pure builder
  `buildPaymentLinkEmail({ fullName, paymentUrl })` + a
  `sendPaymentLinkEmail({ createMailTransporter, fromAddress }, { email,
  fullName, paymentUrl })` that never throws, using the same transporter
  already wired in `server.js`.
- New public endpoints (mirrors `/api/adhesion/preapproval`, no auth — the
  form itself is public): `POST /api/adhesion/:id/send-payment-link` with
  `{ channel: 'whatsapp' | 'email' }`. Looks up the adhesion request,
  confirms an MP init point/preference already exists for it, dispatches.
  "Copy" needs no endpoint.
- Need to confirm exactly where `mpInitPoint` is persisted per adhesion
  request today (server/adhesionPayments.js) — read before M1/M2.
- Frontend (AdhesionForm.tsx step 6): replace the single `<a href={mpInitPoint}>`
  block with three actions (WhatsApp / Copiar link / Email), each with its own
  loading/error state; keep the direct link too.

## Constraints / risks
- TDD enabled. Runner `npx vitest run`.
- Reuse existing delivery-log pattern (`prescription_deliveries`) — likely
  needs an analogous table or a shared generic one; decide during M1.
- server.js is not importable: new handlers go in `server/*.js` with
  `{ supabaseAdmin }` / `{ waha }` / `{ createMailTransporter }` injection.
- Advisory ~400 authored lines per task.

## Tasks
- [x] M1 Confirm where `mpInitPoint` lives on `adhesion_requests` (read
      `server/adhesionPayments.js` + migrations); decide the delivery-log
      table/columns for whatsapp+email attempts on a payment link.
- [x] M2 WAHA `sendText` + `sendPaymentLinkViaWhatsApp` (server/whatsapp.js),
      tests.
- [x] M3 `buildPaymentLinkEmail` + `sendPaymentLinkEmail`
      (server/affiliateActivation.js or a new module), tests.
- [x] M4 `POST /api/adhesion/:id/send-payment-link` endpoint wiring both
      channels, tests.
- [ ] M5 AdhesionForm.tsx step 6: three-channel UI (WhatsApp / Copiar link /
      Email) + keep the direct MP link, tests flipped.
- [ ] M6 Docs (MANUAL, PRD) if needed.

## Progress / evidence
- M1 (direct inline read): `mpInitPoint` is NEVER stored as its own column.
  `createAdhesionPreapproval` / `createAdhesionCheckoutPreference`
  (server/adhesionPayments.js) both re-derive it on demand from MP using the
  persisted `mp_preapproval_id` / `mp_checkout_preference_id`, and they are
  already idempotent re-fetch-or-create. The send-payment-link endpoint (M4)
  should call whichever of these two applies (same `requiresCheckoutPayment`
  branch already used by the client to know which MP endpoint to hit) to get
  a fresh `initPoint`, then dispatch it — no new column needed for the link.
  Delivery-log table for whatsapp+email attempts still to decide in M2/M3
  (likely mirrors `prescription_deliveries`: channel, status, error).

- M2 (2026-09-22): Added `sendText` to `createWahaClient`, plus pure
  `buildPaymentLinkMessage({ fullName, paymentUrl })` and
  `sendPaymentLinkViaWhatsApp({ supabaseAdmin, waha, now }, { adhesionRequestId,
  paymentUrl })` in `server/whatsapp.js`, mirroring
  `sendPrescriptionViaWhatsApp`. Columns confirmed from
  `supabase/migrations/20260718000000_create_adhesion_requests.sql` +
  `20260718001000_split_names_and_email_verification.sql`: `titular_phone`,
  `titular_first_name`, `titular_last_name` (legacy `titular_name` kept as
  fallback). New table `adhesion_payment_link_deliveries` (channel
  whatsapp|email, resend guard scoped per channel) via migration
  `supabase/migrations/20260922000000_adhesion_payment_link_deliveries.sql`
  — written only, NOT applied (no local Docker Supabase reachable in this
  session); needs local verification before remote apply.
  TDD: RED confirmed (11 new tests failing, `sendPaymentLinkViaWhatsApp`/
  `buildPaymentLinkMessage` undefined) → GREEN (45/45 in
  `server/__tests__/whatsapp.test.js`). Full suite: 661/668 passing; 7
  pre-existing unrelated failures untouched (VideoRoom, DashboardRepository,
  crypto, MedicalHistory). Route: direct inline (single cohesive change to
  whatsapp.js + its test file + one migration, already-understood pattern
  mirrored from sendPrescriptionViaWhatsApp; no separate mapping needed).

- M3 (2026-09-22): Added `buildPaymentLinkEmail({ fullName, paymentUrl })`
  (pure builder, same dark-card/Medinex visual language as
  `buildActivationEmail`, reuses the existing `escapeHtml` helper) and
  `sendPaymentLinkEmail({ supabaseAdmin, createMailTransporter, fromAddress,
  now }, { adhesionRequestId, email, fullName, paymentUrl })` in
  `server/affiliateActivation.js` (extended the existing file rather than a
  new module — it already owns the injected-transporter email pattern and is
  already imported by server.js, so this keeps one place for "email delivery
  built on `createMailTransporter`"). Mirrors `sendPaymentLinkViaWhatsApp`'s
  `{ status, body }` contract (404/409/502/200), logs every attempt to
  `adhesion_payment_link_deliveries` with `channel: 'email'`, and applies an
  independent 60s resend guard scoped to `adhesion_request_id AND channel =
  'email'`. `RESEND_GUARD_MS` is not exported from `server/whatsapp.js`, so
  the same 60_000ms value was redeclared locally as
  `PAYMENT_LINK_RESEND_GUARD_MS` (documented why in a comment) rather than
  duplicated silently. `sendPaymentLinkEmail` never throws — same contract as
  `sendActivationEmail` — including when the delivery-log insert itself
  fails (logged to console, response still reflects the actual send
  outcome).
  TDD: RED confirmed (7 new tests failing, `sendPaymentLinkEmail` not a
  function, via `git stash` isolating the implementation from the tests) →
  GREEN. Full suite: 668/675 passing; the same 7 pre-existing unrelated
  failures as M2 (VideoRoom, DashboardRepository, crypto, MedicalHistory)
  remain untouched. Route: direct inline (single cohesive extension of
  affiliateActivation.js + its existing test file, already-understood
  pattern mirrored from `sendActivationEmail`/`sendPaymentLinkViaWhatsApp`).

- M4 (2026-09-22): Added `sendAdhesionPaymentLink({ supabaseAdmin, mpFetch,
  publicAppUrl, nextBillingDate, waha, createMailTransporter, fromAddress },
  { adhesionRequestId, channel })` in new module
  `server/adhesionPaymentLinkDelivery.js`. Thin composition only: validates
  `channel` (400), reads the adhesion request (`titular_email,
  titular_phone, titular_first_name, titular_last_name, titular_name,
  plan_type, payment_method` — 404 if missing), resolves the plan via
  `resolveSellablePlan` (500 if unresolved), branches on
  `requiresCheckoutPayment(payment_method, plan.plan_kind)` to call the
  existing `createAdhesionCheckoutPreference` or `createAdhesionPreapproval`
  (server/adhesionPayments.js) for a fresh `initPoint` (propagates its
  `{status, body}` untouched on any non-200), then dispatches via
  `sendPaymentLinkViaWhatsApp` (server/whatsapp.js) or `sendPaymentLinkEmail`
  (server/affiliateActivation.js) and returns whatever that channel function
  returned. No new state machine, no MP/WhatsApp/email code duplicated.
  Wired in `server.js`: imported `sendAdhesionPaymentLink`, added
  `app.post('/api/adhesion/:id/send-payment-link', ...)` right after
  `/api/adhesion/checkout-preference`, guarded by the existing
  `mercadoPagoEnabled` flag plus a `channel === 'whatsapp' && !waha` 503
  guard (mirrors `/api/prescriptions/:id/send-whatsapp`'s `if (!waha)`
  check, since `waha` can be null when the WhatsApp gateway env vars are
  missing).
  Tests: new `server/__tests__/adhesionPaymentLinkDelivery.test.js`, mocking
  `../pricing.js`, `../adhesionPayments.js`, `../whatsapp.js`,
  `../affiliateActivation.js` with `vi.mock` (composition-level unit test,
  not exercising the full nested supabase chains those mocked functions
  already have their own tests for). Covers: invalid channel (400), request
  not found (404), unresolved plan (500), preapproval+whatsapp path,
  checkout-preference+email path, MP creation failure propagation.
  TDD: RED confirmed (`Failed to resolve import
  "../adhesionPaymentLinkDelivery.js"` — module did not exist yet) → GREEN
  (6/6 in the new test file).
  Full suite: 674/681 passing; the same 7 pre-existing unrelated failures as
  M2/M3 remain untouched (`VideoRoom.test.tsx` x3, `DashboardRepository.test.ts`,
  `crypto.test.ts`, `MedicalHistory.test.tsx` x2).
  Route: direct inline (single new module + its test file + a small,
  already-understood server.js wiring addition, mirrored from the sibling
  `/api/adhesion/preapproval` and `/api/prescriptions/:id/send-whatsapp`
  registrations; no separate mapping needed since M1–M3 already established
  every dependency's shape).

## Next step
M5: AdhesionForm.tsx step 6 three-channel UI (WhatsApp / Copiar link /
Email), tests flipped.
