-- Migration: Seed Staff Members (Doctor and Admin)
-- Description: Updates the auth trigger and inserts initial staff users for testing.

-- 1. Actualizar el trigger para soportar especialidad y ser más robusto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  extracted_dni TEXT;
  extracted_role TEXT;
BEGIN
  -- Extraer DNI si es paciente
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
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    dni = COALESCE(profiles.dni, EXCLUDED.dni),
    phone = COALESCE(profiles.phone, EXCLUDED.phone),
    role = EXCLUDED.role,
    specialty = COALESCE(profiles.specialty, EXCLUDED.specialty);
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Insertar Médico de Prueba
-- Nota: Usamos auth.users directamente. La contraseña es 'medico123'
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES (
  'd69486c0-6d9b-4e1a-8c90-0c6a8f7b8c90',
  '00000000-0000-0000-0000-000000000000',
  'medico@telemed.com',
  crypt('medico123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Dr. Pablo Médico","role":"doctor","specialty":"Cardiología"}',
  now(),
  now(),
  'authenticated',
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- 3. Insertar Administrativo de Prueba
-- Nota: La contraseña es 'admin123'
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES (
  'a1234567-b89c-4d0e-9f0a-1b2c3d4e5f6g',
  '00000000-0000-0000-0000-000000000000',
  'admin@telemed.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Admin Telemed","role":"admin"}',
  now(),
  now(),
  'authenticated',
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;
