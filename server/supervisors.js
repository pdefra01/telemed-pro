// server/supervisors.js
//
// Supervisor provisioning (odd/tasks/commercial-crm.md, S3, S7). Same
// convention as server/advisors.js: the business logic lives here so it can be
// unit-tested, and server.js keeps only the routing and the auth gates.
import { applyProfileAccess } from './profileAccess.js';

/**
 * POST /api/create-supervisor (admin only).
 *
 * Creates the auth user, grants the `supervisor` role and stores the name. A
 * failure after the auth user exists removes it, so no half-created account
 * is left behind. Assigning advisors to the supervisor is a separate admin
 * action on profiles.supervisor_id (validated by a database trigger).
 */
export async function createSupervisorHandler(supabaseAdmin, req, res) {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Servicio de autenticación no disponible temporalmente.' });
    }

    const { email, password, firstName, lastName, phone } = req.body || {};

    // Trimmed values are tested so a whitespace-only value cannot pass.
    if (!email?.trim() || !password || !firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para dar de alta al supervisor.' });
    }

    const first = firstName.trim();
    const last = lastName.trim();

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: `${first} ${last}` },
    });

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    const userId = created.user.id;

    // On failure applyProfileAccess already deletes the auth user.
    const access = await applyProfileAccess(supabaseAdmin, userId, { role: 'supervisor', isActive: true });
    if (!access.ok) {
      return res.status(500).json({ error: 'Error al asignar el rol de supervisor.' });
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: first,
        last_name: last,
        phone: phone?.trim() || null,
      })
      .eq('id', userId);

    if (profileError) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (rollbackError) {
        console.error('CRITICAL: rollback failed, orphaned supervisor auth user may remain:', rollbackError);
      }
      return res.status(500).json({ error: 'Error al guardar el perfil del supervisor.' });
    }

    return res.status(201).json({ success: true, id: userId });
  } catch (err) {
    console.error('[create-supervisor] Error inesperado:', err);
    return res.status(500).json({ error: 'Error interno en el servidor.' });
  }
}
