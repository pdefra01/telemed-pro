# Affiliate cancellation ("Dar de baja")

Objective: the admin can cancel a direct affiliate: the MercadoPago automatic debit is cancelled at once, coverage lasts until the end of the paid period, then the affiliate (and the family group) is cancelled and never charged again.
Branch: feat/affiliate-cancellation · Delivery: single PR with work-unit commits (user choice) · Runners: Vitest (src, server), pgTAP (supabase/tests).

## Specs

- S1 — Admin action "Dar de baja" on a direct affiliate. User request (L1): "esta 'dar de baja' un afiliado implementado? ... que pasa si tiene debito automatico cuando se da una baja"; approved plan (L2): "una acción 'Dar de baja' (por servidor) que: 1. Cancele la suscripción en MercadoPago (si falla, no se da de baja) 2. Cierre la cobertura y lo saque de la facturación mensual 3. Lo marque como dado de baja y le bloquee el login".
  - Every open MP subscription of the affiliate (status pending/authorized/payment_failed with an mp_preapproval_id) is cancelled at MP first and recorded through the existing subscription-event path. If any MP cancel fails, nothing else changes and the admin sees an error.
  - Coverage end (L3, user decision): "Fin del período pagado" — the affiliate keeps coverage and login until the coverage window's paid_through; if the window is already expired or missing, the cancellation is effective immediately.
  - From the moment of the request the affiliate is never charged again (monthly billing cycle skips them).
  - When effective: is_active=false, plan_status='cancelled'; login blocked.
  - Assumption (default stated to the user): applies to the titular and every profile of the titular's family group; a family member who is not the titular cannot be cancelled on their own (error). Advisors and agreement (convenio) affiliates are out of scope.
- S2 — A late MP payment never reactivates an affiliate who is suspended or cancelled (fix: the webhook set plan_status='active' while is_active stayed false, showing them as "Pendiente"). A payment for an affiliate with a requested cancellation is recorded but does not extend coverage.
- S3 — "Reactivar" button for a suspended affiliate (approved plan item 5: "agregar un botón para reactivar a un suspendido").
- S4 — Admin list shows the state: "Baja programada" with its date while pending, "Dado de baja" once effective, and a "Bajas" filter. Assumption: a cancelled affiliate cannot be reactivated in this delivery.

## Tasks

- [x] T1 — S1, S2 · DB: plan_status 'cancelled', affiliate_cancellations table, cancel_affiliate + apply_due_affiliate_cancellations RPCs, webhook guard; pgTAP · inline · RED (no migration: plan not found) -> GREEN 32/32; full pgTAP 960/960 after local db reset
- [x] T2 — S1, S2 · Server: POST /api/affiliates/:id/cancel (MP cancel first, fail closed) + hourly sweep; billing skip; late payment -> needs_admin; tests · inline · RED (module missing, outcome final) -> GREEN: server 573/573, src services+repos green except known DashboardRepository
- [ ] T3 — S1, S3, S4 · UI: Dar de baja / Reactivar / status + filter, login block on effective date; tests · inline

## Log

- L1 (2026-11-13, user): "necesito saber: esta "dar de baja" un afiliado implementado? y confirmame que pasa si tiene debito automatico cuando se da una baja"
- L2 (2026-11-13, user): "dale" — approving the proposed plan (baja action cancelling MP fail-closed, closing coverage and billing, marking cancelled and blocking login; webhook fix; reactivate suspended).
- L3 (2026-11-13, user): coverage end = "Fin del período pagado (Recomendado)".
- L4 (2026-11-13, user): delivery = "Un PR con commits por unidad (Recomendado)".
- L5 Findings: "Suspender" only flips is_active/plan_status client-side; MP preapproval keeps debiting; getDirectAffiliates has no status filter; post_payment_movement_from_webhook (20260731000000:165,214) sets plan_status='active' unconditionally; plan_status CHECK is active|pending|suspended; login block is the client check on is_active (AuthRepository.ts:108).
- L6 T1 evidence: affiliate_cancellation.sql RED without the migration, GREEN 32/32 with it. mercadopago.sql tests 44/57 used plan_status='suspended' only to observe that the reactivation UPDATE runs; S2 changes suspended semantics, so their fixture now uses 'pending' (same lock-order intent). crm_review_fixes/prospects failures were leftover E2E data in the local DB; after `supabase db reset` the suite is 960/960 (advisor_affiliate_plan and doctor_patient_chart_data excluded: known local postgres segfault on permission-denied calls).
- L7 T2 evidence: server/__tests__/affiliateCancellation.test.js RED (module missing) and mercadopago.test.js new case RED (resolution final) -> GREEN; BillingService + AffiliateRepository new cases RED -> GREEN. Full server suite 573/573; src/services + src/repositories: only DashboardRepository.getMetrics fails (fails on master too).
