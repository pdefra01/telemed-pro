// server/adhesionPayments.js
//
// Mercado Pago step of every new sign-up (feature mandatory-mp-signup-payment).
// Subscription-type options get a preapproval; manual methods (cash, transfer,
// Rapipago, link) get a Checkout Pro preference for the first period. Both
// handlers are idempotent per adhesion request and return `{ status, body }`
// (server.js only maps it to HTTP) so they are testable without Express.
// Failures are non-2xx on purpose: the payment step is mandatory, the client
// must block and retry the MP call only (the adhesion row already exists).

import { resolveSellablePlan, preapprovalTerms, requiresCheckoutPayment } from './pricing.js';

const MP_ERROR = 'No se pudo generar el link de pago de Mercado Pago. Intentá nuevamente.';

const fail = (status, error) => ({ status, body: { ok: false, error } });

function payerEmailOf(request) {
  return request.titular_email?.trim() || `${String(request.titular_dni || '').trim()}@medinex-paciente.com`;
}

/**
 * Creates (or re-serves) the MP preapproval of an adhesion request.
 *
 * @param {{ supabaseAdmin: any, mpFetch: Function, publicAppUrl: string, nextBillingDate: (day: number) => string }} ctx
 * @param {{ adhesionRequestId?: string }} params
 */
