/**
 * Retention for the WhatsApp bot (odd/tasks/whatsapp-bot.md, S7).
 * Messages from contacts that are not affiliates may carry health data, so a
 * conversation is deleted 15 days after its last activity. Processed WAHA
 * message ids only guard against webhook retries and are kept 7 days.
 */
export const CONVERSATION_RETENTION_DAYS = 15;
export const INBOUND_RETENTION_DAYS = 7;
export const WHATSAPP_BOT_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function purgeWhatsappBotData({ supabaseAdmin, now = () => new Date() }) {
  const t = now().getTime();
  const targets = [
    ['whatsapp_bot_conversations', 'updated_at', CONVERSATION_RETENTION_DAYS],
    ['whatsapp_bot_inbound', 'received_at', INBOUND_RETENTION_DAYS],
  ];
  for (const [table, column, days] of targets) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .lt(column, new Date(t - days * DAY_MS).toISOString());
    if (error) throw new Error(error.message);
  }
}

/** Runs the purge now and every 24 hours. Failures are logged; the next run retries. */
export function startWhatsappBotRetentionJob({ supabaseAdmin, log = console }) {
  const run = () =>
    purgeWhatsappBotData({ supabaseAdmin }).catch((err) =>
      log.error?.('[whatsapp-bot] retention purge failed:', err.message),
    );
  run();
  const timer = setInterval(run, WHATSAPP_BOT_RETENTION_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
