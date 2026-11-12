# Advisor with a Medinex plan on the same account

Objective: an active commercial advisor can hold any Medinex plan (and family members) free of charge on their advisor account; when they stop being an active advisor the account becomes a paying affiliate.
Branch: feat/advisor-affiliate-plan · Delivery: ask-on-risk · Runners: Vitest (src, server), pgTAP (supabase/tests).

## Specs

- S1 "los asesores deben poder acceder a algun plan Medinex" — "la 2, que el asesor tenga plan en su cuenta": the plan lives on the advisor's own account (role stays `advisor`); no second account.
- S2 "Si es asesor activo es sin cargo, pudiendo el admin asignarle cualquier plan e incluso cargar familiares": the admin assigns any plan and manages the family group of an advisor from the affiliates screen; while the advisor is active, neither the advisor nor their family members are billed.
- S3 An advisor with a plan uses the affiliate features on the same login: home toggle "Comercial" / "Mi plan", affiliate menu and routes (historial, pagos, perfil, farmacia, encuestas), booking, and the doctor sees their chart.
- S4 "si deja de ser activo asesor se comienza a cobrar" — agreed design ("Va"): deactivating an advisor who has a plan turns the account into a regular affiliate (role `patient`, can still log in, keeps plan and family, leaves the supervisor's team, enters billing); commercial history stays for the admin. Reactivating turns it back into an advisor (free again). An advisor without a plan keeps today's deactivation (login blocked).

## Tasks

- [x] T1 S3,S4 — DB: `is_affiliate()`, chart function, `set_advisor_status` role swap; pgTAP. Route: inline. Risk: item 1, 2. GREEN: advisor_affiliate_plan.sql 28/28; commit: see L3.
- [ ] T2 S1,S3 — Front: `planId` on the user, `isAffiliate`, routes, menu, home toggle. Route: inline.
- [ ] T3 S2 — Admin affiliates list includes advisors (badge "Asesor · sin cargo"); billing skips family groups whose titular is an active advisor. Route: inline.

## Log

- L1 (2026-11-12) "tengo otra situacion: los asesores deben poder acceder a algun plan Medinex" / "hoy por hoy el sistema rechaza el cambio o anexado de rol" / "la 2, que el asesor tenga plan en su cuenta" / "Si es asesor activo  es sin cargo, pudiendo  el admin asignarle cualquier plan e incluso cargar familiares, si deja de ser activo asesor se comienza a cobrar" / "Va".
- L2 Map: assign_plan, coverage windows, MP flows and appointments/profiles RLS are role-agnostic (prod pg_policies checked). Blockers: chart fn `role='patient'`, `allowedRoles={['patient']}` routes, Layout menu, admin lists `.eq('role','patient')`, `validate_profile_supervisor` rejects supervisor_id on non-advisors. Out of scope / follow-ups: identity guards only compare patients; commission self-referral guard; `/api/livekit-token` has no auth.
- L3 (2026-11-12) T1 done: migration 20261112020000_advisor_affiliate_plan.sql. RED was not observed separately (local stack applied the migration on start). Full pgTAP run: 27/28 files green (956 tests). doctor_patient_chart_data.sql: fixture fixed (adhesion_requests NOT NULL columns); 11/11 green without its `anon` assertion — the local image supabase/postgres:17.6.1.105 segfaults (signal 11) on ANY permission-denied function call as anon, reproduced with the previous function and a trivial `select 1` function, so it is environmental, not this change. Independent verifier deferred to feature end (named risk items 1, 2). Next: T2.
