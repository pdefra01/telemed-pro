// WhatsApp (WAHA) session monitor.
//
// A dropped session silently kills every WhatsApp notice (doctor appointment
// notice, payment links, recetas). The monitor polls the session and emails the
// admin once when it stays down past a grace period (WAHA needs a few minutes to
// reach WORKING after the host boots), and once more when it recovers.

const DEFAULT_GRACE_MS = 10 * 60_000;
const DEFAULT_INTERVAL_MS = 2 * 60_000;

export function createWhatsappSessionMonitor({
  waha,
  sendAlert,
  now = () => Date.now(),
  graceMs = DEFAULT_GRACE_MS,
}) {
  let downSince = null; // first check that saw the session down in the current outage
  let alerted = false;

  async function check() {
    const ready = await waha.isSessionReady();

    if (ready) {
      const wasAlerted = alerted;
      downSince = null;
      alerted = false;
      if (wasAlerted) {
        try {
          await sendAlert({ kind: 'recovered' });
        } catch (err) {
          console.error('[whatsapp-monitor] recovery notice failed:', err?.message || err);
        }
      }
      return;
    }

    if (downSince === null) downSince = now();
    if (alerted || now() - downSince < graceMs) return;

    try {
      await sendAlert({ kind: 'down', downSince: new Date(downSince) });
      alerted = true;
    } catch (err) {
      // Not marked as alerted: the next check retries.
      console.error('[whatsapp-monitor] alert failed:', err?.message || err);
    }
  }

  function start({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    const timer = setInterval(() => {
      check().catch((err) => console.error('[whatsapp-monitor] check failed:', err?.message || err));
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  return { check, start };
}

export function buildSessionAlertEmail({ kind, downSince }) {
  if (kind === 'recovered') {
    return {
      subject: 'Medinex: la sesión de WhatsApp volvió a funcionar',
      text: 'La sesión de WhatsApp de la empresa está nuevamente en WORKING. Los avisos y recetas por WhatsApp ya salen.',
    };
  }
  return {
    subject: 'Medinex: la sesión de WhatsApp está caída',
    text:
      'La sesión de WhatsApp de la empresa no está en WORKING' +
      (downSince ? ` desde ${downSince.toISOString()}` : '') +
      '. Mientras siga así no salen los avisos al doctor, los links de pago ni las recetas por WhatsApp.\n\n' +
      'Qué revisar: panel de WAHA → Sessions → default. Si figura SCAN_QR_CODE hay que volver a vincular el celular; ' +
      'si figura STOPPED o FAILED, Start o Restart.',
  };
}
