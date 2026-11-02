import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../adhesionPaymentLinkDelivery.js', () => ({
  sendAdhesionPaymentLink: vi.fn(),
}));

import { sendAdhesionPaymentLink } from '../adhesionPaymentLinkDelivery.js';
import { sendAffiliatePaymentLink } from '../affiliatePaymentLink.js';

const guardFilters = [];

function createSupabaseStub({ request = { id: 'adh-1' }, authorized = null } = {}) {
  const from = (table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      or: (filter) => { guardFilters.push({ or: filter }); return chain; },
      in: (_col, statuses) => { guardFilters.push({ statuses }); return chain; },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: table === 'adhesion_requests' ? request : authorized,
        error: null,
      }),
    };
    return chain;
  };
  return { from };
}

const ctx = (db) => ({ supabaseAdmin: createSupabaseStub(db), mpFetch: vi.fn() });

describe('sendAffiliatePaymentLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardFilters.length = 0;
    sendAdhesionPaymentLink.mockResolvedValue({ status: 200, body: { ok: true, status: 'sent' } });
  });

  it('sends the link of the request that approved this affiliate', async () => {
    const result = await sendAffiliatePaymentLink(ctx(), { profileId: 'p1', channel: 'whatsapp' });
    expect(result).toEqual({ status: 200, body: { ok: true, status: 'sent' } });
    expect(sendAdhesionPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ mpFetch: expect.any(Function) }),
      { adhesionRequestId: 'adh-1', channel: 'whatsapp' }
    );
  });

  it('returns 404 when the affiliate has no adhesion request', async () => {
    const result = await sendAffiliatePaymentLink(ctx({ request: null }), { profileId: 'p1', channel: 'email' });
    expect(result.status).toBe(404);
    expect(result.body.ok).toBe(false);
    expect(sendAdhesionPaymentLink).not.toHaveBeenCalled();
  });

  it('returns 409 when the débito automático is already authorized', async () => {
    const result = await sendAffiliatePaymentLink(ctx({ authorized: { status: 'authorized' } }), { profileId: 'p1', channel: 'email' });
    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/ya tiene/i);
    expect(sendAdhesionPaymentLink).not.toHaveBeenCalled();
  });

  it('looks for an active subscription by profile (in-app enrollment) or by request, including payment_failed', async () => {
    await sendAffiliatePaymentLink(ctx(), { profileId: 'p1', channel: 'email' });
    expect(guardFilters).toContainEqual({ or: 'profile_id.eq.p1,adhesion_request_id.eq.adh-1' });
    expect(guardFilters).toContainEqual({ statuses: ['authorized', 'payment_failed'] });
  });

  it('returns 400 when the profile id is missing', async () => {
    const result = await sendAffiliatePaymentLink(ctx(), { channel: 'email' });
    expect(result.status).toBe(400);
    expect(sendAdhesionPaymentLink).not.toHaveBeenCalled();
  });
});
