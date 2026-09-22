import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Creando usuario de prueba...');
  const email = '35123456@medinex-paciente.com';
  const password = '123456';
  const fullName = 'Carlos Gutiérrez';
  const dni = '35123456';

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'patient',
        dni,
      }
    }
  });

  if (error) {
    if (error.message.includes('already registered')) {
      console.log('El usuario ya existía en Auth. Intentando login...');
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) {
        console.error('Error de login:', loginError.message);
      } else {
        console.log('Usuario existente verificado con éxito. ID:', loginData.user.id);
      }
    } else {
      console.error('Error al registrar usuario:', error);
    }
  } else {
    console.log('✅ Usuario de prueba creado con éxito!');
    console.log('User ID:', data.user?.id);
  }
}

main();
