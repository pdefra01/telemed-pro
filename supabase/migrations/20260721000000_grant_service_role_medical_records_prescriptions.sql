-- Migration: Grant service_role privileges on medical_records and prescriptions
-- Description: The original migration (20260426000001_consultation_history.sql)
-- only granted INSERT/SELECT/UPDATE/DELETE to `authenticated`, never to
-- `service_role`. RLS bypass (rolbypassrls) and base table GRANTs are
-- separate Postgres privilege systems — service_role having rolbypassrls=true
-- does NOT give it table access on its own. The finalize-consultation edge
-- function uses the service-role client to write these tables, and has been
-- failing on its very first INSERT with "permission denied for table
-- medical_records" since this feature was built — meaning no consultation
-- has ever successfully saved a diagnosis or prescription, nor had its
-- appointment marked 'completed' by this flow (confirmed via local repro).

GRANT INSERT, SELECT, UPDATE, DELETE ON public.medical_records TO service_role;
GRANT INSERT, SELECT, UPDATE, DELETE ON public.prescriptions TO service_role;
