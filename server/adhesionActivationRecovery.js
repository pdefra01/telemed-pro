// server/adhesionActivationRecovery.js
//
// Recovery of adhesion activations that crashed after the auth user was
// created (odd/adhesion-activation-recovery). activateAdhesion keeps the
// activation claim on purpose in that case, so the row stays `pending` with a
// claim forever. An admin "releases" it: the orphan account the crashed
// activation created is deleted (only when it is provably that orphan) and
// the claim is cleared, so the normal "Aprobar" can run again.
//
// Returns `{ status, body }` instead of writing to an Express response:
//   200 { released: true, deletedUserId: string | null }
//   400 { error }   invalid id / not pending / no claim to release
//   404 { error }   unknown request
//   409 { error }   claim still fresh, or the account is not safe to delete
//   500 / 503 { error }

import { buildPatientAuthUser } from './affiliateActivation.js';
import { normalizeEmail } from './emailVerification.js';

export const STALE_CLAIM_THRESHOLD_MS = 10 * 60 * 1000;

// Tolerance between the app clock (claim timestamp) and the DB clock
// (profiles.created_at) when deciding the account was created by the claim.
const CLOCK_SKEW_MS = 2 * 60 * 1000;

const PATIENT_ROLE = 'patient';
const LOG = '[adhesion/release-activation]';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when a pending adhesion row holds an activation claim older than the
 * threshold: the activation that took it has crashed or hung.
 *
 * @param {{ status?: string, activation_claimed_at?: string | null } | null} row
 * @param {Date | number} [now]
 * @param {number} [thresholdMs]
 */
export function isActivationClaimStale(row, now = new Date(), thresholdMs = STALE_CLAIM_THRESHOLD_MS) {
  if (!row || row.status !== 'pending' || !row.activation_claimed_at) return false;
  const claimedAt = Date.parse(row.activation_claimed_at);
  if (Number.isNaN(claimedAt)) return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return nowMs - claimedAt >= thresholdMs;
}

/** Escapes LIKE wildcards so `ilike` behaves as a case-insensitive equality. */
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** The email activateAdhesion gives the auth user, normalized. */
function activationEmailFor(row) {
  try {
    return normalizeEmail(buildPatientAuthUser(row).email);
  } catch {
    return normalizeEmail(row.titular_email);
  }
}

function refuse(message) {
  return { status: 409, body: { error: message } };
}

function internalError(step, error) {
  console.error(`${LOG} ${step} failed:`, error?.message || error);
  return { status: 500, body: { error: 'Error interno al liberar la activación.' } };
}

/** Returns true when `table` has at least one row with `column = value`. */
async function hasRows(supabaseAdmin, table, column, value) {
  const { data, error } = await supabaseAdmin.from(table).select('id').eq(column, value).limit(1);
  if (error) throw Object.assign(new Error(error.message), { step: `${table} lookup` });
  return Array.isArray(data) && data.length > 0;
}

/**
 * Checks that the account is the orphan a crashed activation of this request
 * created, and nothing else. Returns a refusal message, or null when safe.
 */
async function unsafeToDeleteReason(supabaseAdmin, profile, claimedAt) {
  if (profile.role !== PATIENT_ROLE) {
    return 'La cuenta existente con ese correo no es de un paciente; no se puede eliminar.';
  }
  const createdAt = Date.parse(profile.created_at);
  if (Number.isNaN(createdAt) || createdAt < Date.parse(claimedAt) - CLOCK_SKEW_MS) {
    return 'La cuenta existente con ese correo es anterior a esta activación; no se puede eliminar.';
  }
  if (await hasRows(supabaseAdmin, 'adhesion_requests', 'approved_profile_id', profile.id)) {
    return 'La cuenta existente con ese correo pertenece a una adhesión aprobada; no se puede eliminar.';
  }
  if (await hasRows(supabaseAdmin, 'appointments', 'patient_id', profile.id)) {
    return 'La cuenta existente con ese correo ya tiene turnos registrados; no se puede eliminar.';
  }
  if (await hasRows(supabaseAdmin, 'medical_records', 'patient_id', profile.id)) {
    return 'La cuenta existente con ese correo ya tiene historia clínica; no se puede eliminar.';
  }
  return null;
}

