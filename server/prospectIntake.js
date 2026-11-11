// server/prospectIntake.js
//
// Automatic prospect intake (odd/tasks/commercial-crm.md, S16-S18). The database
// function sync_prospects_intake() turns consented lead surveys into prospects and
// advances the matching prospect when an adhesion request is pending or approved.
// It is idempotent, so the server simply runs it at start and every few minutes
// with the service role. A failed run is logged and retried on the next tick; it
// never takes the server down.

export const PROSPECT_INTAKE_INTERVAL_MS = 10 * 60 * 1000;

const LOG = '[prospect-intake]';

/**
 * @param {{ supabaseAdmin: object, logger?: Pick<Console, 'log' | 'error'> }} deps
 * @returns {Promise<{ ok: true, created: number, interested: number, converted: number } | { ok: false, error: string }>}
 */
export async function runProspectIntake({ supabaseAdmin, logger = console }) {
  try {
    const { data, error } = await supabaseAdmin.rpc('sync_prospects_intake');
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const result = {
      ok: true,
      created: Number(row?.prospects_created || 0),
      interested: Number(row?.prospects_interested || 0),
      converted: Number(row?.prospects_converted || 0),
    };
    if (result.created || result.interested || result.converted) {
      logger.log(`${LOG} created=${result.created} interested=${result.interested} converted=${result.converted}`);
    }
    return result;
  } catch (err) {
    const message = err?.message || String(err);
    logger.error(`${LOG} run failed:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Runs the intake once now and then every `intervalMs`. Runs never overlap.
 * Without a service client it does nothing.
 *
 * @returns {{ stop: () => void, skipped?: boolean }}
 */
export function startProspectIntakeJob({ supabaseAdmin, intervalMs = PROSPECT_INTAKE_INTERVAL_MS, logger = console } = {}) {
  if (!supabaseAdmin) return { stop() {}, skipped: true };

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runProspectIntake({ supabaseAdmin, logger });
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
