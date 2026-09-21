// server/resendActivation.js
//
// Admin action: resend the activation email to an affiliate who was approved
// but never set a password (e.g. the first email failed). Extracted from
// server.js so it can be unit-tested (server.js calls app.listen at import).

import { sendActivationEmail as defaultSendActivationEmail } from './affiliateActivation.js';

export const RESEND_COOLDOWN_MS = 60_000;

const PLACEHOLDER_DOMAIN = '@medinex-paciente.com';

/** True for the `<dni>@medinex-paciente.com` address used when no real email was given. */
export function isPlaceholderEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(PLACEHOLDER_DOMAIN);
}

const FAILURE_MESSAGES = {
  missing_public_app_url: 'Falta configurar PUBLIC_APP_URL en el servidor: no se puede armar el enlace de activación.',
  generate_link_failed: 'No se pudo generar el enlace de activación. Intentá de nuevo en unos minutos.',
  send_failed: 'No se pudo enviar el mail. Revisá la configuración SMTP del servidor.',
};

/**
 * POST /api/resend-activation  (requireAuth, requireAdmin)
 * Body: { profileId }. Cooldown is per profile, in memory, and only starts
 * after a successful send (failed sends deliver nothing, so no spam risk).
 */
export function resendActivationHandler({
  supabaseAdmin,
  createMailTransporter,
  fromAddress,
  publicAppUrl,
  sendActivationEmail = defaultSendActivationEmail,
  now = Date.now,
  cooldownMs = RESEND_COOLDOWN_MS,
}) {
  const lastSentAt = new Map();

  return async function resendActivation(req, res) {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Servicio de administración no configurado.' });
    }

    const profileId = req.body?.profileId;
    if (typeof profileId !== 'string' || !profileId.trim()) {
      return res.status(400).json({ error: 'Falta el identificador del afiliado.' });
    }

    const adminId = req.user?.id;

    try {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.getUserById(profileId);
      const email = authData?.user?.email;
      if (authErr || !authData?.user) {
        return res.status(404).json({ error: 'Afiliado no encontrado.' });
      }

      const { data: profile, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('id,role,full_name')
        .eq('id', profileId)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile) {
        return res.status(404).json({ error: 'Afiliado no encontrado.' });
      }
      if (profile.role !== 'patient') {
        return res.status(400).json({ error: 'Sólo se puede reenviar el mail de activación a afiliados.' });
      }

      if (!email || isPlaceholderEmail(email)) {
        return res.status(400).json({
          error: 'Este afiliado no tiene un email real cargado. Editá el email del perfil antes de reenviar el mail de activación.',
        });
      }

      const previous = lastSentAt.get(profileId);
      const elapsed = previous === undefined ? Infinity : now() - previous;
      if (elapsed < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
        return res.status(429).json({
          error: `Ya se envió un mail hace instantes. Esperá ${retryAfterSeconds} segundos para reenviarlo.`,
          retryAfterSeconds,
        });
      }

      const result = await sendActivationEmail(
        { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
        { email, fullName: profile.full_name || '' }
      );

      if (!result?.sent) {
        const reason = result?.reason || 'send_failed';
        console.error(`[resend-activation] Failed (${reason}) admin=${adminId} profile=${profileId}`);
        return res.status(502).json({
          ok: false,
          reason,
          error: FAILURE_MESSAGES[reason] || FAILURE_MESSAGES.send_failed,
        });
      }

      lastSentAt.set(profileId, now());
      console.log(`[resend-activation] Activation email resent admin=${adminId} profile=${profileId}`);
      return res.status(200).json({ ok: true, sent: true });
    } catch (err) {
      console.error(`[resend-activation] Unexpected error admin=${adminId} profile=${profileId}:`, err?.message || String(err));
      return res.status(500).json({ error: 'No se pudo reenviar el mail de activación.' });
    }
  };
}
