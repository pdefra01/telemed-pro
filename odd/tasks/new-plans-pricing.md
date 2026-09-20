# Feature: New plan catalog, pricing, commissions and identity validations

## Objective
Replace every existing plan with the new catalog, price each sign-up from a fixed price table (no discount formulas), pay advisors fixed commissions, and guarantee that a DNI/CUIL belongs to one group/plan only and a titular phone is unique.

## Decisions (all user-confirmed; full record in Engram `decision/new-plans-pricing-2026-09`)
| Plan / payment | Price | Coverage |
|---|---|---|
| Individual (any method, month to month) | $14.999 | titular only, 0 additional |
| Familiar standard (debit, QR auto debit, cash, transfer, Rapipago, link) | $49.999 | titular + up to 4 |
| Familiar credit-card auto debit | $39.999 | monthly |
| Familiar prepaid semester | 6 x 39.999 = 239.994 | 6 + 1 months, price frozen |
| Familiar prepaid annual | 12 x 39.999 = 479.988 | 12 + 2 months, price frozen |

- Unlimited consultations on both plans.
- Price changes apply to NEW sign-ups only; every affiliate keeps the plan (and price) they signed up with.
- Individual: no MP subscription, no payment-method question, no prepaid.
- Advisor commission (fixed, advisor `commission_rate` no longer scales it): Individual 7.500 / Familiar 25.000 / semester 30.000 / annual 35.000.
- Remove the "PROMOCION AGOSTO" banner.
- A DNI/CUIL can never sit in more than one family group or plan. Titular phone is unique (normalized). Two people sharing a phone cannot each take Individual (accepted).
- Wipe (LAST, backup + explicit OK on the list): all affiliates/patients except Alejandro Mayer and Pablo De Francesco, plus adhesion requests, invoices, ledger movements, coverage windows, MP subscription/event rows and their auth users. KEEP staff, advisors/producers, `lead_survey_responses` (standalone survey QR data) and survey campaigns. No active MP subscriptions expected; count them before deleting.

## Design (assistant)
- The existing billing model already supports this: `plans` has `monthly_cost`, `paid_months`, `bonus_months`, `is_unlimited`, `max_family_members`, and coverage windows freeze `monthly_cost_snapshot`. Each purchasable option becomes its **own plan row** (5 rows). "Price change" = create a new plan version, never edit one in use, so option A holds by construction (renewal re-derives from the plan assigned to the profile).
- New `plans` columns: `plan_kind`, `payment_option`, `is_offered` (sellable now; one per kind+option), `advisor_commission_amount`.
- DB trigger blocks changing price/duration/size of a plan that is in use.
- `normalize_ar_phone()` in SQL mirrors `server/whatsapp.js`.
- Cross-identity guards live in the DB (triggers), not only in the app pre-check.

## Constraints / risks
- No Docker here: local pgTAP cannot run. SQL is verified by running migrations + tests inside one remote transaction that ends in ROLLBACK (needs the user's OK).
- New unique indexes fail if test duplicates still exist: apply the identity migration AFTER the wipe.
- TDD: enabled. Runners: `npx vitest run` (JS), pgTAP style SQL in `supabase/tests/`.
- Route: inline; one non-trivial file per task.

## Tasks
- [x] T1 DB: plan catalog migration (columns, 5 seed plans, default, in-use immutability trigger) + SQL tests
- [x] T2 DB: identity guards (phone normalizer, phone unique, DNI/CUIL cross-checks incl. family limits by plan) + SQL tests
- [x] T3 Server: MP amounts from plan price, fixed commissions, check-duplicates (phone + Individual rule), plan resolution
- [x] T4 Adhesion form: choose plan, options per plan, no promo banner, family section only for Familiar (max 4)
- [x] T5 Admin UI: plans page shows kind/option/offered, in-use plans read-only
- [ ] T6 Data wipe (destructive, last, needs explicit OK)
- [ ] T7 Docs

## Progress / evidence
- T1 (inline): migration + pgTAP verified on local Supabase (Docker) in one tx ending in ROLLBACK: 36/36 assertions pass. Not applied to remote yet.
- T2 (mapper agent + inline): RED observed (`normalize_ar_phone` missing), then GREEN 22/22 on local Supabase in a rolled-back tx. Guards: normalized phone unique (profiles patients + pending adhesions), DNI/CUIL unique across profiles+family_members, family size from titular plan. Limitation: CUIL-vs-DNI cross match (CUIL middle digits) not checked. Index creation needs the wipe first (T6) on remote.
- T3 (delegated: mapper + one writer; trigger: 4+ files, 2+ non-trivial files): RED then GREEN per unit (pricing 14, adhesionChecks 14, AdhesionRepository 14). Full `npx vitest run`: 515 pass / 5 fail, verified by the orchestrator; the 5 (VideoRoom x3, crypto, DashboardRepository) are in files untouched by T3 and also fail on baseline per the writer's stash check. New: server/pricing.js, server/adhesionChecks.js. Discount formula removed; Individual cannot use MP; fixed advisor commissions in stats. No route-level test for Individual 400s (server.js not importable).
- Contract for T4: form sends plan_type 'individual'|'familiar', payment_method card_debit|prepaid_6|prepaid_12|<any standard method>.
- T4 (delegated writer): RED then GREEN (PlanRepository 13/13, AdhesionForm 21/21). Full suite 528 pass / 5 pre-existing fails, verified by the orchestrator. Form now driven by offered plan rows; promo banner and client discount math removed. User confirmed: debit and QR auto debit are MP subscriptions (AUTO_DEBIT_METHODS stays as is; they charge the standard Familiar price, card_debit the cheaper one). Open: terms clause 4 wording generic; Familiar card shows "Desde $39.999".
- T5 (delegated writer): RED (16/38 failing) then GREEN. Full suite 544 pass / 5 pre-existing fails, verified by the orchestrator. Plans list shows kind/option/offered/price/months/size/commission; in-use plans lock price and terms; "Crear nueva version" prefills a draft (not offered). Not tested: modal/Agreements rendering (pure helper tests only). Open: publishing a new version does not auto-withdraw the old one; commission locked with the price when in use.

## Next step
T6 (destructive, needs backup + explicit OK on the list) then T7 docs.
