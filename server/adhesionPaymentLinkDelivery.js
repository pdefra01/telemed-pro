// server/adhesionPaymentLinkDelivery.js
//
// M4 (odd/adhesion-payment-link-delivery): thin composition endpoint for
// POST /api/adhesion/:id/send-payment-link. It never reimplements Mercado
// Pago calls or channel delivery — it only:
//   1. re-fetches (or creates) a fresh init point the same way the client
//      already does today, via the existing idempotent
//      createAdhesionPreapproval / createAdhesionCheckoutPreference
//      (server/adhesionPayments.js), choosing between them with the same
//      requiresCheckoutPayment(payment_method, plan.plan_kind) branch those
//      functions already use internally;
//   2. dispatches that init point through the requested channel via the
//      existing sendPaymentLinkViaWhatsApp (server/whatsapp.js) or
//      sendPaymentLinkEmail (server/affiliateActivation.js), and returns
//      whichever `{ status, body }` that channel function produced.

import { resolveSellablePlan, requiresCheckoutPayment } from './pricing.js';
import { createAdhesionPreapproval, createAdhesionCheckoutPreference } from './adhesionPayments.js';
import { sendPaymentLinkViaWhatsApp } from './whatsapp.js';
import { sendPaymentLinkEmail } from './affiliateActivation.js';

const CHANNELS = ['whatsapp', 'email'];

const fail = (status, error) => ({ status, body: { ok: false, error } });

/** Same fallback chain used by sendPaymentLinkViaWhatsApp's WhatsApp text. */
function titularFullName(request) {
  return (
    [request.titular_first_name, request.titular_last_name].filter(Boolean).join(' ').trim() ||
    request.titular_name ||
    undefined
  );
}

/**
 * Sends the Mercado Pago payment link of an adhesion request through the
 * requested channel. Public, no auth — mirrors /api/adhesion/preapproval
 * (the adhesion form itself is public).
 *
 * @param {{ supabaseAdmin: any, mpFetch: Function, publicAppUrl: string, nextBillingDate: (day: number) => string, waha: any, createMailTransporter: Function, fromAddress: string }} ctx
 * @param {{ adhesionRequestId?: string, channel?: 'whatsapp' | 'email' }} params
 */
export async function sendAdhesionPaymentLink(ctx, { adhesionRequestId, channel } = {}) {
  const { supabaseAdmin, mpFetch, publicAppUrl, nextBillingDate, waha, createMailTransporter, fromAddress } = ctx;

  if (!CHANNELS.includes(channel)) {
    return fail(400, 'El campo channel debe ser "whatsapp" o "email".');
  }

  const { data: request, error: fetchError } = await supabaseAdmin
    .from('adhesion_requests')
    .select('titular_email, titular_phone, titular_first_name, titular_last_name, titular_name, plan_type, payment_method')
    .eq('id', adhesionRequestId)
    .maybeSingle();

  if (fetchError || !request) {
    console.error('[adhesion/send-payment-link] Adhesion request not found:', fetchError?.message);
    return fail(404, 'No se encontró la solicitud de adhesión.');
  }

  const plan = await resolveSellablePlan(supabaseAdmin, { planType: request.plan_type, paymentMethod: request.payment_method });
  if (!plan) {
    console.error('[adhesion/send-payment-link] No plan resolved for adhesion', adhesionRequestId);
    return fail(500, 'No se pudo resolver el plan de la solicitud.');
  }

  const mpResult = requiresCheckoutPayment(request.payment_method, plan.plan_kind)
    ? await createAdhesionCheckoutPreference({ supabaseAdmin, mpFetch, publicAppUrl }, { adhesionRequestId })
    : await createAdhesionPreapproval({ supabaseAdmin, mpFetch, publicAppUrl, nextBillingDate }, { adhesionRequestId });

  if (mpResult.status !== 200) {
    return mpResult;
  }

  const paymentUrl = mpResult.body.initPoint;

  if (channel === 'whatsapp') {
    return sendPaymentLinkViaWhatsApp({ supabaseAdmin, waha }, { adhesionRequestId, paymentUrl });
  }

  return sendPaymentLinkEmail(
    { supabaseAdmin, createMailTransporter, fromAddress },
    {
      adhesionRequestId,
      email: request.titular_email,
      fullName: titularFullName(request),
      paymentUrl,
    }
  );
}