/**
 * Releases a stuck activation of a pending adhesion request.
 *
 * @param {{ supabaseAdmin: object }} deps
 * @param {string} adhesionId
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function releaseStuckActivation(deps, adhesionId, { now = new Date() } = {}) {
  const { supabaseAdmin } = deps || {};
  if (!supabaseAdmin) {
    return { status: 503, body: { error: 'Servicio de administración no configurado.' } };
  }
  if (typeof adhesionId !== 'string' || !UUID_RE.test(adhesionId)) {
    return { status: 400, body: { error: 'Identificador de solicitud inválido.' } };
  }

  try {
    const { data: row, error: fetchError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('id,status,titular_email,titular_dni,activation_claimed_at')
      .eq('id', adhesionId)
      .maybeSingle();
    if (fetchError) return internalError('Request lookup', fetchError);
    if (!row) return { status: 404, body: { error: 'Solicitud de adhesión no encontrada.' } };

    if (row.status !== 'pending') {
      return { status: 400, body: { error: `La solicitud ya se encuentra en estado: ${row.status}` } };
    }
    if (!row.activation_claimed_at) {
      return { status: 400, body: { error: 'La solicitud no tiene una activación en curso para liberar.' } };
    }
    if (!isActivationClaimStale(row, now)) {
      return refuse('La activación está en curso; reintentá en unos minutos.');
    }

    // The orphan is found through profiles: the new-user trigger creates the
    // profile in the same transaction as the auth user, with the auth email
    // (GoTrue stores it lowercased), and the auth admin API has no lookup by
    // email. `ilike` with escaped wildcards = case-insensitive equality; the
    // exact comparison below guards against any residual pattern match.
    const email = activationEmailFor(row);
    console.log(`${LOG} ${adhesionId}: stale claim (${row.activation_claimed_at}); looking up ${email}`);
    const { data: candidates, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id,role,email,created_at')
      .ilike('email', escapeLike(email));
    if (profileError) return internalError('Profile lookup', profileError);

    const matches = (candidates || []).filter((p) => normalizeEmail(p.email) === email);
    if (matches.length > 1) {
      return refuse('Hay más de una cuenta con ese correo; revisalas manualmente.');
    }

    let deletedUserId = null;
    if (matches.length === 1) {
      const profile = matches[0];
      const reason = await unsafeToDeleteReason(supabaseAdmin, profile, row.activation_claimed_at);
      if (reason) {
        console.log(`${LOG} ${adhesionId}: refusing to delete ${profile.id}: ${reason}`);
        return refuse(reason);
      }

      // Undo what activation created. The MP link would be nulled by the FK
      // (ON DELETE SET NULL) anyway; it is explicit so it is scoped and logged.
      const { error: unlinkError } = await supabaseAdmin
        .from('affiliate_payment_subscriptions')
        .update({ profile_id: null })
        .eq('adhesion_request_id', adhesionId)
        .eq('profile_id', profile.id);
      if (unlinkError) return internalError('MP subscription unlink', unlinkError);
      console.log(`${LOG} ${adhesionId}: MP subscription unlinked from ${profile.id}`);

      // profiles.family_group_id and family_groups.primary_affiliate_id
      // reference each other without cascades: detach, then delete the group
      // (family_members cascade). Otherwise the profile cascade would fail.
      const { error: detachError } = await supabaseAdmin
        .from('profiles')
        .update({ family_group_id: null })
        .eq('id', profile.id);
      if (detachError) return internalError('Family group detach', detachError);

      const { error: groupError } = await supabaseAdmin
        .from('family_groups')
        .delete()
        .eq('primary_affiliate_id', profile.id);
      if (groupError) return internalError('Family group deletion', groupError);
      console.log(`${LOG} ${adhesionId}: family group of ${profile.id} removed`);

      // Deleting the auth user cascades to its profile.
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
      if (deleteError) return internalError('Auth user deletion', deleteError);
      deletedUserId = profile.id;
      console.log(`${LOG} ${adhesionId}: orphan auth user ${profile.id} deleted`);
    } else {
      console.log(`${LOG} ${adhesionId}: no orphan account found`);
    }

    const { data: cleared, error: clearError } = await supabaseAdmin
      .from('adhesion_requests')
      .update({ activation_claimed_at: null })
      .eq('id', adhesionId)
      .eq('status', 'pending')
      .select('id');
    if (clearError) return internalError('Claim release', clearError);
    if (!Array.isArray(cleared) || cleared.length === 0) {
      console.error(`${LOG} ${adhesionId}: the request changed state before the claim was released`);
      return refuse('La solicitud cambió de estado durante la liberación; actualizá la lista.');
    }

    console.log(`${LOG} ${adhesionId}: claim released (deleted user: ${deletedUserId || 'none'})`);
    return { status: 200, body: { released: true, deletedUserId } };
  } catch (err) {
    return internalError(err?.step || 'Release', err);
  }
}
