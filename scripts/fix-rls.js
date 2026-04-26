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
  -- Permitir a pacientes y medicos insertar turnos donde ellos participan
  CREATE POLICY "Permitir insercion de turnos propios" ON public.appointments
    FOR INSERT WITH CHECK (auth.uid() = patient_id OR auth.uid() = doctor_id);
`;

async function fixRls() {
  try {
    console.log("⏳ Agregando politica INSERT a appointments...");
    await client.connect();
    await client.query(schema);
    console.log("✅ Politica INSERT agregada con exito!");
  } catch (error) {
    // Si ya existe la política, ignoramos el error
    if (error.code === '42710') {
        console.log("✅ La politica ya existía.");
    } else {
        console.error("❌ Error:", error.message);
    }
  } finally {
    await client.end();
  }
}

fixRls();