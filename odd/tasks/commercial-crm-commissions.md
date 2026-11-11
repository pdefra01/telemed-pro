# Commercial CRM v2: review fixes, supervisor actions, MP debit rejections, commission liquidation
Objective: close the defects of the CRM code review, let the supervisor act on their team, surface Mercado Pago debit rejections, and add a commission liquidation the admin approves and pays. Builds on odd/tasks/commercial-crm.md (PRs #95-#99). Delivery: stacked PRs, one per delivery (A fixes → B supervisor actions → C MP rejections → D commissions), each branch on the previous; first branch feat/commercial-crm-fixes on feat/commercial-crm-intake. Runners: pgTAP (`supabase test db --local`, needs Docker: start only for it, stop right after), Vitest (`npx vitest run`), `npx tsc --noEmit`.

## Specs
- S1 (user): "El supervisor puede mirar y actuar, es su equipo". Confirmed scope: the supervisor edits their advisors' prospects (status, data, notes, register contact) and can create one on behalf of an advisor of the team; reassigns prospects between advisors of the team; logs collection actions on the team's affiliates; sets goals (exists).
- S2 (user): "en esta feature necesito que se vea la comision a cobrar (definamos exactamente el mecanismo que aprueba el pago de la comisión)"; "Admin aprueba la liquidación".
- S3 (confirmed mechanism): generated when the sale is confirmed (first positive ledger payment), for the plan's fixed `advisor_commission_amount`; monthly liquidation per advisor at month close grouping the month's generated commissions plus released retained ones; RETAINED if at liquidation time the affiliate has a rejected debit, released in a later liquidation once MP collects or the affiliate catches up; the ADMIN approves the liquidation (may exclude individual sales with a reason) and records the payment (date, method, reference); the advisor sees generated / retained / approved to collect / collected, the supervisor the same for the team. Confirmed defaults: no commission for the supervisor; no clawback of an already paid commission if the affiliate later leaves.
- S4 (user): "Necesito que se consulte MP para ver rechazos en los debitos"; purpose: "ambas razones" (decide the commission and show them in collections).
- S5 (user): "Retenida, y se avisa al asesor y admin (se debe ver en la ventana gestión de afiliados)". Confirmed: the admin sees a "Débito rechazado" mark in the Padrón de Afiliados (/affiliates); advisor and supervisor see it in Cobranzas; notice is on screen only (mark + pending counter), no email/WhatsApp. Rejections come from the existing webhooks plus a periodic MP query for debit subscriptions, to record rejections whose webhook never arrived.
- S6 (user: "Dale arranquemos"): fix the 8 defects of the code review of the whole stack:
  1. `supervisor` missing from the session policy (App SessionTimeoutHandler with a cached policy, `DEFAULT_POLICY` in src/services/supabase.ts, the seeded `session_security_policy`, OCCSettings role list, `DEFAULT_MAX_SESSION_HOURS`): supervisors get no inactivity timeout, no max session and a persistent session. Expected: same as advisor (15 min inactivity, non-persistent) unless the admin changes it in OCCSettings.
  2. `sync_prospects_intake` adhesion loop always takes the 500 OLDEST requests of the last 90 days, including already handled ones, so new requests are never examined once >500 exist.
  3. The drift guard `p.updated_at <= r.created_at` blocks legitimate advances (prospect just created by the intake, or "Registrar contacto" after the request); it must compare against the last STATUS change only.
  4. 1000-row cap (`max_rows = 1000`): `findConfirmedProfileIds` returns one row per payment, and the approved-requests list in advisorStats is unbounded: confirmed sales and commission can be undercounted.
  5. `SET statement_timeout` on the function has no effect on the calling statement: remove the claim (do not promise it).
  6. Collections history race: a slow `listActions` for a previously opened affiliate overwrites the history of the one now open.
  7. Prospect lists are unpaginated: admin/supervisor views and their per-status totals are truncated at 1000.
  8. Backdated anonymous surveys: the prospect's created_at must be the time it entered the CRM, not the client-settable survey date.
  Also (consistency): `advisor_monthly_metrics` must scope the team with `is_supervisor_of()` like the policies.

## Tasks
### Delivery A (branch feat/commercial-crm-fixes): review fixes
- [ ] A1 S6.2,S6.3,S6.5,S6.8,S6.9 DB: intake fixes + metrics scope + pgTAP. Risk: item 2.
- [ ] A2 S6.4 server: confirmed ids and approved count without the 1000-row cap + Vitest. Risk: item 3.
- [ ] A3 S6.1,S6.6,S6.7 client: supervisor session policy (4 places), history race, prospect pagination + Vitest. Risk: item 2 (session policy).
### Delivery B: supervisor acts on the team (S1)
- [ ] B1 RLS + UI for supervisor actions on prospects and collection actions + pgTAP/Vitest. Risk: item 2.
### Delivery C: MP debit rejections (S4, S5)
- [ ] C1 debit status per affiliate (webhook data + periodic MP query) + marks in Padrón and Cobranzas + counter. Risk: items 2 and 5 (external API).
### Delivery D: commission liquidation (S2, S3)
- [ ] D1 DB: commissions per confirmed sale, monthly liquidations, retention, admin approve/exclude/pay. Risk: item 1 (money records).
- [ ] D2 UI: advisor/supervisor commission view, admin liquidation screen, manual.

## Log
- L1 (2026-11-11): "Quiero repasar la feature completa, para aclarar los objetivos de la misma"; "El supervisor puede mirar y actuar, es su equipo, en esta feature necesito que se vea la comision a cobrar (definamos exactamente el mecanismo que aprueba el pago de la comisión)"; "Necesito que se consulte MP para ver rechazos en los debitos"; "Admin aprueba la liquidación, ambas razones para ver los rechazos"; "Retenida, y se avisa al asesor y admin (se debe ver en la ventana gestión de afiliados)"; "Bien tenemos todo"; consolidated definition (with no supervisor commission, no clawback, on-screen notice only) confirmed: "Dale arranquemos".
- L2 (2026-11-11): route: the parent session is past the long-session context backstop, so each task goes to one bounded delegated writer, sequentially (no parallel writers: the 7.5 GB machine cannot run two Docker stacks).
