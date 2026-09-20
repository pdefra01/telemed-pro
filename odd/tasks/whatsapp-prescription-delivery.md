# Feature: WhatsApp prescription delivery via the company phone

## Objective
After a video consultation, the electronic prescription reaches the patient by WhatsApp **from the company's phone number**. The doctor never uses or exposes their own number.

## Decisions (user-confirmed unless noted)
- Company phone is a **physical phone**, linked once (QR) to a self-hosted gateway (WAHA) on Coolify: "linked device" mode. (user: option A)
- Sending happens in `server.js` (Coolify, same network as the gateway), NOT in the Supabase edge function, so the gateway is never exposed to the internet. (assistant recommendation)
- The PDF is sent **as an attachment**; the message carries no public link. (assistant recommendation)
- Message text is generic; it never includes the doctor's phone.
- Fallback for a dropped session: show a failed status + "Reenviar" button (manual retry). No queue in this phase.

## Constraints / risks
- Unofficial channel: WhatsApp may block the number. Mitigation: only patients who just had a consultation, low volume, no bulk.
- Gateway session needs the phone to reconnect at least every ~14 days.
- Deploy is manual (Coolify): the user deploys code, starts the WAHA container and scans the QR. The assistant must not touch remote infra.

## Out of scope (phase 2)
- Making the `prescriptions_pdfs` bucket private and moving to signed URLs. Existing `prescriptions.pdf_url` rows hold public URLs, so this needs a data migration and is deliberately separate.

## Tooling
- TDD: enabled (source: project SDD config). Runner: `npx vitest run` (server modules under `server/__tests__`).
- Route: inline, one non-trivial file per task (no delegation needed).
- Delivery: about 400 authored lines forecast total; single push per work unit on master (repo convention).

## Tasks
- [x] T1 `server/whatsapp.js`: AR phone normalization, message builder, WAHA client (injectable fetch) + tests
- [x] T2 Migration `prescription_deliveries` (status log, RLS: doctor of the appointment reads; writes via service role)
- [x] T3 `sendPrescriptionViaWhatsApp` service + `POST /api/prescriptions/:id/send-whatsapp` in `server.js` (auth: doctor of the appointment) + tests
- [x] T4 Frontend `PostConsultation.tsx`: auto-send after finalize, status + "Reenviar", remove `wa.me` button. (Dropping the simulator/public link from `finalize-consultation` was DEFERRED: it is only a console.log and would force a manual edge-function redeploy.)
- [x] T5 Docs: `COOLIFY_DEPLOYMENT.md` (WAHA container, env vars, QR linking, safeguards)

## Acceptance
- Doctor's number never appears anywhere; the patient sees only the company number.
- A failed send is visible to the doctor and can be retried.
- Unit tests cover phone normalization, message content (no URL, no doctor phone) and gateway error handling.

## Progress / evidence
- T1: RED (module missing) -> GREEN 24/24 with `npx vitest run server/__tests__/whatsapp.test.js`. Commit: feat(whatsapp) gateway client (see git log).
- T2: migration `20260920010000_prescription_deliveries.sql` written; NOT applied to remote yet (needs user OK). No pgTAP run (local supabase stack not started); RLS verified by review only.
- T3: RED (10 failing) -> GREEN 34/34; whole `server/` suite 162/162. Endpoint POST /api/prescriptions/:id/send-whatsapp (env: WHATSAPP_GATEWAY_URL, WHATSAPP_GATEWAY_API_KEY, WHATSAPP_GATEWAY_SESSION). Resend guard: 60s per prescription.
- T4: RED (4 failing) -> GREEN 7/7 in `PostConsultation.test.tsx`. Also fixed a regression I had introduced earlier (diagnosis placeholder removal broke a test -> aria-label) and 2 DoctorDashboard tests tied to the old summary copy.
- T5: `COOLIFY_DEPLOYMENT.md` section 4 (WAHA container, env vars, QR linking, care and verification).
- Final: full suite 484 passed / 7 failed; the 7 failures are in files untouched by this work (crypto, VideoRoom notes placeholder, DashboardRepository, MedicalHistory).

## Pending on the user (manual)
1. Apply migration `20260920010000_prescription_deliveries.sql` to remote (`supabase db push`), after OK.
2. Deploy the app; create the WAHA service in Coolify, set the 3 env vars, scan the QR with the company phone.
3. End-to-end test with a real consultation. Nothing here was exercised against a real WhatsApp session.

## Next step
Manual setup and real-world test (user).
