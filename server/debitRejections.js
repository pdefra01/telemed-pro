// server/debitRejections.js
//
// Periodic Mercado Pago query for debit rejections (odd/tasks/commercial-crm-commissions.md,
// C1, S4/S5): "Rejections come from the existing webhooks plus a periodic MP query for debit
// subscriptions, to record rejections whose webhook never arrived".
//
// For each live debit subscription ('authorized' or 'payment_failed', with a preapproval id)
// it lists the subscription's invoices with the documented search endpoint, paged with
// offset/limit until paging.total (searchAuthorizedPayments)
//   GET /authorized_payments/search?preapproval_id={id}&offset=&limit=  ->  { paging, results: [...] }
//   https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/authorized-payment-search/get.md
// and every recent terminal invoice not yet in mercadopago_events is replayed through
// routeWebhookNotification, exactly as if its `subscription_authorized_payment` webhook had
// arrived: same re-fetch, same event key, same RPCs, so state transitions stay identical.
//
// Runs at start and every few hours, never overlapping, and never throws: a failed run is
// logged and retried on the next tick.

import {
  completeAuthorizedPayment,
  deriveSubscriptionEventKey,
  routeWebhookNotification,
  searchAuthorizedPayments,
} from './mercadopago.js';

export const DEBIT_REJECTIONS_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DEBIT_REJECTIONS_BATCH_SIZE = 50;
/** Invoices older than this are history, not something a missed webhook still owes us. */
export const DEBIT_REJECTIONS_LOOKBACK_DAYS = 60;
/** Batches one tick may take before leaving the rest of the roster for the next tick. */
export const DEBIT_REJECTIONS_MAX_BATCHES_PER_TICK = 20;

const LOG = '[debit-rejections]';

/** Epoch ms of the invoice's latest date, or null. MP writes offsets like -04:00, so the
 * dates are compared as instants, never as text. */
function invoiceTime(item) {
  const value = item.last_modified || item.date_created || item.debit_date;
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

/**
 * One bounded run: at most `batchSize` subscriptions, in id order after `afterId`.
 *
 * @param {{ supabaseAdmin: any, mpFetch: (path: string, init?: any) => Promise<any>, logger?: Pick<Console, 'log' | 'error'>, batchSize?: number, afterId?: string | null, lookbackDays?: number, sendPaymentReceipt?: Function }} deps
 * @returns {Promise<{ ok: true, checked: number, replayed: number, rejected: number, alreadyRecorded: number, errors: number, nextAfterId: string | null } | { ok: false, error: string }>}
 */
export async function runDebitRejectionSync({
  supabaseAdmin,
  mpFetch,
  logger = console,
  batchSize = DEBIT_REJECTIONS_BATCH_SIZE,
  afterId = null,
  lookbackDays = DEBIT_REJECTIONS_LOOKBACK_DAYS,
  sendPaymentReceipt,
}) {
  try {
    let query = supabaseAdmin
      .from('affiliate_payment_subscriptions')
      .select('id, mp_preapproval_id')
      .in('status', ['authorized', 'payment_failed'])
      .not('mp_preapproval_id', 'is', null);
    if (afterId) query = query.gt('id', afterId);
    const { data: subs, error } = await query.order('id', { ascending: true }).limit(batchSize);
    if (error) throw error;

    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    const ctx = { supabaseAdmin, mpFetch, sendPaymentReceipt };
    const summary = { checked: 0, replayed: 0, rejected: 0, alreadyRecorded: 0, errors: 0 };

    for (const sub of subs || []) {
      summary.checked++;
      try {
        const items = await searchAuthorizedPayments(mpFetch, sub.mp_preapproval_id);

        for (const item of items) {
          if (item?.id === undefined || item?.id === null || !item?.status) continue;
          const when = invoiceTime(item);
          if (when !== null && when < cutoff) continue;

          // Without the nested payment status a failed debit looks collected, and an
          // existing `_processed` row would hide the rejection: complete it first.
          const resource = await completeAuthorizedPayment(mpFetch, item);
          const key = deriveSubscriptionEventKey(resource, 'authorized_payment');
          if (!key) continue; // scheduled / recycling / canceled: nothing terminal to record

          const { data: existing } = await supabaseAdmin
            .from('mercadopago_events')
            .select('id')
            .eq('event_type', key.eventType)
            .eq('mp_resource_id', String(key.mpResourceId))
            .maybeSingle();
          if (existing) {
            summary.alreadyRecorded++;
            continue;
          }

          const result = await routeWebhookNotification(ctx, {
            topic: 'subscription_authorized_payment',
            dataId: String(item.id),
          });
          if (result.status !== 200) {
            summary.errors++;
            logger.error(`${LOG} replay of invoice ${item.id} failed:`, result.body?.detail || result.body?.error || String(result.status));
            continue;
          }
          summary.replayed++;
          if (key.newStatus === 'payment_failed') summary.rejected++;
        }
      } catch (err) {
        summary.errors++;
        logger.error(`${LOG} subscription ${sub.id} failed:`, err?.message || String(err));
      }
    }

    const fullPage = (subs || []).length === batchSize;
    const nextAfterId = fullPage ? subs[subs.length - 1].id : null;
    logger.log(
      `${LOG} checked=${summary.checked} replayed=${summary.replayed} rejected=${summary.rejected} already=${summary.alreadyRecorded} errors=${summary.errors}`
    );
    return { ok: true, ...summary, nextAfterId };
  } catch (err) {
    const message = err?.message || String(err);
    logger.error(`${LOG} run failed:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Runs the query once now and then every `intervalMs`. Ticks never overlap; each tick takes
 * batches until the roster is covered (or `maxBatchesPerTick`, leaving the rest for the next
 * tick). Without Mercado Pago or without a service client it does nothing.
 *
 * @returns {{ stop: () => void, skipped?: boolean }}
 */
export function startDebitRejectionJob({
  supabaseAdmin,
  mpFetch,
  intervalMs = DEBIT_REJECTIONS_INTERVAL_MS,
  batchSize = DEBIT_REJECTIONS_BATCH_SIZE,
  maxBatchesPerTick = DEBIT_REJECTIONS_MAX_BATCHES_PER_TICK,
  logger = console,
  sendPaymentReceipt,
} = {}) {
  if (!supabaseAdmin || !mpFetch) return { stop() {}, skipped: true };

  let running = false;
  let afterId = null;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (let batch = 0; batch < maxBatchesPerTick; batch++) {
        const result = await runDebitRejectionSync({ supabaseAdmin, mpFetch, logger, batchSize, afterId, sendPaymentReceipt });
        afterId = result.ok ? result.nextAfterId : null;
        if (!afterId) break; // roster covered (or the run failed): start over next tick
      }
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
