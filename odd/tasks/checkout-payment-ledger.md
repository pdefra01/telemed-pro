# Feature: Post the sign-up Checkout Pro payment into the affiliate ledger

## Objective
When a Familiar affiliate pays the first period through Mercado Pago Checkout Pro (cash, transfer, Rapipago, link), the payment must show in the affiliate account: an issued and paid invoice, a charge and a payment movement, and an open coverage window, whether the payment arrives before or after the admin approves the request.

## Decisions (user-confirmed 2026-09-20)
- Scope: post the Checkout Pro first payment into the ledger ("asentá el pago de Checkout Pro en el ledger").

## Design (assistant, from the code map)
- Facts: the payment is recorded on adhesion_requests (mp_payment_id, payment_status='approved', paid_at, external_reference `adhesion:<id>:checkout`). approve-adhesion creates the profile but opens NO coverage window and posts NOTHING (affiliates are skipped by billing as `skippedNoWindow`). The webhook RPC `post_payment_movement_from_webhook` would extend the window by one extra month for a first-period payment, so it is NOT reused.
- New service-role RPC `post_adhesion_checkout_payment(p_adhesion_request_id)`: idempotent; requires status approved + approved_profile_id + payment_status approved; upserts the first invoice (period = current YYYY-MM), inserts the charge (expected = plan monthly_cost x paid_months) and the payment (actual paid amount) movements with idempotency keys `charge:affiliate:<profile>:<period>` and `payment:mercadopago:<mp_payment_id>`; marks the invoice paid only when payments >= charge; opens the coverage window if the profile has none (snapshots from the plan, without extending it); sets plan_status active. New columns on adhesion_requests: mp_paid_amount, ledger_posted_at (idempotency and audit).
- Two triggers, same idempotent RPC: (A) after the payment arrives, if the request is already approved (webhook `handleAdhesionCheckoutPayment`); (B) inside approve-adhesion right after approved_profile_id is set (payment arrived first).
- Only manual Familiar methods reach this path (first month, `standard`), prepaid/subscription options go through preapproval, so the prepaid-invoice question does not apply.

## Constraints / risks
- TDD enabled, runner `npx vitest run` (5 pre-existing failures: VideoRoom x3, crypto, DashboardRepository). SQL verified on the local Docker Supabase with the rolled-back runner (scratchpad run_tx.cjs), never applied to remote without the user's OK.
- Opening the coverage window here is a small scope extension (approval does not do it today); flagged to the user.
- Advisory ~400 authored lines per task.

## Tasks
- [x] L1 DB: migration (adhesion_requests columns mp_paid_amount, ledger_posted_at; RPC post_adhesion_checkout_payment) + pgTAP
- [x] L2 Server: store the paid amount, call the RPC from the webhook (already approved) and from approve-adhesion (payment first), tests
- [ ] L3 Docs + apply migration to remote (needs OK)

## Progress / evidence
- L1-L2 (delegated writer, trigger: 2+ non-trivial files): RED then GREEN per unit. pgTAP verified by the orchestrator on local Docker (rolled back): post_adhesion_checkout_payment 43/43, adhesion_checkout_payment 12/12. Full suite 595 pass / 5 pre-existing fails. RPC returns JSONB {posted, reason, invoice_id}, service-role only. Server: postAdhesionCheckoutPayment (never throws), webhook stores mp_paid_amount and posts when already approved (`ledger_post_failed` retried by Pass A, `ledger_not_posted` needs_admin), approve-adhesion posts best-effort.
- Assumptions to confirm: NULL mp_paid_amount is treated as the expected charge (only for payments recorded before the column; remote has none); payment movement created_at = paid_at; overpayment leaves a credit (negative balance); existing invoice total is never changed. Untested: approve-adhesion inline call (endpoint not unit-testable), concurrency beyond the FOR UPDATE lock.

## Next step
L3: docs + apply migration 20260920060000 to remote (needs OK).
