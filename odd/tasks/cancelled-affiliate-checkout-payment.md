# Cancelled affiliate checkout payment

Objective: a sign-up Checkout Pro payment that lands after an affiliate was cancelled is recorded but never reactivates them nor opens coverage.
Branch: fix/cancelled-affiliate-payment. Delivery: ask-on-risk. Test runner: pgTAP (`npx supabase test db`), vitest (`npx vitest run`).

## Specs

- S1 Pending item (affiliate cancellation #109 follow-up): "`post_adhesion_checkout_payment` and `adhesionActivation` can still set plan_status to active on a cancelled affiliate."
- S2 User decision: "que registre el pago y lo deje dado de baja".
  - `post_adhesion_checkout_payment` still posts the ledger (invoice, charge and payment movements, invoice paid when covered, `ledger_posted_at`).
  - It never sets `plan_status = 'active'` for a profile whose `plan_status` is 'suspended' or 'cancelled', or that has an `affiliate_cancellations` row (same guard as `post_payment_movement_from_webhook`, affiliate-cancellation S2).
  - It never opens a coverage window for a profile with an `affiliate_cancellations` row.
  - The result keeps `posted = true, reason = 'posted'` and adds `deferred_reason = 'affiliate_cancelled'` (or 'affiliate_suspended') so the server contract is unchanged.
- S3 `adhesionActivation` is out of scope: it always creates a new auth user (`createUser`) and fails if the email exists, so it never touches an existing affiliate (verified 2026-11-21).
- Assumption: a suspended affiliate follows the existing webhook rule (status kept, coverage still opened when none exists).

## Tasks

- [x] T1 S2 inline: migration redefining `post_adhesion_checkout_payment` + pgTAP test (RED first).
- [ ] T2 S2 delegated: independent verifier (Risk item 1, affiliate state and coverage in production).

## Log

- L1 (2026-11-21) Pending item chosen: "dale, que registre el pago y lo deje dado de baja".
- L2 (2026-11-21) Exploration: only the SQL function reactivates (line 138, unconditional) and opens a window; adhesionActivation always creates a new user. Server (`server/adhesionPayments.js:237`) reads only posted/reason/invoice_id.
- L3 (2026-11-21) T1: migration 20261121020000_checkout_payment_cancelled_affiliate.sql + supabase/tests/checkout_payment_cancelled_affiliate.sql. RED observed: 7/20 failed (exactly the bug cases). GREEN: 20/20; post_adhesion_checkout_payment.sql and affiliate_cancellation.sql still pass (95 total); full pgTAP minus doctor_patient_chart_data.sql 30 files / 1025 PASS; vitest adhesionPayments + mercadopago 131/131. Next: T2 verifier.
