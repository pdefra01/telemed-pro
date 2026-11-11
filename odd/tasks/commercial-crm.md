# Commercial structure + CRM (supervisors/advisors, prospects, goals, collections)
Objective: a one-level commercial hierarchy (supervisor → advisors) with a lightweight CRM. Branch: feat/commercial-crm-prospects (delivery 1). Delivery: ask-on-risk, 4 deliveries. Runners: pgTAP (`supabase test db --local`), Vitest (`npm test`), node tests in server/__tests__.

## Deliveries
- D1: roles + prospects (this branch). D2: monthly goals + metrics. D3: collections follow-up. D4: automatic prospect intake (lead surveys, incomplete adhesions).

## Specs
- S1 (user): "implementar una estructura comercial y un crm (inicial, no complejo), que permita tener un esquema de supervisores/vendedores donde seguir sus metricas (actuales y otras a definir, poder tener una base de datos de prospectos"
- S2 (user): "el vendedor es el asesor actual" — reuse role `advisor`; no parallel seller model.
- S3 (user): "Un nivel alcanza" — add role `supervisor`; each advisor has at most one supervisor (`profiles.supervisor_id`). No deeper hierarchy.
- S4 (user): "Ambas, empezando por la manual" — D1 is manual prospect entry by the advisor; automatic intake is D4.
- S5 (user): "accesibilidad al CRM por parte del asesor tambien" — the advisor sees and edits only their own prospects; the supervisor sees their team's; the admin sees all (RLS).
- S6 (assumption): prospect pipeline `new → contacted → interested → affiliated | lost`, plus `last_contact_at` for "no follow-up" metrics (D2).
- S7 (assumption): the admin creates supervisors (server, like `/api/create-advisor`) and assigns advisors to a supervisor; `supervisor_id` is a privileged column the user cannot self-edit.
- S8 (user, later deliveries): monthly goals per advisor in affiliates, revenue or both, set by the supervisor for their team and by the admin for all (D2); collections status of the affiliates each advisor brought (`profiles.producer_id`, view `affiliate_payment_status`), with collection-contact logging, always visible to the supervisor (D3): "el CRM debe permitir seguimiento de las cobranzas de los afiliados que trajo cada uno, con escala a su supervisor" / "el supervisor conoce la situacion sea la que sea" / "Sí, que registre gestiones de cobro".

## Tasks
- [x] T1 S2,S3,S7 inline: migration 20261111000000 (role check + `supervisor_id` + validation trigger + guard extension + `is_supervisor_of` + team SELECT policy) + pgTAP commercial_hierarchy.sql. Risk: item 2 (RLS, guard on prod profiles). RED (supervisor role violates CHECK, file aborts) → GREEN 17 tests PASS; full pgTAP: every file ok except doctor_patient_chart_data.sql (pre-existing: adhesion_requests.titular_birth_date NOT NULL, fails without this change too).
- [x] T2 S4-S6 inline: migration 20261111010000 (`prospects`, validation + updated_at triggers, RLS advisor own / supervisor team read-only / admin all) + pgTAP prospects.sql. Risk: item 2 (new RLS table; no existing data touched). RED (relation missing) → GREEN 21 tests PASS. Also made both validation triggers SECURITY DEFINER so they do not depend on the writer's RLS visibility (T1 migration amended before any deploy). Local pgTAP: only the pre-existing doctor_patient_chart_data.sql fails.
- [x] T3 S3,S7 inline: server `POST /api/create-supervisor` (server/supervisors.js, admin-only) + vitest supervisors.test.js. Assigning an advisor to a supervisor needs no endpoint: the admin writes profiles.supervisor_id directly (admin RLS + DB validation trigger), done in T5. Risk: none (new endpoint behind requireAuth+requireAdmin, no shared code changed). RED (module missing) → GREEN 7 tests; all server tests 26 files / 507 PASS.
- [ ] T4 S5,S6 inline: types, ProspectRepository, advisor Prospects page (list/create/edit/status), nav + route + Vitest.
- [ ] T5 S5 inline: supervisor team view (prospects by advisor), admin screen to create supervisors and assign advisors + Vitest.

## Log
- L1 (2026-11-11): "necesito que me ayudes a determinar una nueva feature: implementar una estructura comercial y un crm (inicial, no complejo), que permita tener un esquema de supervisores/vendedores donde seguir sus metricas (actuales y otras a definir, poder tener una base de datos de prospectos"
- L2 (2026-11-11): "Sí, el vendedor es el asesor actual"; "Un nivel alcanza"; "Ambas, empezando por la manual"; "Sí, y sumar metas mensuales por asesor, accesibilidad al CRM por parte del asesor tambien"; "Ambas, con la meta elegible por asesor"; "Ambos, supervisor para su equipo y admin para todos"; "ambas" (escala automática y manual, then clarified: "con escala me referia a que el supervisor conoce la situacion sea la que sea"); "Sí, que registre gestiones de cobro"; "Sí, armá el documento y empezamos por la entrega 1".
- L3 (2026-11-11): findings: advisor id = profiles.id = producers.id; `guard_profile_privileged_columns` blocks self-edit of privileged columns (must include `supervisor_id`); producers writes are admin-only; advisors are created by `/api/create-advisor` (server.js:1456); latest migration 20261103000000.
