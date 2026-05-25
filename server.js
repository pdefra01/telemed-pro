import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env variables only if not in production
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(__dirname, '.env.local') });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Health check endpoint for Coolify
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Serve static files from Vite build
const distPath = resolve(__dirname, 'dist');
app.use(express.static(distPath));

const apiKey = process.env.LIVEKIT_API_KEY?.trim();
const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

if (!apiKey || !apiSecret) {
  console.warn("⚠️ WARNING: Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in environment. Video tokens will fail.");
}

// --- Supabase Admin Client (uses service role key, NEVER exposed to frontend) ---
// VITE_SUPABASE_URL is a Docker build arg and not available at runtime.
// The project URL is not sensitive so we use it directly.
const supabaseUrl = process.env.SUPABASE_URL || 'https://fevdxgmtrhvwiuulopcf.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`[Supabase] URL: ${supabaseUrl}`);
console.log(`[Supabase] Service role key present: ${!!serviceRoleKey}`);

let supabaseAdmin = null;
if (supabaseUrl && serviceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  console.log("✅ Supabase Admin client initialized.");
} else {
  console.warn("⚠️ WARNING: Missing SUPABASE_SERVICE_ROLE_KEY. Staff creation endpoint will fail.");
}

// Rechazar métodos distintos a POST explícitamente
app.all('/api/livekit-token', (req, res, next) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  next();
});

const APPOINTMENT_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post('/api/livekit-token', async (req, res) => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId is required' });
    }

    if (!APPOINTMENT_ID_REGEX.test(appointmentId)) {
      return res.status(400).json({ error: 'Invalid appointmentId format' });
    }

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'LiveKit server configuration is incomplete' });
    }

    const participantName = `User-${Math.floor(Math.random() * 1000)}`;
    const roomName = `room-${appointmentId}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
    });

    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();

    res.json({ token, roomName });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/create-staff
 * Crea un nuevo usuario de staff (médico o admin) en Supabase Auth.
 * El trigger handle_new_user crea automáticamente el perfil en public.profiles.
 * 
 * Body: { email, password, full_name, role, specialty? }
 */
app.post('/api/create-staff', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email, password, full_name, role, specialty } = req.body;

  // Validaciones básicas
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Campos requeridos: email, password, full_name, role.' });
  }

  if (!['doctor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Debe ser "doctor" o "admin".' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const metadata = { full_name, role };
    if (specialty) metadata.specialty = specialty;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirma el email para que el médico pueda ingresar de inmediato
      user_metadata: metadata,
    });

    if (error) {
      console.error('[create-staff] Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[create-staff] Usuario ${role} creado: ${email} (${data.user.id})`);
    res.status(201).json({ id: data.user.id, email: data.user.email });
  } catch (err) {
    console.error('[create-staff] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Catch-all middleware to serve index.html for SPA routing
// This is the most compatible way for Express 5
app.use((req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TeleMed Pro corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`📁 Sirviendo archivos estáticos desde: ${distPath}`);
  }
});