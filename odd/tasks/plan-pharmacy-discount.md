# Plan pharmacy discount (GitHub #33)
Objective: the pharmacy discount comes from the affiliate's plan instead of a hardcoded 40%. Branch: feat/plan-pharmacy-discount. Delivery: ask-on-risk. Runners: pgTAP (`supabase test db --local`), Vitest.

## Specs
- S1 (user): "el nivel de descuento se difinira por el plan que acceda el afiliado"
- S2 (user): "tenemos que especificar en la definicion de los planes: tiene descuento en farmacia? cuanto?" — one field per plan, `pharmacy_discount_percent` 0-100 (0 = no discount), editable in the admin plan form.
- S3 (user): "dejalo con 40% a todos" — every existing plan starts at 40.
- S4 (proposal accepted): at checkout the server applies the buyer's plan percent. A family-group profile without its own plan uses the titular's plan. No active plan (plan_id null, plan_status <> 'active', or profile inactive) means 0%.
- S5 (proposal accepted): the catalog shows the real percent of the plan instead of the fixed "40%".

## Tasks
- [x] T1 S1-S4 inline: migration (column, CHECK, backfill 40, resolver, create_pharmacy_order, get_my_pharmacy_discount_percent) + pgTAP. Risk: item 1 (migration, prod RPC). RED (column missing) → GREEN: plan_pharmacy_discount.sql 25 tests PASS; full pgTAP 12 files, 461 tests PASS.
- T2 S2,S5 inline: types, PlanRepository, PlanFormModal, PharmacyRepository, PharmacyCatalog + Vitest.

## Log
- L1 (2026-10-25): "si, vamos con el 8, tenemos que especificar en la definicion de los planes: tiene descuento en farmacia? cuanto?"
- L2 (2026-10-25): "deploy listo, dejalo con 40% a todos"
