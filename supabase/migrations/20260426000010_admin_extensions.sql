-- Migration: Admin Extensions for Profiles
-- Description: Adds email column to profiles for better admin visibility and updates existing data.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Script para sincronizar emails existentes desde auth.users (si tenemos acceso)
-- Nota: Esto solo funciona si se ejecuta con permisos suficientes.
DO $$
BEGIN
    UPDATE public.profiles p
    SET email = u.email
    FROM auth.users u
    WHERE p.id = u.id AND p.email IS NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo sincronizar el email desde auth.users. Esto es normal si no se tiene acceso a la tabla auth.';
END $$;

-- Asegurar que is_active esté bien configurado (refuerzo de migración 03)
UPDATE public.profiles SET is_active = TRUE WHERE is_active IS NULL;
