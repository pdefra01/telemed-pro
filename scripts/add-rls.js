import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const dbUrl = process.env.DATABASE_URL;

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

const schema = `
  -- Permitir a los usuarios leer cualquier perfil (para ver a los medicos, etc)
  CREATE POLICY "Permitir lectura publica de perfiles" ON public.profiles
    FOR SELECT USING (true);

  -- Permitir a los usuarios insertar SU PROPIO perfil
  CREATE POLICY "Permitir insercion del propio perfil" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

  -- Permitir a los usuarios actualizar SU PROPIO perfil
  CREATE POLICY "Permitir actualizacion del propio perfil" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);
    
  -- Permitir leer turnos propios (paciente o medico)
  CREATE POLICY "Permitir lectura de turnos propios" ON public.appointments
    FOR SELECT USING (auth.uid() = patient_id OR auth.uid() = doctor_id);
`;

async function addRls() {
  try {
    console.log("⏳ Agregando politicas RLS...");
    await client.connect();
    await client.query(schema);
    console.log("✅ Politicas RLS agregadas con exito!");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await client.end();
  }
}

addRls();