-- Migration: Patient Activation Flow
-- Description: Updates the user registration trigger to set patients as inactive (is_active = FALSE) by default, unless they are provisioned by an admin (is_active: true is passed in metadata) or their role is not 'patient'.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  extracted_dni TEXT;
  extracted_role TEXT;
  is_active_val BOOLEAN;
BEGIN
  -- Extraer DNI si es paciente
  IF NEW.email LIKE '%@telemed-paciente.com' OR NEW.email LIKE '%@medinex-paciente.com' THEN
    extracted_dni := SPLIT_PART(NEW.email, '@', 1);
  ELSE
    extracted_dni := NEW.raw_user_meta_data->>'dni';
  END IF;

  extracted_role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');

  -- Los médicos y administradores son activos por defecto.
  -- Los pacientes son inactivos (requieren aprobación) a menos que se especifique is_active = true en metadata (alta por admin).
  IF extracted_role <> 'patient' THEN
    is_active_val := TRUE;
  ELSE
    is_active_val := COALESCE((NEW.raw_user_meta_data->>'is_active')::boolean, FALSE);
  END IF;

  INSERT INTO public.profiles (
    id, 
    full_name, 
    email, 
    avatar_url, 
    role, 
    dni, 
    phone,
    is_dni_verified,
    specialty,
    is_active
  )
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuario Nuevo'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    extracted_role,
    extracted_dni,
    NEW.raw_user_meta_data->>'phone',
    TRUE,
    NEW.raw_user_meta_data->>'specialty',
    is_active_val
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    dni = COALESCE(profiles.dni, EXCLUDED.dni),
    phone = COALESCE(profiles.phone, EXCLUDED.phone),
    role = EXCLUDED.role,
    specialty = COALESCE(profiles.specialty, EXCLUDED.specialty),
    is_active = EXCLUDED.is_active;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
