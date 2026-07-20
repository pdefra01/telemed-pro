-- Description: Removes all doctor accounts (test data from development),
-- per user request to wipe médicos ahead of onboarding real doctors.
-- Deletes auth.users, user_roles, and profiles rows together since
-- there's no FK cascade wiring these three together in this schema.

DELETE FROM auth.users WHERE id IN (SELECT id FROM public.profiles WHERE role = 'doctor');
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM public.profiles WHERE role = 'doctor');
DELETE FROM public.profiles WHERE role = 'doctor';
