// server/affiliatePaymentLink.js
//
// Admin action: resend the Mercado Pago payment link to an affiliate that is
// already active (approved) but never finished paying. The link belongs to the
// adhesion request that approved the profile (adhesion_requests.approved_profile_id),
// so this only resolves that request and reuses sendAdhesionPaymentLink.

import { sendAdhesionPaymentLink } from './adhesionPaymentLinkDelivery.js';

const fail = (status, error) => ({ status, body: { ok: false, error } });

/**
 * @param {Parameters<typeof sendAdhesionPaymentLink>[0]} ctx
 * @param {{ profileId?: string, channel?: 'whatsapp' | 'email' }} params
 */
export async function sendAffiliatePaymentLink(ctx, { profileId, channel } = {}) {
  if (!profileId) return fail(400, 'Falta el identificador del afiliado.');

  const { data: request } = await ctx.supabaseAdmin
    .from('adhesion_requests')
    .select('id')
    .eq('approved_profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!request) return fail(404, 'Este afiliado no tiene una solicitud de adhesión asociada.');

  // In-app enrollment rows carry only profile_id (adhesion_request_id is NULL),
  // so the guard matches either key. payment_failed counts as active, like the
  // enrollment logic: the debit exists and MP keeps retrying it.
  const { data: authorized } = await ctx.supabaseAdmin
    .from('affiliate_payment_subscriptions')
    .select('status')
    .or(`profile_id.eq.${profileId},adhesion_request_id.eq.${request.id}`)
    .in('status', ['authorized', 'payment_failed'])
    .limit(1)
    .maybeSingle();

  if (authorized) return fail(409, 'El afiliado ya tiene el débito automático activo.');

  return sendAdhesionPaymentLink(ctx, { adhesionRequestId: request.id, channel });
}
