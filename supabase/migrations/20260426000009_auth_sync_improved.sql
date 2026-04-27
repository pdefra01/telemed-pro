-- Migration: Auth Sync Improvements & Missing Fields
-- Description: Adds blood_type, fixes the sync trigger to extract DNI from fake emails, and ensures all metadata is synced correctly.

-- 1. Add missing columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS blood_type TEXT;

-- 2. Improved Synchronization Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  extracted_dni TEXT;
  extracted_role TEXT;
BEGIN
  -- Extract DNI from fake email if applicable
  IF NEW.email LIKE '%@telemed-paciente.com' THEN
    extracted_dni := SPLIT_PART(NEW.email, '@', 1);
  ELSE
    extracted_dni := NEW.raw_user_meta_data->>'dni';
  END IF;

  extracted_role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');

  INSERT INTO public.profiles (
    id, 
    full_name, 
    email, 
    avatar_url, 
    role, 
    dni, 
    phone,
    is_dni_verified -- Auto-verify for demo purposes so hash is generated
  )
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    extracted_role,
    extracted_dni,
    NEW.raw_user_meta_data->>'phone',
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    dni = COALESCE(profiles.dni, EXCLUDED.dni),
    phone = COALESCE(profiles.phone, EXCLUDED.phone),
    role = EXCLUDED.role;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure trigger is re-linked (just in case)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
