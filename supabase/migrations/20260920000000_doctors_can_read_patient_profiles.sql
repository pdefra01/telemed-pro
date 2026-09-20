-- Migration: Doctors can read patient profiles
-- Description: Business rule — any doctor or admin may consult all patient data for
-- medical or administrative reasons. Admins already have full access ("Admin full access").
-- This adds the missing SELECT access for doctors, which broke the DoctorDashboard
-- "search patient by DNI" (RLS returned zero rows).
-- Uses is_doctor() (SECURITY DEFINER, backed by user_roles) to avoid RLS recursion on profiles.

DROP POLICY IF EXISTS "Doctors can view all profiles" ON public.profiles;
CREATE POLICY "Doctors can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_doctor());

GRANT EXECUTE ON FUNCTION public.is_doctor TO authenticated;
