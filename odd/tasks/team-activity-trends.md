# Team activity trends

Objective: daily trend charts of the commercial team's activity on the Team Performance screen, so the admin and supervisors can see the team's pace day by day.
Branch: feat/team-activity-trends. Delivery: ask-on-risk. Test runner: vitest (`npx vitest run`).

## Specs

- S1 Request (verbatim): "podes armar un dashboard que muestre los kpi de las gestiones dia a dia? graficos evolutivos para saber como estan de ritmo".
- S2 KPIs chosen by the user: "Prospects, Collection actions, New affiliates / sales, Payment links". Per day, for the selected month:
  - Prospects: prospects loaded (`created_at`) and prospects converted (`status = 'affiliated'`, day of `status_changed_at`).
  - Collection actions: rows of `collection_actions` logged by the advisor (`created_by`).
  - New affiliates / sales: first confirmed payment of an approved adhesion, same rule as `advisor_monthly_metrics`. Shown cumulative against the monthly goal's pace line (goal × day / days in month).
  - Payment links: distinct adhesion requests with a `sent` delivery that day, and how many of those were later paid.
- S3 Placement: the Team Performance screen (admin `/team/performance` and the supervisor view), under the cards. It follows the existing supervisor filter and adds an advisor filter ("Todos los asesores" or one advisor). It uses the month picker.
- S4 Scope: the database decides visibility exactly as `advisor_monthly_metrics` does (own rows, supervisor's team, admin all). Days use America/Argentina/Buenos_Aires.
- Assumption: "debits recovered" (mentioned in the option description) is out of scope, because no recovery rule exists yet.

## Tasks

- [x] T1 S2,S4 inline: migration `advisor_daily_activity(p_month)` + repository method + tests. Commit 13d7c3c.
- [x] T2 S2,S3 inline: aggregation utils + `TeamActivityTrends` charts in TeamPerformance + tests. Commit 6505067.
- [x] T3 S4 delegated: independent verifier (Risk item 2, SECURITY DEFINER visibility guard).

## Log

- L1 (2026-11-21) "podes armar un dashboard que muestre los kpi de las gestiones dia a dia? graficos evolutivos para saber como estan de ritmo"
- L2 (2026-11-21) KPI answer: "Prospects, Collection actions, New affiliates / sales, Payment links".
- L3 (2026-11-21) Session resumed after a PC restart. Evidence: focused vitest 11 files / 150 tests PASS; pgTAP advisor_daily_activity.sql + advisor_goals_metrics.sql PASS (39); full pgTAP minus doctor_patient_chart_data.sql PASS (29 files / 999). Pre-existing on base (verified with stash): doctor_patient_chart_data.sql crashes the local Postgres at line 55; vitest VideoRoom (3), DashboardRepository (1), crypto (1) fail; tsc 1 error in Affiliates.cancellation.test.tsx. Next: T3 verifier.
- L4 (2026-11-21) T3 verifier: S2 PASS, S4 PASS, no blockers (visible filter identical to advisor_monthly_metrics in 20261111090000_crm_review_fixes.sql; roles from user_roles; grants match; Buenos Aires timezone). Probes added to supabase/tests/advisor_daily_activity.sql: team advisor sees only self, JWT-metadata admin claim grants nothing, inactive advisor hidden, PUBLIC no execute, SECURITY DEFINER + search_path pinned. Anon throws_ok probe dropped: calling as anon inside pgTAP crashes the local Postgres (same as doctor_patient_chart_data.sql:55); the anon execute-privilege check stays. pgTAP 13/13 PASS.
