# Standalone prescription (receta fuera de videollamada)

Objective: a doctor can issue a new prescription to any affiliate (titular or family group member) without a prior video consultation, and deliver it by WhatsApp.
Branch: feat/standalone-prescription · Delivery: single PR with work-unit commits (same as the last feature, L4 of affiliate-cancellation) · Runner: Vitest (src, supabase/functions/_shared pure modules). Deno is not installed locally: edge entry files get no type-check.

## Specs

- S1 — User request (L1): "Recetas fuera de videollamada"; scope (L2): "Medico puede hacer receta a cualquier afiliado sin consulta previa".
  - Entry point (assumption, stated to the user): a "Nueva receta" button in the doctor's "Historia clínica" modal, which opens for any patient found by DNI search or from the queue/history.
  - The doctor picks who the receta is for: the titular or a member of their family group. The member must belong to the titular's group (DB trigger `guard_family_member_belongs_to_patient` already enforces it).
  - Content, same rules as PostConsultation: medications (catalog autocomplete with stock, productId kept), indications, or obra social mode (https link, max 2000 chars). At least one of medications / indications / link is required. A medication needs a name.
- S2 — Server side: a new edge function `issue-prescription`.
  - Only an authenticated user whose profile role is `doctor` can call it (401 without/invalid token, 403 for any other role). The doctor on the receta is always the caller, never a body field.
  - Writes one `prescriptions` row with `appointment_id = null`, `doctor_id = caller`, the patient and optional family member; PDF built with the same layout as finalize-consultation (shared module), stored in the private `prescriptions_pdfs` bucket under `{patient_id}/standalone-{ts}.pdf`.
  - It creates no medical record (evolución) and touches no appointment (assumption: a receta is not a consultation).
  - Notifies the patient ("Nueva receta") and returns the new prescription id.
- S3 — After issuing, the receta is sent by WhatsApp with the existing `/api/prescriptions/:id/send-whatsapp`; a failed send shows the reason and a "Reenviar" button. The patient sees it in their history/pharmacy like any other receta (already keyed by patient_id).

## Tasks

- [ ] T1 — S2 · `_shared/prescriptionPdf.ts` (PDF + private upload, moved from finalize-consultation without behavior change) + `issue-prescription` (pure core with injected deps + Vitest tests, Deno entry) · inline
- [ ] T2 — S1, S3 · UI: extract MedicationCard, NewPrescriptionModal (patient/member, meds, indications, obra social, WhatsApp status), button in DoctorDashboard; tests · inline
- [ ] T3 — S2 · docs: deploy notes (new function + finalize-consultation redeploy) · inline

## Log

- L1 (2026-11-15, user): "Recetas fuera de videollamada"
- L2 (2026-11-15, user): "Medico puede hacer receta a cualquier afiliado sin consulta previa"
- L3 Findings (explorer): `prescriptions.appointment_id` nullable; RLS lets any doctor read profiles/family_members; prescriptions RLS is FOR ALL for any doctor; finalize-consultation is the only writer, needs an appointment, and does not check the caller JWT (pre-existing gap, out of scope, follow-up); WhatsApp send works by prescription id and requires `doctor_id = requester`; patient views filter by patient_id only. No migration needed.
- Risk: item 2 (new auth guard in an edge function using the service role).
