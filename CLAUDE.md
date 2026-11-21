# telemed-pro (Medinex)

Telemedicine + affiliate CRM. React/Vite + `server.js`, Supabase (Postgres, edge functions), deployed on Coolify.
Production: https://medinex.duckdns.org (`app.medinex.com` in older docs does not resolve).

## Git and PRs

- Conventional commits, no `Co-Authored-By` or other AI trailers.
- No issue or `type:*` label requirement. PR body sections: Problem, Change, Migration, Tests, Deploy (see #123, #125).
- State tests that also fail on `master` explicitly instead of hiding them.

## Deploy (manual, merging does not ship)

1. Apply Supabase migrations to production.
2. Redeploy changed edge functions.
3. Redeploy the app in Coolify.

Never run production migrations or deploys without explicit authorization.

## Migrations

- New migration timestamps must sort after every migration already applied in production. Check with `npx supabase migration list --linked`.
- Apply: `npx supabase db push --linked --dry-run`, confirm only the intended file is pending, then `npx supabase db push --linked --yes`.
- The Supabase MCP has no privileges on this project; use the CLI.

## Tests

- App: `npx vitest run`. Known failures on `master`: VideoRoom (3), DashboardRepository (1), crypto (1); `tsc` has 1 error in `Affiliates.cancellation.test.tsx`.
- Database: pgTAP in `supabase/tests`, run with `npx supabase test db` against local Supabase after `npx supabase db reset`.
  - `doctor_patient_chart_data.sql` crashes the local Postgres; exclude it when running the suite.
  - Do not call functions as `anon` inside `throws_ok`; it crashes the local Postgres. Check `has_function_privilege` instead.

## Domain rules

- Name edits on `profiles` / `family_members` write `first_name` / `last_name`; the `sync_full_name` trigger overwrites `full_name`.
- The `medical-documents` bucket is private on purpose. Sign URLs on read; never make it public.
- CRM visibility (advisor / supervisor / admin) follows `advisor_monthly_metrics`; roles come from `user_roles`, never from JWT metadata.

## Machine limits (~7.5 GB RAM)

Start Docker and local Supabase only when needed, with unused services excluded (`npx supabase start -x studio,imgproxy,...`). When done: `npx supabase stop`, quit Docker Desktop, `wsl --shutdown`.
