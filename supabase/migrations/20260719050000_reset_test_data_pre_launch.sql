-- Description: Pre-launch cleanup. Wipes test/dev data accumulated during
-- development and QA, keeping all user accounts (profiles/auth.users) and
-- genuine platform configuration (legal_terms, system_settings) untouched.
--
-- Wiped: appointments (test video consults), office_locations (dev IPs),
-- pharmacy_suppliers (hardcoded demo seed, never entered manually),
-- adhesion_requests (test submissions), contact_verifications (expired
-- OTP challenges).

DELETE FROM public.appointments;
DELETE FROM public.office_locations;
DELETE FROM public.pharmacy_suppliers;
DELETE FROM public.adhesion_requests;
DELETE FROM public.contact_verifications;
