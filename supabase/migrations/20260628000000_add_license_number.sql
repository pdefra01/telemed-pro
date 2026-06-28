-- Migration: Add license_number to doctor profiles
-- Description: Professional license/registration number required for legally valid prescriptions.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS license_number TEXT;

COMMENT ON COLUMN public.profiles.license_number IS 'Matrícula / número de registro profesional del médico. Requerido para recetas electrónicas con validez legal.';
