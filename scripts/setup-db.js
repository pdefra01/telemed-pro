import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const { Client } = pg;

// Load variables from .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl || dbUrl.includes('[YOUR-PASSWORD]')) {
  console.error("❌ Error: Necesitás agregar DATABASE_URL en tu .env.local con tu contraseña real.");
  console.error("Ejemplo: DATABASE_URL=postgresql://postgres:MiSuperClave123@db.fevdxgmtrhvwiuulopcf.supabase.co:5432/postgres");
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

const schema = `
  -- 1. Tabla de Perfiles (Extiende a los usuarios de Supabase Auth)
  CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')) DEFAULT 'patient',
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
  );

  -- 2. Tabla de Turnos / Videollamadas
  CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id),
    doctor_id UUID NOT NULL REFERENCES public.profiles(id),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
    livekit_room_name VARCHAR(255) UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
  );

  -- 3. Habilitar RLS (Row Level Security) para mayor seguridad
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

  -- (Las políticas de seguridad específicas las agregamos después para no complicarla ahora)
`;

async function setupDB() {
  try {
    console.log("⏳ Conectando a Supabase PostgreSQL...");
    await client.connect();
    
    console.log("🛠️ Ejecutando migraciones (Creando tablas de Perfiles y Turnos)...");
    await client.query(schema);
    
    console.log("✅ ¡Bases de datos configuradas con éxito! Arquitectura en pie.");
  } catch (error) {
    console.error("❌ Error al configurar la base de datos:", error.message);
  } finally {
    await client.end();
  }
}

setupDB();