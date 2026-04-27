-- Migration: Profiles Soft Delete and Cleanup
-- Description: Adds is_active column for soft deletes and ensures schema consistency.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Actualizar registros existentes para asegurar que tengan el valor por defecto
UPDATE public.profiles SET is_active = TRUE WHERE is_active IS NULL;

-- Asegurar que las consultas por defecto filtren por is_active (opcional en DB, pero lo manejaremos en repo)
-- CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles(role, is_active);
