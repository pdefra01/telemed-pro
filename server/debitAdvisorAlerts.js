// server/debitAdvisorAlerts.js
//
// Tells the advisor who brought an affiliate when the affiliate's Mercado Pago debit needs a
// follow-up: never completed (pending for more than a day), rejected, or cancelled without a
// baja. The rule lives in debit_advisor_alerts_due() (20261117010000_debit_advisor_alerts.sql).
//
// Each alert is claimed in debit_advisor_alerts BEFORE it is sent (the unique key makes a
// second claim fail), so an alert reaches the advisor at most once, even across restarts. It is
// sent as an in-app notification and, when the WhatsApp gateway is configured and the advisor
// has a valid phone, as a WhatsApp message. A failed channel is logged, never retried.
//
// Runs at start and every hour, never overlapping, and never throws.

import { normalizeArgentinePhone } from './whatsapp.js';

export const DEBIT_ADVISOR_ALERTS_INTERVAL_MS = 60 * 60 * 1000;
export const DEBIT_ADVISOR_ALERTS_PENDING_AFTER = '1 day';

const LOG = '[debit-advisor-alerts]';
const UNIQUE_VIOLATION = '23505';

const HEADLINES = {
  not_completed: 'no completó la adhesión al débito automático',
  rejected: 'tiene el débito automático rechazado',
  cancelled: 'canceló el débito automático',
};

const NEXT_STEPS = {
  not_completed: 'Contactalo para que termine de autorizar el débito en Mercado Pago.',
  rejected: 'Contactalo para que revise su medio de pago en Mercado Pago.',
  cancelled: 'Contactalo para saber si quiere seguir con su plan.',
};

function formatDate(value) {
  return new Date(value).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/** The alert in the advisor's words: one title and one body shared by both channels. */
export function buildDebitAlert(row) {
  const name = row.affiliate_name || 'Un afiliado';
  const title = `${name} ${HEADLINES[row.kind]}`;
  const lines = [];
  if (row.kind === 'not_completed') lines.push(`Inició la adhesión el ${formatDate(row.event_at)}.`);
  if (row.kind === 'rejected') {
    const times = row.failure_count > 1 ? ` (${row.failure_count} rechazos)` : '';
    lines.push(`Último rechazo: ${formatDate(row.event_at)}${times}.`);
  }
  if (row.kind === 'cancelled') lines.push(`Lo canceló el ${formatDate(row.event_at)}.`);
  if (row.affiliate_phone) lines.push(`Teléfono: ${row.affiliate_phone}`);
  lines.push(NEXT_STEPS[row.kind]);
  return { title, message: lines.join('\n') };
}

/**
 * One run: every due alert is claimed, then sent.
 *
 * @param {{ supabaseAdmin: any, waha?: { sendText: (args: { phone: string, text: string }) => Promise<any> } | null, logger?: Pick<Console, 'log' | 'error'>, pendingAfter?: string }} deps
 * @returns {Promise<{ ok: true, due: number, sent: number, skipped: number, errors: number } | { ok: false, error: string }>}
 */
export async function runDebitAdvisorAlerts({
  supabaseAdmin,
  waha = null,
  logger = console,
  pendingAfter = DEBIT_ADVISOR_ALERTS_PENDING_AFTER,
}) {
  try {
    const { data: due, error } = await supabaseAdmin.rpc('debit_advisor_alerts_due', { p_pending_after: pendingAfter });
    if (error) throw error;

    const summary = { due: (due || []).length, sent: 0, skipped: 0, errors: 0 };
    for (const row of due || []) {
      const { error: claimError } = await supabaseAdmin.from('debit_advisor_alerts').insert({
        subscription_id: row.subscription_id,
        kind: row.kind,
        event_at: row.event_at,
        advisor_id: row.advisor_id,
      });
      if (claimError) {
        if (claimError.code === UNIQUE_VIOLATION) summary.skipped++;
        else {
          summary.errors++;
          logger.error(`${LOG} claim failed for subscription ${row.subscription_id}:`, claimError.message);
        }
        continue;
      }

      const { title, message } = buildDebitAlert(row);
      const { error: notifyError } = await supabaseAdmin.from('notifications').insert({
        user_id: row.advisor_id,
        title,
        message,
        type: 'warning',
        link: '/collections',
      });
      if (notifyError) {
        summary.errors++;
        logger.error(`${LOG} in-app notice failed for advisor ${row.advisor_id}:`, notifyError.message);
      }

      const phone = waha ? normalizeArgentinePhone(row.advisor_phone) : null;
      if (phone) {
        try {
          await waha.sendText({ phone, text: `${title}\n${message}` });
        } catch (err) {
          summary.errors++;
          logger.error(`${LOG} WhatsApp notice failed for advisor ${row.advisor_id}:`, err?.message || String(err));
        }
      }
      summary.sent++;
    }

    logger.log(`${LOG} due=${summary.due} sent=${summary.sent} skipped=${summary.skipped} errors=${summary.errors}`);
    return { ok: true, ...summary };
  } catch (err) {
    const message = err?.message || String(err);
    logger.error(`${LOG} run failed:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Runs once now and then every `intervalMs`; ticks never overlap. Without a service client it
 * does nothing.
 *
 * @returns {{ stop: () => void, skipped?: boolean }}
 */
export function startDebitAdvisorAlertsJob({
  supabaseAdmin,
  waha = null,
  intervalMs = DEBIT_ADVISOR_ALERTS_INTERVAL_MS,
  logger = console,
} = {}) {
  if (!supabaseAdmin) return { stop() {}, skipped: true };

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDebitAdvisorAlerts({ supabaseAdmin, waha, logger });
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
