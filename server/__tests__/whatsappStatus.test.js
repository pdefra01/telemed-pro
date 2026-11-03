import { describe, it, expect, vi } from 'vitest';
import { whatsappStatusHandler } from '../whatsappStatus.js';

function run(waha) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return whatsappStatusHandler({ waha })({}, res).then(() => res);
}

describe('whatsappStatusHandler', () => {
  it('answers the session status reported by the gateway', async () => {
    const res = await run({ getSessionStatus: vi.fn().mockResolvedValue('WORKING') });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'WORKING' });
  });

  it('answers NOT_CONFIGURED when WhatsApp delivery is disabled', async () => {
    const res = await run(null);
    expect(res.json).toHaveBeenCalledWith({ status: 'NOT_CONFIGURED' });
  });
});
