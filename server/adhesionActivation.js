// server/adhesionActivation.js
//
// Activation of a pending adhesion request (odd/adhesion-auto-activation):
// creates the patient auth user, fills its profile, creates the family group,
// marks the request approved and runs the best-effort payment/email steps.
//
// Extracted from the inline body of POST /api/approve-adhesion so the admin
// endpoint and the public auto-activation endpoint share one implementation.
// Returns `{ status, body }` instead of writing to an Express response.
//
// Concurrency: the row is claimed atomically (`activation_claimed_at`, guarded
// by status='pending' and an unclaimed row) BEFORE the auth user is created,
// so concurrent triggers create at most one user. Blocking failures before the
// user exists for good (auth creation, profile update) release the claim so a
// later attempt (e.g. the admin fallback) can retry.

import { buildPatientAuthUser, sendActivationEmail } from './affiliateActivation.js';
import { resolveSellablePlan } from './pricing.js';
import { postAdhesionCheckoutPayment } from './adhesionPayments.js';
import { handleSubscriptionEvent, runDeferredReconciliation } from './mercadopago.js';

export const ACTIVATION_SOURCES = ['auto', 'admin'];

const LOG = '[activate-adhesion]';

// String helpers for robust name mapping (moved from server.js).
function splitPart(str, delim, index) {
  if (!str) return '';
  const parts = str.split(delim);
  return parts[index - 1] || '';
}

function afterFirst(str, delim) {
  if (!str) return '';
  const idx = str.indexOf(delim);
  if (idx === -1) return '';
  return str.substring(idx + delim.length);
}

function mapRelation(parentesco) {
  const relLower = (parentesco || '').toLowerCase();
  if (relLower.includes('conyuge') || relLower.includes('cónyuge') || relLower.includes('espos')) return 'cónyuge';
  if (relLower.includes('hijo') || relLower.includes('hija')) return 'hijo/a';
  if (relLower.includes('padre') || relLower.includes('madre') || relLower.includes('papá') || relLower.includes('mamá')) return 'padre/madre';
  if (relLower.includes('hermano') || relLower.includes('hermana')) return 'hermano/a';
  return 'otro';
}

function buildFamilyMemberRow(familyGroupId, member) {
  const rawName = member.name || member.fullName || 'Familiar de Prueba';
  return {
    family_group_id: familyGroupId,
    first_name: member.first_name || member.firstName || rawName.split(' ')[0],
    last_name: member.last_name || member.lastName || rawName.split(' ').slice(1).join(' '),
    relation: mapRelation(member.parentesco),
    birth_date: member.birthDate || member.fechaNac || null,
    dni: member.dni ? String(member.dni).trim() : null,
    cuil: member.cuil ? String(member.cuil).trim() : null,
  };
}

async function releaseClaim(supabaseAdmin, adhesionId) {
  const { error } = await supabaseAdmin
    .from('adhesion_requests')
    .update({ activation_claimed_at: null })
    .eq('id', adhesionId)
    .eq('status', 'pending');
  if (error) {
    console.error(`${LOG} Releasing the activation claim failed:`, error.message);
  }
}

