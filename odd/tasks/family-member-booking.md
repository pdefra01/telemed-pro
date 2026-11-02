# Feature: Choose the family member when booking a video consultation

Objective: every video consultation records WHICH person (titular or a family group member) is attended, so each one keeps their own medical chart.
Branch strategy: stacked-to-main, one PR per task, merged in order (T1's migration is applied to prod before T2's app deploy). Test runner: vitest (`npx vitest run`).
Risk: T1 and T3 touch migrations / an edge function (high-risk item 1 and 5): each gets an independent Opus verification.

## Specs
- S1 (user, verbatim): "vamos a necesitar que cuando se solicite una video consulta se deba indicar que integrante del grupo familiar esta por ser atendido (esto sumamente imprescindible para llevar la ficha médica de cada uno)".
- S2: a consultation (appointment) records the attended person: the titular or one `family_members` row. The patient always picks one; the default is the titular ("Yo").
- S3: the doctor sees who is attended in the queue, the video room and the post-consultation screen, with the relation to the titular (e.g. "Lucía Pérez · hijo/a de Marta Pérez").
- S4: what the doctor writes in a consultation (evolución, receta) is stored against the attended person, and the doctor's chart view can show the history of one person at a time (titular or each member).
- S5: the evolución the doctor adds after a call (PR #81) is stored against the person of that consultation.
- S6: removing a member who has consultations, evoluciones or recetas must NOT reattribute their history to the titular: the database refuses and the admin sees a clear message.
- S7: existing rows keep working: no family member = the titular. Quota, billing and WhatsApp delivery stay on the titular (members have no phone or profile).

Assumptions (not asked): the choice is required but defaults to the titular; `ON DELETE RESTRICT` for appointments / medical_records / prescriptions; quota is shared by the group (unchanged); the receta is delivered to the titular's WhatsApp.

## Tasks
- [x] T1 (S2, S7) Migration: `family_member_id` on appointments, medical_records, prescriptions (FK `family_members`, RESTRICT); `doctor_queue` view exposes member id, name and relation; types. Route: inline. Risk: item 1. Done: PR #83, migration applied to prod 2026-11-02, Opus verified.
- [x] T2 (S2, S3) Booking: selector in the patient's appointment modal; `createAppointment` stores it; patient's appointment lists show "Para: X"; the doctor's WhatsApp notice names the attended person. Route: inline. Done: Opus verified, no blockers.
- [ ] T3 (S3, S4, S5) Doctor side: queue, VideoRoom and PostConsultation show the person; `finalize-consultation` copies the member to the record and the receta (edge function, needs deploy); chart/history view per person; evolución added from history uses the consultation's person. Route: inline. Risk: item 5 (edge function deploy).
- [ ] T4 (S6) Admin removal guard: friendly message when the FK blocks a removal. Route: inline.

## Log
- L1 (2026-11-02, user): "Elegir integrante al reservar" (after: "anota para despues ... vamos a necesitar que cuando se solicite una video consulta se deba indicar que integrante del grupo familiar esta por ser atendido (esto sumamente imprescindible para llevar la ficha médica de cada uno)").
- L2: exploration (family group map): members are `family_members` rows without profile/phone; only `medical_documents` has `family_member_id` (ON DELETE SET NULL); `doctor_queue` view joins the titular; `getAppointmentById` feeds VideoRoom/PostConsultation; quota is per titular.
