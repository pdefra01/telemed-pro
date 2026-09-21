// server/adhesionEmail.js
//
// Admin correction of the applicant email on a pending adhesion request.
// Extracted from server.js so it can be unit-tested (server.js calls
// app.listen at import).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims + lowercases; returns null when the value is not a valid email. */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

/** 'juan@test.com' -> 'j***@test.com' (for logs). */
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

const IN_USE_MESSAGE = 'Ese email ya pertenece a otra cuenta. Ingresá otro email.';

/**
 * PATCH /api/adhesion-requests/:id/email  (requireAuth, requireAdmin)
 * Body: { email }. Only pending requests; rejects emails already used by a
 * profile or an auth user. Does not touch Mercado Pago subscription rows.
 */
export function updateAdhesionEmailHandler({ supabaseAdmin }) {
  return async function updateAdhesionEmail(req, res) {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Servicio de administración no configurado.' });
    }

    const id = req.params?.id;
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'Ingresá un email válido.' });
    }

    try {
      const { data: request, error: readErr } = await supabaseAdmin
        .from('adhesion_requests')
        .select('id,status,titular_email')
        .eq('id', id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!request) {
        return res.status(404).json({ error: 'Solicitud no encontrada.' });
      }
      if (request.status !== 'pending') {
        return res.status(409).json({ error: 'Solo se puede editar el email de solicitudes pendientes.' });
      }

      const current = String(request.titular_email || '').trim().toLowerCase();
      if (current === email) {
        return res.status(200).json({ ok: true, email, changed: false });
      }

      // profiles.email, case-insensitive; escape LIKE wildcards ('_' is valid in emails).
      const pattern = email.replace(/[%_\\]/g, (c) => String.fromCharCode(92) + c);
      const { data: profileMatches, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', pattern)
        .limit(1);
      if (profileErr) throw profileErr;
      if ((profileMatches || []).length > 0) {
        return res.status(409).json({ error: IN_USE_MESSAGE });
      }

      // auth.users (supabase-js has no get-by-email): service-role-only RPC.
      const { data: inAuth, error: authErr } = await supabaseAdmin.rpc('email_in_use', { p_email: email });
      if (authErr) throw authErr;
      if (inAuth === true) {
        return res.status(409).json({ error: IN_USE_MESSAGE });
      }

      // The new address is unverified, so the verification flag is reset.
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('adhesion_requests')
        .update({ titular_email: email, email_verified: false })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');
      if (updateErr) throw updateErr;
      if (!updated || updated.length === 0) {
        return res.status(409).json({ error: 'Solo se puede editar el email de solicitudes pendientes.' });
      }

      console.log(`[adhesion-email] admin=${req.user?.id} request=${id} ${maskEmail(request.titular_email)} -> ${maskEmail(email)}`);
      return res.status(200).json({ ok: true, email, changed: true });
    } catch (err) {
      console.error('[adhesion-email] Unexpected error:', err);
      return res.status(500).json({ error: 'Error interno al actualizar el email.' });
    }
  };
}
