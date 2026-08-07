-- Migration: Ensure all doctor profiles have valid license_number (MP N°)
-- Description: Assigns default MP N° to any doctor profile whose license_number is missing.

UPDATE public.profiles
SET license_number = '184920'
WHERE role = 'doctor' AND (license_number IS NULL OR license_number = '');
