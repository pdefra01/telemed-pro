# Feature: Mandatory Mercado Pago payment step in every sign-up

## Objective
Every new-affiliate sign-up must end in a Mercado Pago payment step, whatever the plan or payment option, and the sign-up is not completed if that step cannot be created.

## Decisions (user-confirmed 2026-09-20)
- Payment is MANDATORY: if the MP link cannot be created the sign-up does not finish (retry allowed, no duplicate request).
- Individual now goes through MP too (reverses the earlier "Individual has no MP subscription").
- Prepaid semester/annual = RECURRING charge every 6/12 months (preapproval), not a one-time payment.
- No option is left out: card_debit / debit / qr_debit / Individual / prepaid -> MP subscription (preapproval). Cash / transfer / Rapipago / link -> MP Checkout Pro payment for the first period (Checkout covers Rapipago/Pago Facil and transfer), later periods by invoice.

## Design (assistant, from the code map)
- Today: form submit -> adhesion_requests row -> best-effort POST /api/adhesion/preapproval (only card_debit/debit/qr_debit, Familiar) -> admin approve links the subscription. Preapproval is hardcoded frequency 1 month; subscriptionAmount ignores paid_months; canSubscribeToMercadoPago blocks Individual.
- Preapproval terms come from the plan: amount = monthly_cost x paid_months, frequency = paid_months months (1 for monthly plans). MUST be verified against Mercado Pago docs (frequency/frequency_type limits) before relying on 6/12.
- Checkout Pro for manual methods: new public endpoint tied to the adhesion request, external_reference `adhesion:<id>:checkout`; the `payment` webhook gets a branch that records the payment on adhesion_requests (new columns) instead of correlateInvoice.
- Failure handling: the adhesion row is created first; the MP endpoints are idempotent per adhesion id, so the form retries ONLY the MP call and never re-submits.
- MP disabled (missing secrets) -> sign-up blocked with a clear error (acceptable; dev needs the env vars).

## Constraints / risks
- TDD enabled. Runner `npx vitest run` (5 pre-existing failures: VideoRoom x3, crypto, DashboardRepository).
- server.js is not importable: handlers go into server/*.js with `{ supabaseAdmin }` injection.
- Migration files are written locally and verified on the local Docker Supabase (rolled-back tx); applying to remote needs the user's OK.
- Known limitation to flag, not solve now: posting the first Checkout Pro payment into the ledger/invoices at approval.
- Advisory ~400 authored lines per task.

## Tasks
- [x] M1 Server pure logic: preapproval terms from plan (frequency/amount), allow Individual, remove the Individual 400s, tests; verify MP frequency limits in docs
- [x] M2 Server endpoints: extend /api/adhesion/preapproval to all subscription options; new /api/adhesion/checkout-preference for manual methods; both idempotent, handlers extracted with tests
- [x] M3 Webhook + migration: adhesion_requests payment columns, `payment` topic branch for `adhesion:<id>:checkout`, audit event, tests (migration local only)
- [x] M4 Form: every option triggers its MP step, mandatory with retry, no step change until a link exists, tests flipped
- [ ] M5 Docs (MANUAL, PRD, MP PRD) + apply migration to remote (needs OK)

## Progress / evidence
- M1-M3 (delegated writer, trigger: 2+ non-trivial files): RED then GREEN per unit (pricing 20, adhesionPayments 19, webhook 74, pgTAP 12/12 local). Full suite 576 pass / 5 pre-existing fails, verified by the orchestrator. New: server/adhesionPayments.js, migration 20260920050000 (adhesion_requests payment columns + anon/authenticated forgery guard). Endpoints: /api/adhesion/preapproval serves all subscription options and now returns non-2xx on failure (502/404/409/400); new /api/adhesion/checkout-preference.
- MP docs check: a 6/12-month preapproval is NOT explicitly documented (examples only show frequency 1; subscription plans list semiannual/annual). No sandbox call made: UNVERIFIED until the first real call. Alternative if rejected: frequency 1 with repetitions, or a plan-based subscription.
- Assumptions to confirm: requiresCheckoutPayment is Familiar-only (Individual with cash/transfer falls to preapproval); notification_url added only when PUBLIC_APP_URL is set.
- M4 (delegated writer): 27/27 AdhesionForm tests; full suite 582 pass / 5 pre-existing fails, verified by the orchestrator. TDD deviation disclosed: tests written after the code, RED then observed by running them against the stashed original (10 failures). Form blocks step 6 until an initPoint exists, "Reintentar" repeats only the MP call for the same adhesion id, success step has "Ir a pagar con Mercado Pago" (same tab). Untested: unmount mid-retry leaves an adhesion row without a link. Open: same tab vs new tab.

## Next step
M5: docs, then apply migration 20260920050000 to remote (needs OK).
