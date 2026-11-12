-- Migration: revoke unused table privileges from the API roles (odd/tasks/revoke-unused-table-privileges.md)
--
-- Supabase's default privileges grant anon and authenticated every table privilege, including TRUNCATE,
-- REFERENCES and TRIGGER. The API never uses them (PostgREST and GraphQL only issue SELECT, INSERT, UPDATE,
-- DELETE and function calls) and RLS does not apply to TRUNCATE, so they are taken back as defense in depth.
-- SELECT, INSERT, UPDATE and DELETE stay as they are (RLS decides); service_role is untouched.

-- S1: existing tables, views and foreign tables in public
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- S2: tables created later by the migration role
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
