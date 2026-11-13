// server/affiliateCancellation.js
//
// Affiliate cancellation, "Dar de baja" (odd/tasks/affiliate-cancellation.md, S1).
//
// POST /api/affiliates/:id/cancel (admin):
//   1. Validates the target: a direct (non-agreement) patient who is the titular
//      of their family group, if any. Checked BEFORE touching MercadoPago so an
//      invalid request never cancels a debit.
//   2. Cancels every open MercadoPago subscription (automatic debit) of the
//      titular and their family group at MP first, and records each through the
//      same guarded path the webhook uses. Fail closed: if MP is not configured
//      or a cancel fails, nothing else changes.
//   3. Records the cancellation with the cancel_affiliate RPC: effective at the
//      end of the paid coverage (or at once when it already expired); billing
//      stops now.
//
// The sweep (apply_due_affiliate_cancellations) blocks the login once a
// cancellation is due. It runs at start and every hour.

export const AFFILIATE_CANCELLATION_INTERVAL_MS = 60 * 60 * 1000;

const LOG = '[affiliate-cancel]';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_SUBSCRIPTION_STATUSES = ['pending', 'authorized', 'payment_failed'];

const MESSAGES = {
  invalidId: 'Identificador de afiliado inválido.',
  notFound: 'Afiliado no encontrado.',
  agreement: 'Los afiliados de un convenio se dan de baja desde el convenio.',
  notTitular: 'Solo se puede dar de baja al titular del grupo familiar; la baja alcanza a todo el grupo.',
  mpNotConfigured: 'MercadoPago no está configurado: no se puede cancelar el débito automático. El afiliado no fue dado de baja.',
  mpCancelFailed: 'No se pudo cancelar el débito automático en MercadoPago. El afiliado no fue dado de baja; volvé a intentar.',
  recordFailed: 'Error al registrar la baja. Volvé a intentar: el débito ya cancelado no se vuelve a tocar.',
};

/**
 * Express wires this behind `requireAuth, requireAdmin` (`req.user` is an admin).
 *
 * @param {{ supabaseAdmin: object, mpFetch: Function | null, handleSubscriptionEvent: Function }} deps
 */
export async function cancelAffiliateHandler(req, res, { supabaseAdmin, mpFetch, handleSubscriptionEvent }) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const targetId = req.params.id;
  if (!UUID_RE.test(targetId || '')) {
    return res.status(400).json({ error: MESSAGES.invalidId });
  }

  // 1. Validate the target before touching MercadoPago.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, family_group_id, agreement_id')
    .eq('id', targetId)
    .maybeSingle();
  if (profileError) {
    console.error(`${LOG} profile lookup failed:`, profileError.message);
    return res.status(500).json({ error: MESSAGES.recordFailed });
  }
  if (!profile || profile.role !== 'patient') {
    return res.status(404).json({ error: MESSAGES.notFound });
  }
  if (profile.agreement_id) {
    return res.status(409).json({ error: MESSAGES.agreement });
  }

  let profileIds = [targetId];
  if (profile.family_group_id) {
    const { data: group } = await supabaseAdmin
      .from('family_groups')
      .select('primary_affiliate_id')
      .eq('id', profile.family_group_id)
      .maybeSingle();
    if (group?.primary_affiliate_id !== targetId) {
      return res.status(409).json({ error: MESSAGES.notTitular });
    }
    const { data: members, error: membersError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('family_group_id', profile.family_group_id)
      .eq('role', 'patient');
    if (membersError) {
      console.error(`${LOG} family lookup failed:`, membersError.message);
      return res.status(500).json({ error: MESSAGES.recordFailed });
    }
    profileIds = [...new Set([targetId, ...(members || []).map((m) => m.id)])];
  }

  // 2. Cancel every open automatic debit at MercadoPago first (fail closed).
  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
    .from('affiliate_payment_subscriptions')
    .select('id, mp_preapproval_id, status')
    .in('profile_id', profileIds)
    .in('status', OPEN_SUBSCRIPTION_STATUSES)
    .not('mp_preapproval_id', 'is', null);
  if (subscriptionsError) {
    console.error(`${LOG} subscription lookup failed:`, subscriptionsError.message);
    return res.status(500).json({ error: MESSAGES.recordFailed });
  }

  const open = subscriptions || [];
  if (open.length > 0 && !mpFetch) {
    return res.status(503).json({ error: MESSAGES.mpNotConfigured });
  }

  for (const subscription of open) {
    let resource;
    try {
      resource = await mpFetch(`/preapproval/${subscription.mp_preapproval_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      });
    } catch (err) {
      console.error(`${LOG} MP cancel failed for ${subscription.mp_preapproval_id}:`, err?.message || err);
      return res.status(502).json({ error: MESSAGES.mpCancelFailed });
    }
    try {
      // Same guarded RPC the webhook uses (never a raw UPDATE). If it fails,
      // MP's own cancellation notification records it later.
      await handleSubscriptionEvent({ supabaseAdmin }, { resource, kind: 'preapproval' });
    } catch (err) {
      console.error(`${LOG} recording the MP cancel failed for ${subscription.mp_preapproval_id}:`, err?.message || err);
    }
  }

  // 3. Record the cancellation (idempotent; billing stops now).
  const { data, error } = await supabaseAdmin.rpc('cancel_affiliate', {
    p_profile_id: targetId,
    p_requested_by: req.user.id,
  });
  if (error) {
    if (error.code === 'P0002') return res.status(404).json({ error: MESSAGES.notFound });
    if (error.message === 'affiliate_not_titular') return res.status(409).json({ error: MESSAGES.notTitular });
    if (error.message === 'affiliate_has_agreement') return res.status(409).json({ error: MESSAGES.agreement });
    console.error(`${LOG} cancel_affiliate failed:`, error.message);
    return res.status(500).json({ error: MESSAGES.recordFailed });
  }

  const row = Array.isArray(data) ? data[0] : data;
  console.log(`${LOG} ${targetId} cancelled by ${req.user.id}; effective ${row?.effective_at}; debits cancelled: ${open.length}`);
  return res.status(200).json({
    success: true,
    id: targetId,
    effectiveAt: row?.effective_at ?? null,
    immediate: Boolean(row?.immediate),
    profilesCancelled: Number(row?.profiles_cancelled || 0),
    debitsCancelled: open.length,
  });
}

/**
 * Applies the cancellations whose effective date passed (login blocked,
 * plan_status cancelled). A failed run is logged and retried on the next tick.
 */
export async function runAffiliateCancellationSweep({ supabaseAdmin, logger = console }) {
  try {
    const { data, error } = await supabaseAdmin.rpc('apply_due_affiliate_cancellations');
    if (error) throw error;
    const applied = Number(data || 0);
    if (applied) logger.log(`${LOG} applied ${applied} due cancellation(s)`);
    return { ok: true, applied };
  } catch (err) {
    const message = err?.message || String(err);
    logger.error(`${LOG} sweep failed:`, message);
    return { ok: false, error: message };
  }
}

/** Runs the sweep now and every `intervalMs`; runs never overlap. */
export function startAffiliateCancellationJob({ supabaseAdmin, intervalMs = AFFILIATE_CANCELLATION_INTERVAL_MS, logger = console } = {}) {
  if (!supabaseAdmin) return { stop() {}, skipped: true };

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runAffiliateCancellationSweep({ supabaseAdmin, logger });
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