/**
 * Activates a pending adhesion request.
 *
 * @param {object} deps
 *   supabaseAdmin, mercadoPagoEnabled, mpFetch, createMailTransporter,
 *   fromAddress, publicAppUrl, emailVerificationRequired
 * @param {string} adhesionId
 * @param {{ source: 'auto' | 'admin' }} options
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function activateAdhesion(deps, adhesionId, { source } = {}) {
  const {
    supabaseAdmin,
    mercadoPagoEnabled = false,
    mpFetch,
    createMailTransporter,
    fromAddress,
    publicAppUrl,
    emailVerificationRequired = false,
  } = deps || {};

  if (!ACTIVATION_SOURCES.includes(source)) {
    return { status: 500, body: { error: 'Origen de activación inválido.' } };
  }
  if (!supabaseAdmin) {
    return { status: 503, body: { error: 'Servicio de administración no configurado.' } };
  }
  if (!adhesionId) {
    return { status: 400, body: { error: 'Falta el campo adhesionId.' } };
  }

  let claimed = false;
  let userId = null;
  try {
    // 1. Fetch the request
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*')
      .eq('id', adhesionId)
      .single();

    if (fetchError || !request) {
      console.error(`${LOG} Error fetching application:`, fetchError);
      return { status: 404, body: { error: 'Solicitud de adhesión no encontrada.' } };
    }

    if (request.status !== 'pending') {
      return { status: 400, body: { error: `La solicitud ya se encuentra en estado: ${request.status}` } };
    }

    if (emailVerificationRequired && !request.email_verified) {
      return { status: 400, body: { error: 'No se puede aprobar una solicitud que no tiene el correo electrónico verificado.' } };
    }

    // 1b. Atomic claim: only one caller can move an unclaimed pending row to
    // claimed, so concurrent activations never create two auth users.
    const { data: claimRows, error: claimError } = await supabaseAdmin
      .from('adhesion_requests')
      .update({ activation_claimed_at: new Date().toISOString() })
      .eq('id', adhesionId)
      .eq('status', 'pending')
      .is('activation_claimed_at', null)
      .select('id');

    if (claimError) {
      console.error(`${LOG} Activation claim failed:`, claimError.message);
      return { status: 500, body: { error: 'Error interno al reservar la solicitud.' } };
    }
    if (!Array.isArray(claimRows) || claimRows.length === 0) {
      return { status: 409, body: { error: 'La solicitud ya está siendo procesada o no está pendiente.' } };
    }
    claimed = true;

    // 2. Create the patient auth user. No password is set here — the account
    // is activated via a best-effort recovery-link email sent below, never a
    // DNI-derived password (spec "No Plaintext-DNI Password On Approval").
    const authUserPayload = buildPatientAuthUser(request);
    const targetEmail = authUserPayload.email;
    const titularFullName = `${request.titular_first_name || ''} ${request.titular_last_name || ''}`.trim() || request.titular_name;

    console.log(`${LOG} (${source}) Creando usuario auth para: ${targetEmail}`);
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser(authUserPayload);

    if (authError) {
      console.error(`${LOG} Auth creation failed:`, authError.message);
      await releaseClaim(supabaseAdmin, adhesionId);
      claimed = false;
      return { status: 400, body: { error: `Error en autenticación: ${authError.message}` } };
    }

    userId = authData.user.id;

    // 2b. Resolve promoter_id (text code, e.g. "LANDING") to the producer's
    // UUID to populate profiles.producer_id — otherwise "Afiliados Traídos"
    // in Asesores Comerciales always stays at 0.
    let resolvedProducerId = null;
    if (request.promoter_id && request.promoter_id.trim() !== '') {
      const { data: producer } = await supabaseAdmin
        .from('producers')
        .select('id')
        .eq('producer_code', request.promoter_id.trim().toUpperCase())
        .maybeSingle();
      resolvedProducerId = producer?.id || null;
    }

    // 2c. Resolve the real plan_id from the current catalog (plan type +
    // payment method). plan_name is never written directly — the
    // sync_profile_plan_name_trigger derives it from plan_id.
    const resolvedPlan = await resolveSellablePlan(supabaseAdmin, {
      planType: request.plan_type,
      paymentMethod: request.payment_method,
    });
    const resolvedPlanId = resolvedPlan?.id || null;

    // 3. Update the patient's profile (auto-created by trigger).
    console.log(`${LOG} Actualizando perfil del titular: ${userId}`);
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: request.titular_first_name || splitPart(request.titular_name, ' ', 1),
        last_name: request.titular_last_name || afterFirst(request.titular_name, ' '),
        email: targetEmail,
        dni: request.titular_dni.trim(),
        cuil: request.titular_cuil?.trim() || null,
        phone: request.titular_phone,
        address: request.titular_address,
        province: request.titular_province || null,
        city: request.titular_city || null,
        locality: request.titular_locality,
        neighborhood: request.titular_neighborhood,
        birth_date: request.titular_birth_date,
        plan_id: resolvedPlanId,
        plan_status: 'active',
        // `profiles.payment_status` is DEPRECATED (write-stopped since
        // cuenta-corriente-billing PR1) — it's derived read-only from the
        // receivables ledger (`affiliate_payment_status` view).
        is_active: true,
        producer_id: resolvedProducerId,
      })
      .eq('id', userId);

    if (profileError) {
      console.error(`${LOG} Profile update failed:`, profileError.message);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      userId = null;
      await releaseClaim(supabaseAdmin, adhesionId);
      claimed = false;
      return { status: 500, body: { error: `Error al crear el perfil: ${profileError.message}` } };
    }

    // 4. Family group (non-blocking failures, as before).
    const familyMembersList = Array.isArray(request.family_members) ? request.family_members : [];
    if (familyMembersList.length > 0) {
      console.log(`${LOG} Procesando grupo familiar (${familyMembersList.length} miembros)...`);

      const { data: famGroup, error: famGroupError } = await supabaseAdmin
        .from('family_groups')
        .insert({
          primary_affiliate_id: userId,
          name: `Familia de ${titularFullName}`,
        })
        .select()
        .single();

      if (famGroupError) {
        console.error(`${LOG} family_groups creation failed:`, famGroupError.message);
      } else {
        const familyGroupId = famGroup.id;

        await supabaseAdmin
          .from('profiles')
          .update({ family_group_id: familyGroupId })
          .eq('id', userId);

        const { error: membersError } = await supabaseAdmin
          .from('family_members')
          .insert(familyMembersList.map((member) => buildFamilyMemberRow(familyGroupId, member)));

        if (membersError) {
          console.error(`${LOG} family_members insertion failed:`, membersError.message);
        }
      }
    }

    // 5. Mark the request approved. approved_profile_id records the link
    // (design D-F, fact 9); activated_at/activation_source record when and
    // how it was activated. Guarded by status='pending' so it never
    // overwrites a row another path already moved.
    console.log(`${LOG} Marcando solicitud como aprobada...`);
    const { error: approveError } = await supabaseAdmin
      .from('adhesion_requests')
      .update({
        status: 'approved',
        approved_profile_id: userId,
        activated_at: new Date().toISOString(),
        activation_source: source,
      })
      .eq('id', adhesionId)
      .eq('status', 'pending');
    if (approveError) {
      console.error(`${LOG} Marking the request approved failed:`, approveError.message);
    }

    // 5a. A Checkout Pro payment that arrived before the approval is posted to
    // the ledger now (idempotent; a no-op when unpaid or already posted).
    // Best-effort: never fails the approval; the payment webhook retries it.
    const ledgerPost = await postAdhesionCheckoutPayment(supabaseAdmin, adhesionId);
    if (!ledgerPost.ok) {
      console.error(`${LOG} Ledger posting of the checkout payment failed:`, ledgerPost.error);
    } else if (ledgerPost.posted) {
      console.log(`${LOG} Checkout payment posted to the ledger (invoice ${ledgerPost.invoiceId}).`);
    }

    // 5b. Mercado Pago débito-automático link back-fill (design D-F "Link
    // back-fill at approval", steps a-d). Best-effort and NON-BLOCKING. Pass
    // B of the D-H sweep re-drives steps (b)-(c) on any later run using
    // approved_profile_id, independent of this request completing.
    if (mercadoPagoEnabled) {
      let linkedPreapprovalId = null;
      try {
        const { data: subscription } = await supabaseAdmin
          .from('affiliate_payment_subscriptions')
          .select('id, mp_preapproval_id')
          .eq('adhesion_request_id', adhesionId)
          .is('profile_id', null)
          .maybeSingle();

        if (subscription) {
          await supabaseAdmin
            .from('affiliate_payment_subscriptions')
            .update({ profile_id: userId })
            .eq('id', subscription.id);

          if (subscription.mp_preapproval_id) {
            linkedPreapprovalId = subscription.mp_preapproval_id;
            const preapproval = await mpFetch(`/preapproval/${subscription.mp_preapproval_id}`);
            await handleSubscriptionEvent({ supabaseAdmin }, { resource: preapproval, kind: 'preapproval' });
          }
        }
      } catch (err) {
        console.error(`${LOG} Mercado Pago subscription link back-fill failed (non-blocking):`, err.message);
      }

      // Step (d): a scoped D-H sweep for just this subscription — the id
      // comes from the DB row read above, NEVER from the request body.
      if (linkedPreapprovalId) {
        try {
          await runDeferredReconciliation({ supabaseAdmin, mpFetch }, { preapprovalId: linkedPreapprovalId });
        } catch (err) {
          console.error(`${LOG} Scoped D-H sweep failed (non-blocking):`, err.message);
        }
      }
    }

    // 5c. Best-effort activation email — own try/catch, never blocks the
    // response.
    let activationEmailSent = false;
    try {
      const emailResult = await sendActivationEmail(
        { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
        { email: targetEmail, fullName: titularFullName }
      );
      activationEmailSent = !!emailResult?.sent;
    } catch (err) {
      console.error(`${LOG} Activation email failed (non-blocking):`, err?.message || String(err));
    }

    console.log(`${LOG} (${source}) Solicitud aprobada con éxito para titular: ${targetEmail}`);
    return {
      status: 200,
      body: {
        message: 'Solicitud aprobada exitosamente y paciente registrado.',
        userId,
        // Lets the admin UI warn immediately when the affiliate was left with
        // a passwordless account and no activation email.
        activationEmailSent,
      },
    };
  } catch (err) {
    console.error(`${LOG} Unexpected error:`, err);
    // Release only while no auth user exists: once one was created, keeping
    // the claim prevents a retry from creating a duplicate account.
    if (claimed && !userId) {
      await releaseClaim(supabaseAdmin, adhesionId).catch(() => {});
    }
    return { status: 500, body: { error: 'Error interno del servidor.' } };
  }
}
