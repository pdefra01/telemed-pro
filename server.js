import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import nodemailer from 'nodemailer';


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

/**
 * POST /api/create-patient
 * Crea un nuevo usuario paciente en Supabase Auth.
 * Si el email no se proporciona, autogenera uno basado en el DNI ([DNI]@medinex-paciente.com).
 * El trigger handle_new_user crea automáticamente el perfil en public.profiles.
 */
app.post('/api/create-patient', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email, password, full_name, dni, phone, address } = req.body;

  if (!full_name || !dni || !password) {
    return res.status(400).json({ error: 'Campos requeridos: full_name, dni, password.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const targetEmail = email || `${dni.trim()}@medinex-paciente.com`;
    
    const metadata = { 
      full_name, 
      role: 'patient',
      dni: dni.trim(),
      is_active: true
    };
    if (phone) metadata.phone = phone;
    if (address) metadata.address = address;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      console.error('[create-patient] Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[create-patient] Paciente creado: ${targetEmail} (${data.user.id})`);
    res.status(201).json({ id: data.user.id, email: data.user.email, dni: dni.trim() });
  } catch (err) {
    console.error('[create-patient] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/create-patient-bulk
 * Crea múltiples pacientes en Supabase Auth a partir de un array de JSON.
 * Procesa en lotes secuenciales de a 5 para evitar rate limits de la API de autenticación.
 */
app.post('/api/create-patient-bulk', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const patients = req.body;

  if (!Array.isArray(patients)) {
    return res.status(400).json({ error: 'El cuerpo de la petición debe ser un array de pacientes.' });
  }

  console.log(`[create-patient-bulk] Iniciando importación masiva de ${patients.length} pacientes...`);

  const results = {
    summary: { total: patients.length, success: 0, failed: 0 },
    successful: [],
    failures: []
  };

  const createSinglePatient = async (patient, index) => {
    const { name, email, dni, phone, address, password } = patient;

    if (!name || !dni) {
      results.failures.push({
        index,
        dni: dni || 'S/D',
        name: name || 'S/N',
        error: 'Campos obligatorios faltantes: name o dni.'
      });
      results.summary.failed++;
      return;
    }

    const targetPassword = password || dni.trim();
    if (targetPassword.length < 6) {
      results.failures.push({
        index,
        dni: dni.trim(),
        name,
        error: 'La contraseña (o DNI fallback) debe tener al menos 6 caracteres.'
      });
      results.summary.failed++;
      return;
    }

    const targetEmail = email || `${dni.trim()}@medinex-paciente.com`;

    try {
      const metadata = {
        full_name: name,
        role: 'patient',
        dni: dni.trim(),
        is_active: true
      };
      if (phone) metadata.phone = phone;
      if (address) metadata.address = address;

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        password: targetPassword,
        email_confirm: true,
        user_metadata: metadata
      });

      if (error) {
        results.failures.push({
          index,
          dni: dni.trim(),
          name,
          error: error.message
        });
        results.summary.failed++;
      } else {
        results.successful.push({
          dni: dni.trim(),
          id: data.user.id
        });
        results.summary.success++;
      }
    } catch (err) {
      results.failures.push({
        index,
        dni: dni.trim(),
        name,
        error: err.message || 'Error inesperado.'
      });
      results.summary.failed++;
    }
  };

  try {
    const batchSize = 5;
    for (let i = 0; i < patients.length; i += batchSize) {
      const batch = patients.slice(i, i + batchSize);
      await Promise.all(batch.map((p, idx) => createSinglePatient(p, i + idx)));
    }

    console.log(`[create-patient-bulk] Importación finalizada. Éxito: ${results.summary.success}, Fallidos: ${results.summary.failed}`);
    res.status(207).json(results);
  } catch (err) {
    console.error('[create-patient-bulk] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor al procesar el lote.' });
  }
});

/**
 * POST /api/reset-user-password
 * Restablece la contraseña de cualquier usuario (médico o paciente) en Supabase Auth de forma administrativa.
 */
app.post('/api/reset-user-password', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'Campos requeridos: userId, newPassword.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) {
      console.error('[reset-user-password] Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[reset-user-password] Contraseña restablecida exitosamente para usuario ID: ${userId}`);
    res.status(200).json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error('[reset-user-password] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * Build a Nodemailer transporter.
 * Priority:
 *   1. SMTP_HOST env vars (production corporate account)
 *   2. Ethereal fake SMTP (automatic dev fallback — preview URL logged to console)
 */
async function createMailTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true = TLS 465, false = STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // Dev fallback: Ethereal (generates a free disposable inbox)
  const testAccount = await nodemailer.createTestAccount();
  console.log('[Mailer] Using Ethereal test account:', testAccount.user);
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
}

const FROM_ADDRESS = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@medinex.com';

/**
 * POST /api/email-verification/send
 * Genera un código OTP para el correo del pre-afiliado
 */
app.post('/api/email-verification/send', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'El campo email es requerido.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const { error } = await supabaseAdmin
      .from('contact_verifications')
      .insert({
        channel: 'email',
        contact_value: cleanEmail,
        otp_code: otpCode,
        attempts: 0,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      });

    if (error) {
      console.error('[email-verification/send] Error inserting verification:', error.message);
      return res.status(500).json({ error: `Fallo al generar el código: ${error.message}` });
    }

    // Send OTP via email using Nodemailer
    try {
      const transporter = await createMailTransporter();
      const info = await transporter.sendMail({
        from: `"Medinex" <${FROM_ADDRESS}>`,
        to: cleanEmail,
        subject: 'Tu código de verificación — Medinex',
        text: `Tu código de verificación es: ${otpCode}\n\nVálido por 15 minutos. Si no solicitaste este código, ignorá este mensaje.`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #10b981, #0d9488); padding: 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; letter-spacing: 0.05em;">MED<span style="color: #fff;">IN</span>EX</h1>
              <p style="margin: 4px 0 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.8;">Salud Digital</p>
            </div>
            <div style="padding: 40px 32px;">
              <h2 style="margin: 0 0 8px; font-size: 20px; color: #f1f5f9;">Verificación de correo electrónico</h2>
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Ingresá el siguiente código en el formulario de adhesión para verificar tu correo.</p>
              <div style="margin: 32px 0; text-align: center; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px;">
                <span style="font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #10b981; font-family: monospace;">${otpCode}</span>
              </div>
              <p style="color: #64748b; font-size: 12px; text-align: center;">Este código vence en <strong>15 minutos</strong>. Si no solicitaste este código, ignorá este mensaje.</p>
            </div>
            <div style="border-top: 1px solid #1e293b; padding: 16px 32px; text-align: center;">
              <p style="color: #475569; font-size: 11px; margin: 0;">Medinex &mdash; Plataforma de Salud Digital</p>
            </div>
          </div>
        `,
      });

      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[Mailer][DEV] Preview OTP email: ${previewUrl}`);
      } else {
        console.log(`[Mailer] OTP enviado a ${cleanEmail} via SMTP.`);
      }
    } catch (mailErr) {
      console.error('[email-verification/send] Fallo al enviar email:', mailErr.message);
      // OTP ya insertado en DB — loguear código en dev para no bloquear el flujo
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Mailer][DEV FALLBACK] OTP para ${cleanEmail}: ${otpCode}`);
      } else {
        // En producción, eliminar el OTP si no pudo enviarse
        await supabaseAdmin.from('contact_verifications').delete().eq('contact_value', cleanEmail).is('verified_at', null);
        return res.status(500).json({ error: 'No se pudo enviar el código. Intentá nuevamente.' });
      }
    }

    res.status(200).json({ success: true, message: 'Código enviado exitosamente.' });
  } catch (err) {
    console.error('[email-verification/send] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno al generar código OTP.' });
  }
});


/**
 * POST /api/email-verification/verify
 * Valida el código OTP enviado al correo del pre-afiliado
 */
app.post('/api/email-verification/verify', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Faltan los campos email y code.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  try {
    // Buscar desafío activo más reciente
    const { data: challenges, error } = await supabaseAdmin
      .from('contact_verifications')
      .select('*')
      .eq('contact_value', cleanEmail)
      .eq('channel', 'email')
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !challenges || challenges.length === 0) {
      return res.status(400).json({ error: 'El código ha expirado o no existe. Solicitá uno nuevo.' });
    }

    const challenge = challenges[0];

    if (challenge.attempts >= 5) {
      return res.status(400).json({ error: 'Superaste el número máximo de intentos. Solicitá un nuevo código.' });
    }

    if (challenge.otp_code === cleanCode) {
      // Marcar desafío como verificado
      await supabaseAdmin
        .from('contact_verifications')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', challenge.id);

      res.status(200).json({ success: true, message: 'Correo verificado con éxito.' });
    } else {
      // Incrementar intentos fallidos
      await supabaseAdmin
        .from('contact_verifications')
        .update({ attempts: challenge.attempts + 1 })
        .eq('id', challenge.id);

      res.status(400).json({ error: 'Código incorrecto.' });
    }
  } catch (err) {
    console.error('[email-verification/verify] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno al validar código OTP.' });
  }
});

/**
 * POST /api/approve-adhesion
 * Aprueba una solicitud de adhesión. Crea el usuario paciente en Supabase Auth,
 * inicializa su perfil, crea su grupo familiar (si tiene) e integrantes,
 * y marca la solicitud como 'approved'.
 */
app.post('/api/approve-adhesion', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { adhesionId } = req.body;
  if (!adhesionId) {
    return res.status(400).json({ error: 'Falta el campo adhesionId.' });
  }

  try {
    // 1. Obtener la solicitud
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*')
      .eq('id', adhesionId)
      .single();

    if (fetchError || !request) {
      console.error('[approve-adhesion] Error fetching application:', fetchError);
      return res.status(404).json({ error: 'Solicitud de adhesión no encontrada.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `La solicitud ya se encuentra en estado: ${request.status}` });
    }

    // Validar que el email de la solicitud esté verificado
    if (!request.email_verified) {
      return res.status(400).json({ error: 'No se puede aprobar una solicitud que no tiene el correo electrónico verificado.' });
    }

    // 2. Crear usuario paciente en Supabase Auth
    const targetEmail = request.titular_email?.trim() || `${request.titular_dni.trim()}@medinex-paciente.com`;
    const password = request.titular_dni.trim(); // DNI como contraseña temporal
    
    const titularFullName = `${request.titular_first_name || ''} ${request.titular_last_name || ''}`.trim() || request.titular_name;

    console.log(`[approve-adhesion] Creando usuario auth para: ${targetEmail}`);
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: targetEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        role: 'patient',
        full_name: titularFullName,
        dni: request.titular_dni.trim()
      }
    });

    if (authError) {
      console.error('[approve-adhesion] Auth creation failed:', authError.message);
      return res.status(400).json({ error: `Error en autenticación: ${authError.message}` });
    }

    const userId = authData.user.id;

    // 3. Actualizar perfil del Paciente en public.profiles (que se autogeneró por trigger)
    console.log(`[approve-adhesion] Actualizando perfil del titular: ${userId}`);
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: request.titular_first_name || split_part(request.titular_name, ' ', 1),
        last_name: request.titular_last_name || substring(request.titular_name, ' ', 2),
        email: targetEmail,
        dni: request.titular_dni.trim(),
        phone: request.titular_phone,
        address: request.titular_address,
        birth_date: request.titular_birth_date,
        plan_name: request.plan_type || 'Plan Familiar',
        plan_status: 'active',
        payment_status: 'paid',
        is_active: true
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[approve-adhesion] Profile update failed:', profileError.message);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: `Error al crear el perfil: ${profileError.message}` });
    }

    // 4. Crear grupo familiar si la solicitud contiene integrantes
    const familyMembersList = Array.isArray(request.family_members) ? request.family_members : [];
    if (familyMembersList.length > 0) {
      console.log(`[approve-adhesion] Procesando grupo familiar (${familyMembersList.length} miembros)...`);
      
      const { data: famGroup, error: famGroupError } = await supabaseAdmin
        .from('family_groups')
        .insert({
          primary_affiliate_id: userId,
          name: `Familia de ${titularFullName}`
        })
        .select()
        .single();

      if (famGroupError) {
        console.error('[approve-adhesion] family_groups creation failed:', famGroupError.message);
      } else {
        const familyGroupId = famGroup.id;
        
        await supabaseAdmin
          .from('profiles')
          .update({ family_group_id: familyGroupId })
          .eq('id', userId);

        const insertMembers = familyMembersList.map(member => {
          let relation = 'otro';
          const relLower = (member.parentesco || '').toLowerCase();
          if (relLower.includes('conyuge') || relLower.includes('cónyuge') || relLower.includes('espos')) relation = 'cónyuge';
          else if (relLower.includes('hijo') || relLower.includes('hija')) relation = 'hijo/a';
          else if (relLower.includes('padre') || relLower.includes('madre') || relLower.includes('papá') || relLower.includes('mamá')) relation = 'padre/madre';
          else if (relLower.includes('hermano') || relLower.includes('hermana')) relation = 'hermano/a';
          
          const rawName = member.name || member.fullName || 'Familiar de Prueba';
          const fName = member.first_name || member.firstName || rawName.split(' ')[0];
          const lName = member.last_name || member.lastName || rawName.split(' ').slice(1).join(' ');

          return {
            family_group_id: familyGroupId,
            first_name: fName,
            last_name: lName,
            relation: relation,
            birth_date: member.birthDate || member.fechaNac || null,
            dni: member.dni ? String(member.dni).trim() : null
          };
        });

        const { error: membersError } = await supabaseAdmin
          .from('family_members')
          .insert(insertMembers);

        if (membersError) {
          console.error('[approve-adhesion] family_members insertion failed:', membersError.message);
        }
      }
    }

    // 5. Marcar la solicitud como aprobada
    console.log(`[approve-adhesion] Marcando solicitud como aprobada...`);
    await supabaseAdmin
      .from('adhesion_requests')
      .update({ status: 'approved' })
      .eq('id', adhesionId);

    console.log(`[approve-adhesion] Solicitud aprobada con éxito para titular: ${targetEmail}`);
    res.status(200).json({ message: 'Solicitud aprobada exitosamente y paciente registrado.', userId });
  } catch (err) {
    console.error('[approve-adhesion] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * Middleware para validar autenticación JWT de Supabase
 */
const requireAuth = async (req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token de autenticación inválido o expirado.' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('[requireAuth] Authentication error:', err.message);
    return res.status(401).json({ error: 'Fallo de autenticación.' });
  }
};

/**
 * GET /api/advisor/stats
 * Devuelve indicadores de ventas y comisiones acumuladas del asesor comercial autenticado
 */
app.get('/api/advisor/stats', requireAuth, async (req, res) => {
  try {
    // 1. Obtener promoter_code del perfil
    const { data: profile, error: profError } = await supabaseAdmin
      .from('profiles')
      .select('promoter_code')
      .eq('id', req.user.id)
      .single();
    
    if (profError || !profile || !profile.promoter_code) {
      return res.status(200).json({
        totalSales: 0,
        approvedSales: 0,
        pendingSales: 0,
        commissions: 0,
        linksSharedCount: 0,
        sales: []
      });
    }

    const promoterCode = profile.promoter_code;

    // 2. Obtener solicitudes de adhesion (limitadas a las 100 más recientes para evitar cargas masivas)
    const { data: sales, error: salesError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('id, titular_name, titular_dni, plan_type, status, created_at')
      .eq('promoter_id', promoterCode)
      .order('created_at', { ascending: false })
      .limit(100);

    if (salesError) throw salesError;

    // 3. Obtener totales reales sin límite (para métricas precisas)
    const { count: totalCount } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('promoter_id', promoterCode);

    const { count: approvedCount } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('promoter_id', promoterCode)
      .eq('status', 'approved');

    const { count: pendingCount } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('promoter_id', promoterCode)
      .eq('status', 'pending');

    // 4. Obtener links_shared_count y commission_rate desde producers
    const { data: producer } = await supabaseAdmin
      .from('producers')
      .select('links_shared_count, commission_rate')
      .eq('id', req.user.id)
      .maybeSingle();

    const linksSharedCount = producer?.links_shared_count || 0;
    const commissionRate = producer?.commission_rate ?? 10;
    const approvedSales = approvedCount || 0;
    const commissions = approvedSales * 10000 * (commissionRate / 10); // base $10k * tasa proporcional

    res.status(200).json({
      totalSales: totalCount || 0,
      approvedSales,
      pendingSales: pendingCount || 0,
      commissions,
      linksSharedCount,
      sales: sales || []
    });
  } catch (err) {
    console.error('[advisor/stats] Error:', err);
    res.status(500).json({ error: 'Error al recuperar estadísticas de venta.' });
  }
});

/**
 * POST /api/advisor/increment-share
 * Incrementa en 1 el contador de enlaces compartidos del asesor autenticado
 */
app.post('/api/advisor/increment-share', requireAuth, async (req, res) => {
  try {
    // Role check via JWT metadata (already validated by requireAuth — no extra DB query needed)
    const role = req.user.user_metadata?.role;
    if (role !== 'advisor') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de asesor comercial.' });
    }

    // Atomic increment via direct RPC call — PostgreSQL handles the increment server-side
    const { data: newCount, error: rpcErr } = await supabaseAdmin
      .rpc('increment_links_shared', { row_id: req.user.id });

    if (rpcErr) {
      // Fallback: verify row exists, then do a safe read-then-write
      const { data: existing, error: checkErr } = await supabaseAdmin
        .from('producers')
        .select('links_shared_count')
        .eq('id', req.user.id)
        .maybeSingle();

      if (checkErr || !existing) {
        return res.status(404).json({ error: 'Ficha comercial de asesor no encontrada.' });
      }

      const { error: fallbackErr, data: fallbackData } = await supabaseAdmin
        .from('producers')
        .update({ links_shared_count: (existing.links_shared_count || 0) + 1 })
        .eq('id', req.user.id)
        .select('links_shared_count')
        .single();

      if (fallbackErr) throw fallbackErr;
      return res.status(200).json({ success: true, linksSharedCount: fallbackData.links_shared_count });
    }

    if (newCount === null || newCount === undefined) {
      return res.status(404).json({ error: 'Ficha comercial de asesor no encontrada.' });
    }

    res.status(200).json({ success: true, linksSharedCount: newCount });
  } catch (err) {
    console.error('[advisor/increment-share] Error:', err);
    res.status(500).json({ error: 'Error al registrar compartición de enlace.' });
  }
});


/**
 * GET /api/announcements
 * Lista todos los comunicados oficiales mapeando la bandera de leído/no leído
 */
app.get('/api/announcements', requireAuth, async (req, res) => {
  try {
    const { data: announcements, error: annError } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (annError) throw annError;

    const { data: reads, error: readsError } = await supabaseAdmin
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', req.user.id);

    if (readsError) throw readsError;

    const readIds = new Set((reads || []).map(r => r.announcement_id));

    const enrichedAnnouncements = announcements.map(ann => ({
      ...ann,
      read: readIds.has(ann.id)
    }));

    res.status(200).json(enrichedAnnouncements);
  } catch (err) {
    console.error('[announcements] Error:', err);
    res.status(500).json({ error: 'Error al recuperar comunicados.' });
  }
});

/**
 * POST /api/announcements/:id/read
 * Marca un comunicado como leído para el asesor autenticado
 */
app.post('/api/announcements/:id/read', requireAuth, async (req, res) => {
  const { id: announcementId } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('announcement_reads')
      .upsert(
        { announcement_id: announcementId, user_id: req.user.id },
        { onConflict: 'announcement_id,user_id' }
      );

    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[announcements/read] Error:', err);
    res.status(500).json({ error: 'Error al marcar comunicado como leído.' });
  }
});

// Alta y provisión automatizada de asesores comerciales (OCC Admin Only)
app.post('/api/create-advisor', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Servicio de autenticación no disponible temporalmente.' });
    }

    // 1. Validar rol de administrador del emisor
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    const role = profile?.role || req.user.user_metadata?.role;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }

    const { email, password, firstName, lastName, promoterCode, dni, phone, address } = req.body;

    // 2. Validaciones de campos requeridos
    if (!email || !password || !firstName || !lastName || !promoterCode || !dni || !phone || !address) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para dar de alta al asesor.' });
    }

    const cleanCode = promoterCode.trim().toUpperCase();

    // 3. Validar duplicidad de código de promotor
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('promoter_code', cleanCode)
      .maybeSingle();

    if (existingProfile) {
      return res.status(400).json({ error: `El código de promotor '${cleanCode}' ya se encuentra asignado.` });
    }

    // 4. Crear usuario en Supabase Auth
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const { data: newAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true,
      user_metadata: { role: 'advisor', full_name: fullName }
    });

    if (createUserError) {
      return res.status(400).json({ error: createUserError.message });
    }

    const newUserId = newAuthUser.user.id;

    // 5. Actualizar el perfil del asesor en `profiles`
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'advisor',
        promoter_code: cleanCode,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        dni: dni.trim(),
        phone: phone.trim(),
        address: address.trim(),
        is_active: true
      })
      .eq('id', newUserId);

    if (updateProfileError) {
      // Revertir creación de auth ante fallos
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: 'Error al actualizar el perfil de base de datos del asesor.' });
    }

    // 6. Insertar en tabla comercial `producers`
    const { error: insertProducerError } = await supabaseAdmin
      .from('producers')
      .insert({
        id: newUserId,
        name: fullName,
        producer_code: cleanCode,
        email: email.trim(),
        phone: phone.trim(),
        commission_rate: 10.00, // Comisión fija default 10%
        status: 'active',
        links_shared_count: 0
      });

    if (insertProducerError) {
      // Revertir perfil y auth para consistencia total
      await supabaseAdmin
        .from('profiles')
        .update({ 
          role: 'patient', 
          promoter_code: null,
          first_name: null,
          last_name: null,
          dni: null,
          phone: null,
          address: null
        })
        .eq('id', newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: 'Error al registrar la ficha comercial del productor.' });
    }

    res.status(201).json({ success: true, id: newUserId });
  } catch (err) {
    console.error('[create-advisor] Error inesperado:', err);
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

// Helpers de strings para mapeos robustos
function split_part(str, delim, index) {
  if (!str) return '';
  const parts = str.split(delim);
  return parts[index - 1] || '';
}

function substring(str, delim, startIndex) {
  if (!str) return '';
  const idx = str.indexOf(delim);
  if (idx === -1) return '';
  return str.substring(idx + delim.length);
}

// Catch-all middleware to serve index.html for SPA routing
// This is the most compatible way for Express 5
app.use((req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TeleMed Pro corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`📁 Sirviendo archivos estáticos desde: ${distPath}`);
  }
});