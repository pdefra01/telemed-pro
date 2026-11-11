// server/debitRejections.js
//
// Periodic Mercado Pago query for debit rejections (odd/tasks/commercial-crm-commissions.md,
// C1, S4/S5): "Rejections come from the existing webhooks plus a periodic MP query for debit
// subscriptions, to record rejections whose webhook never arrived".
//
// For each live debit subscription ('authorized' or 'payment_failed', with a preapproval id)
// it lists the subscription's invoices with the documented search endpoint
//   GET /authorized_payments/search?preapproval_id={id}  ->  { paging, results: [...] }
//   https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/authorized-payment-search/get.md
// and every recent terminal invoice not yet in mercadopago_events is replayed through
// routeWebhookNotification, exactly as if its `subscription_authorized_payment` webhook had
// arrived: same re-fetch, same event key, same RPCs, so state transitions stay identical.
//
// Runs at start and every few hours, never overlapping, and never throws: a failed run is
// logged and retried on the next tick.

import { deriveSubscriptionEventKey, routeWebhookNotification } from './mercadopago.js';

export const DEBIT_REJECTIONS_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DEBIT_REJECTIONS_BATCH_SIZE = 50;
/** Invoices older than this are history, not something a missed webhook still owes us. */
export const DEBIT_REJECTIONS_LOOKBACK_DAYS = 60;

const LOG = '[debit-rejections]';

function invoiceDate(item) {
  return item.last_modified || item.date_created || item.debit_date || null;
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

    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const ctx = { supabaseAdmin, mpFetch, sendPaymentReceipt };
    const summary = { checked: 0, replayed: 0, rejected: 0, alreadyRecorded: 0, errors: 0 };

    for (const sub of subs || []) {
      summary.checked++;
      try {
        const list = await mpFetch(`/authorized_payments/search?preapproval_id=${encodeURIComponent(sub.mp_preapproval_id)}`);
        const items = Array.isArray(list?.results) ? list.results : [];

        for (const item of items) {
          const key = deriveSubscriptionEventKey(item, 'authorized_payment');
          if (!key) continue; // scheduled / recycling / canceled: nothing terminal to record
          const when = invoiceDate(item);
          if (when && when < cutoff) continue;

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
 * Runs the query once now and then every `intervalMs`. Runs never overlap; each run picks up
 * the next batch of subscriptions and wraps around once the roster is covered. Without
 * Mercado Pago or without a service client it does nothing.
 *
 * @returns {{ stop: () => void, skipped?: boolean }}
 */
export function startDebitRejectionJob({
  supabaseAdmin,
  mpFetch,
  intervalMs = DEBIT_REJECTIONS_INTERVAL_MS,
  batchSize = DEBIT_REJECTIONS_BATCH_SIZE,
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
      const result = await runDebitRejectionSync({ supabaseAdmin, mpFetch, logger, batchSize, afterId, sendPaymentReceipt });
      afterId = result.ok ? result.nextAfterId : null;
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