export async function createAdhesionPreapproval(ctx, { adhesionRequestId } = {}) {
  const { supabaseAdmin, mpFetch, publicAppUrl, nextBillingDate } = ctx;
  if (!adhesionRequestId) return fail(400, 'Falta el campo adhesionRequestId.');

  try {
    const { data: existing } = await supabaseAdmin
      .from('affiliate_payment_subscriptions')
      .select('mp_preapproval_id')
      .eq('adhesion_request_id', adhesionRequestId)
      .maybeSingle();

    if (existing?.mp_preapproval_id) {
      try {
        const preapproval = await mpFetch(`/preapproval/${existing.mp_preapproval_id}`);
        return { status: 200, body: { ok: true, initPoint: preapproval.init_point } };
      } catch (err) {
        console.error('[adhesion/preapproval] Re-fetch of existing preapproval failed:', err.message);
        return fail(502, MP_ERROR);
      }
    }

    const { data: request, error: fetchError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('titular_email, titular_dni, plan_type, payment_method, preferred_billing_day')
      .eq('id', adhesionRequestId)
      .single();

    if (fetchError || !request) {
      console.error('[adhesion/preapproval] Adhesion request not found:', fetchError?.message);
      return fail(404, 'No se encontró la solicitud de adhesión.');
    }

    const plan = await resolveSellablePlan(supabaseAdmin, { planType: request.plan_type, paymentMethod: request.payment_method });
    if (!plan) {
      console.error('[adhesion/preapproval] No plan resolved (requested or default) for adhesion', adhesionRequestId);
      return fail(500, 'No se pudo resolver el plan de la solicitud.');
    }

    if (requiresCheckoutPayment(request.payment_method, plan.plan_kind)) {
      return fail(400, 'Este medio de pago se abona con un pago único, no con suscripción.');
    }

    const terms = preapprovalTerms(plan);
    const requestedDay = Number(request.preferred_billing_day);
    const billingDay = Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= 28 ? requestedDay : 10;

    let preapproval;
    try {
      preapproval = await mpFetch('/preapproval', {
        method: 'POST',
        body: JSON.stringify({
          reason: `Medinex - ${plan.name} - Débito Automático`,
          external_reference: `adhesion:${adhesionRequestId}`,
          payer_email: payerEmailOf(request),
          back_url: `${publicAppUrl}/`,
          auto_recurring: {
            frequency: terms.frequency,
            frequency_type: terms.frequencyType,
            transaction_amount: terms.amount,
            currency_id: 'ARS',
            start_date: nextBillingDate(billingDay),
          },
          status: 'pending',
        }),
      });
    } catch (err) {
      console.error('[adhesion/preapproval] MP preapproval creation failed:', err.message);
      return fail(502, MP_ERROR);
    }

    const { error: insertError } = await supabaseAdmin
      .from('affiliate_payment_subscriptions')
      .insert({
        profile_id: null,
        adhesion_request_id: adhesionRequestId,
        mp_preapproval_id: preapproval.id,
        status: 'pending',
        discounted_monthly_cost: terms.amount, // DB column name kept; holds the amount charged per cycle
        billing_day: billingDay,
      });

    if (insertError) {
      // Partial unique index on adhesion_request_id: a concurrent call already
      // recorded a row. The preapproval created here is an orphan at MP,
      // logged for operator visibility; a client retry re-serves the recorded one.
      console.error('[adhesion/preapproval] Failed to record subscription row (likely concurrent duplicate):', insertError.message);
      return fail(409, MP_ERROR);
    }

    return { status: 200, body: { ok: true, initPoint: preapproval.init_point } };
  } catch (err) {
    console.error('[adhesion/preapproval] Unexpected error:', err);
    return fail(502, MP_ERROR);
  }
}

/**
 * Creates (or re-serves) the Checkout Pro preference that collects the first
 * period of a manual-method sign-up.
 *
 * @param {{ supabaseAdmin: any, mpFetch: Function, publicAppUrl: string }} ctx
 * @param {{ adhesionRequestId?: string }} params
 */
export async function createAdhesionCheckoutPreference(ctx, { adhesionRequestId } = {}) {
  const { supabaseAdmin, mpFetch, publicAppUrl } = ctx;
  if (!adhesionRequestId) return fail(400, 'Falta el campo adhesionRequestId.');

  try {
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('titular_email, titular_dni, plan_type, payment_method, mp_checkout_preference_id, payment_status')
      .eq('id', adhesionRequestId)
      .single();

    if (fetchError || !request) {
      console.error('[adhesion/checkout-preference] Adhesion request not found:', fetchError?.message);
      return fail(404, 'No se encontró la solicitud de adhesión.');
    }

    const plan = await resolveSellablePlan(supabaseAdmin, { planType: request.plan_type, paymentMethod: request.payment_method });
    if (!plan) {
      console.error('[adhesion/checkout-preference] No plan resolved for adhesion', adhesionRequestId);
      return fail(500, 'No se pudo resolver el plan de la solicitud.');
    }

    if (!requiresCheckoutPayment(request.payment_method, plan.plan_kind)) {
      return fail(400, 'Este medio de pago se abona con suscripción, no con un pago único.');
    }

    if (request.payment_status === 'approved') {
      return fail(409, 'El primer pago de esta solicitud ya fue acreditado.');
    }

    if (request.mp_checkout_preference_id) {
      try {
        const preference = await mpFetch(`/checkout/preferences/${request.mp_checkout_preference_id}`);
        return { status: 200, body: { ok: true, initPoint: preference.init_point } };
      } catch (err) {
        console.error('[adhesion/checkout-preference] Re-fetch of existing preference failed:', err.message);
        return fail(502, MP_ERROR);
      }
    }

    let preference;
    try {
      preference = await mpFetch('/checkout/preferences', {
        method: 'POST',
        body: JSON.stringify({
          items: [{
            title: `Medinex - ${plan.name} - Primer pago`,
            quantity: 1,
            unit_price: Number(Number(plan.monthly_cost).toFixed(2)),
            currency_id: 'ARS',
          }],
          // Correlation contract for the `payment` webhook: the adhesion is
          // re-read from the DB there; this string only names which one.
          external_reference: `adhesion:${adhesionRequestId}:checkout`,
          payer: { email: payerEmailOf(request) },
          back_urls: {
            success: `${publicAppUrl}/`,
            pending: `${publicAppUrl}/`,
            failure: `${publicAppUrl}/`,
          },
          auto_return: 'approved',
          ...(publicAppUrl ? { notification_url: `${publicAppUrl}/api/webhooks/mercadopago` } : {}),
        }),
      });
    } catch (err) {
      console.error('[adhesion/checkout-preference] MP preference creation failed:', err.message);
      return fail(502, MP_ERROR);
    }

    const { error: updateError } = await supabaseAdmin
      .from('adhesion_requests')
      .update({ mp_checkout_preference_id: String(preference.id), payment_status: 'pending' })
      .eq('id', adhesionRequestId);

    if (updateError) {
      console.error('[adhesion/checkout-preference] Failed to store preference id:', updateError.message);
      return fail(502, MP_ERROR);
    }

    return { status: 200, body: { ok: true, initPoint: preference.init_point } };
  } catch (err) {
    console.error('[adhesion/checkout-preference] Unexpected error:', err);
    return fail(502, MP_ERROR);
  }
}

/**
 * Posts the sign-up Checkout Pro payment of an approved adhesion request into
 * the affiliate ledger (RPC `post_adhesion_checkout_payment`, service role,
 * idempotent). Shared by the payment webhook and approve-adhesion so whichever
 * happens second posts it. Never throws.
 *
 * @param {{ rpc: Function }} supabaseAdmin
 * @param {string} adhesionRequestId
 * @returns {Promise<{ ok: true, posted: boolean, reason: string, invoiceId: string | null } | { ok: false, error: string }>}
 */
export async function postAdhesionCheckoutPayment(supabaseAdmin, adhesionRequestId) {
  try {
    const { data, error } = await supabaseAdmin.rpc('post_adhesion_checkout_payment', {
      p_adhesion_request_id: adhesionRequestId,
    });
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'empty_ledger_response' };
    return { ok: true, posted: data.posted === true, reason: data.reason, invoiceId: data.invoice_id ?? null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
