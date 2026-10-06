// server/adhesionAutoActivation.js
//
// Public auto-activation of an adhesion request right after the form is
// submitted (POST /api/adhesion/:id/activate). Server-side email verification
// replaces the admin as the anti-abuse gate; the activation itself is shared
// with the admin fallback through activateAdhesion.
//
// Response contract ({ status, body }):
//   200 { activated: true, message, activationEmailSent }   activated now
//   200 { alreadyActive: true, message }                     already approved (idempotent)
//   202 { processing: true, message }                        another activation holds a fresh claim; do not retry
//   409 { ok: false, pendingReview: true, error }            the claim is stale (crashed activation): pending admin review
//   400 { error }                                            invalid id / not pending (e.g. rejected) / activation precondition
//   403 { error }                                            titular email not verified server-side
//   404 { error }                                            unknown request
//   409 { ok: false, error, conflicts }                      DNI/CUIL already registered
//   500 / 503 { error }                                      internal / not configured

import { activateAdhesion } from './adhesionActivation.js';
import { isEmailVerified } from './emailVerification.js';
import { buildPeople, findRegisteredIdentityConflicts } from './adhesionChecks.js';
import { isActivationClaimStale } from './adhesionActivationRecovery.js';

const LOG = '[adhesion/activate]';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} deps same deps as activateAdhesion (supabaseAdmin,
 *   emailVerificationRequired, mercadoPagoEnabled, mpFetch, ...)
 * @param {string} adhesionId
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function autoActivateAdhesion(deps, adhesionId) {
  const { supabaseAdmin, emailVerificationRequired = true } = deps || {};

  if (!supabaseAdmin) {
    return { status: 503, body: { error: 'Servicio de administración no configurado.' } };
  }
  if (typeof adhesionId !== 'string' || !UUID_RE.test(adhesionId)) {
    return { status: 400, body: { error: 'Identificador de solicitud inválido.' } };
  }

  const { data: request, error: fetchError } = await supabaseAdmin
    .from('adhesion_requests')
    .select('id,status,titular_email,titular_dni,titular_cuil,family_members,activation_claimed_at')
    .eq('id', adhesionId)
    .maybeSingle();

  if (fetchError) {
    console.error(`${LOG} Error fetching application:`, fetchError.message);
    return { status: 500, body: { error: 'Error interno al consultar la solicitud.' } };
  }
  if (!request) {
    return { status: 404, body: { error: 'Solicitud de adhesión no encontrada.' } };
  }

  if (request.status === 'approved') {
    return { status: 200, body: { alreadyActive: true, message: 'La adhesión ya se encuentra activa.' } };
  }
  if (request.status !== 'pending') {
    return { status: 400, body: { error: `La solicitud ya se encuentra en estado: ${request.status}` } };
  }

  // A stale claim means an earlier activation crashed after creating the
  // account; only an admin can release it, so "processing" would never end.
  // Answered before the duplicate scan: the activation would lose the claim.
  if (isActivationClaimStale(request)) {
    console.log(`${LOG} ${adhesionId}: stale activation claim, pending admin review`);
    return {
      status: 409,
      body: {
        ok: false,
        pendingReview: true,
        error: 'Tu adhesión quedó pendiente de revisión por un administrador. Te contactaremos a la brevedad.',
      },
    };
  }

  if (emailVerificationRequired) {
    let verified;
    try {
      verified = await isEmailVerified(supabaseAdmin, request.titular_email);
    } catch (err) {
      console.error(`${LOG} Email verification lookup failed:`, err.message);
      return { status: 500, body: { error: 'Error interno al validar el correo electrónico.' } };
    }
    if (!verified) {
      return {
        status: 403,
        body: { error: 'El correo electrónico del titular no está verificado. Verificalo para activar la adhesión.' },
      };
    }
  }

  let conflicts;
  try {
    conflicts = await findRegisteredIdentityConflicts(
      supabaseAdmin,
      buildPeople({
        titularDni: request.titular_dni,
        titularCuil: request.titular_cuil,
        family: request.family_members,
      })
    );
  } catch (err) {
    console.error(`${LOG} Duplicate check failed:`, err.message);
    return { status: 500, body: { error: 'Error interno al validar duplicados.' } };
  }
  if (conflicts.length > 0) {
    return { status: 409, body: { ok: false, error: conflicts[0].message, conflicts } };
  }

  const result = await activateAdhesion(deps, adhesionId, { source: 'auto' });

  if (result.status === 409) {
    // Another activation (admin or a concurrent auto call) holds a fresh claim.
    return { status: 202, body: { processing: true, message: 'La solicitud ya está siendo procesada.' } };
  }
  if (result.status === 200) {
    // The public endpoint does not expose the new auth user id.
    return {
      status: 200,
      body: {
        activated: true,
        message: result.body?.message,
        activationEmailSent: result.body?.activationEmailSent,
      },
    };
  }
  return result;
}
