# Revoke unused table privileges
Objective: anon and authenticated lose TRUNCATE, REFERENCES and TRIGGER on every public table, now and for future tables (defense in depth).
Branch: fix/revoke-unused-table-privileges, stacked on feat/commercial-crm-followups (#104) so the migration sorts after the CRM chain. Runner: `supabase test db --local`, `npx vitest run`.

## Specs
- S1 "cerralo con la migracion": one migration revokes TRUNCATE, REFERENCES and TRIGGER from anon and authenticated on all tables in schema public.
- S2 Tables created later by the migration role (postgres) do not get those privileges for anon and authenticated (default privileges).
- S3 Nothing else changes: SELECT, INSERT, UPDATE, DELETE grants and RLS stay as they are; service_role is untouched.

## Tasks
- [x] T1 S1-S3 migration 20261112010000_revoke_unused_table_privileges.sql + pgTAP unused_table_privileges.sql. Route: inline. RED: 308 TRUNCATE/REFERENCES/TRIGGER grants to anon/authenticated, and a new table inherited them (5 failed). GREEN: 11/11; `supabase test db --local` 928 tests, all ok except the known doctor_patient_chart_data.sql. Risk: item 2 (grants).

## Log
- L1 (2026-11-12) "cerralo con la migracion" (after: Supabase default privileges grant TRUNCATE, REFERENCES and TRIGGER to anon/authenticated on public tables; not reachable through PostgREST/GraphQL and no dynamic SQL in migrations, so it is defense in depth).
- L2 (2026-11-12) Default ACLs in public come from postgres (owner of all 53 tables) and supabase_admin; only the postgres one can be altered from a migration, which covers every table the migrations create. Not touched: the MAINTAIN privilege (PG17) is also granted to the API roles; left out because it was not requested and REVOKE MAINTAIN fails on servers older than PG17.
- L3 (2026-11-12) Independent verifier: S1, S2, S3 pass, no blocker; nothing in the app uses these privileges, migration sorts last. Advisory: after `supabase db push --linked`, check pg_default_acl in prod (postgres/public entry without Dxt for anon/authenticated); tables created via Studio or supabase_admin keep the old defaults.
