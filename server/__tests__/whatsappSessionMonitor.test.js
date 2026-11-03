import { describe, it, expect, vi } from 'vitest';
import { createWhatsappSessionMonitor } from '../whatsappSessionMonitor.js';

const MINUTE = 60_000;

function setup({ graceMs = 10 * MINUTE } = {}) {
  let ready = true;
  let clock = 0;
  const sendAlert = vi.fn().mockResolvedValue(undefined);
  const waha = { isSessionReady: vi.fn(async () => ready) };
  const monitor = createWhatsappSessionMonitor({ waha, sendAlert, now: () => clock, graceMs });
  return {
    monitor,
    sendAlert,
    setReady: (value) => { ready = value; },
    advance: (ms) => { clock += ms; },
  };
}

describe('createWhatsappSessionMonitor', () => {
  it('stays quiet while the session is WORKING', async () => {
    const { monitor, sendAlert, advance } = setup();
    await monitor.check();
    advance(60 * MINUTE);
    await monitor.check();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('waits out the grace period after boot before alerting (WAHA takes time to reach WORKING)', async () => {
    const { monitor, sendAlert, setReady, advance } = setup();
    setReady(false);
    await monitor.check();
    advance(5 * MINUTE);
    await monitor.check();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('alerts once when the session stays down past the grace period', async () => {
    const { monitor, sendAlert, setReady, advance } = setup();
    setReady(false);
    await monitor.check();
    advance(11 * MINUTE);
    await monitor.check();
    advance(5 * MINUTE);
    await monitor.check();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'down' }));
  });

  it('sends one recovery notice when the session comes back after an alert', async () => {
    const { monitor, sendAlert, setReady, advance } = setup();
    setReady(false);
    await monitor.check();
    advance(11 * MINUTE);
    await monitor.check();
    setReady(true);
    await monitor.check();
    await monitor.check();
    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect(sendAlert).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'recovered' }));
  });

  it('does not send a recovery notice when no alert was sent', async () => {
    const { monitor, sendAlert, setReady, advance } = setup();
    setReady(false);
    await monitor.check();
    advance(2 * MINUTE);
    setReady(true);
    await monitor.check();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('retries the alert on the next check when sending it fails', async () => {
    const { monitor, sendAlert, setReady, advance } = setup();
    sendAlert.mockRejectedValueOnce(new Error('smtp down'));
    setReady(false);
    await monitor.check();
    advance(11 * MINUTE);
    await monitor.check();
    await monitor.check();
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });
});
