import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../pricing.js', () => ({
  resolveSellablePlan: vi.fn(),
  requiresCheckoutPayment: vi.fn(),
}));
vi.mock('../adhesionPayments.js', () => ({
  createAdhesionPreapproval: vi.fn(),
  createAdhesionCheckoutPreference: vi.fn(),
}));
vi.mock('../whatsapp.js', () => ({
  sendPaymentLinkViaWhatsApp: vi.fn(),
}));
vi.mock('../affiliateActivation.js', () => ({
  sendPaymentLinkEmail: vi.fn(),
}));

import { resolveSellablePlan, requiresCheckoutPayment } from '../pricing.js';
import { createAdhesionPreapproval, createAdhesionCheckoutPreference } from '../adhesionPayments.js';
import { sendPaymentLinkViaWhatsApp } from '../whatsapp.js';
import { sendPaymentLinkEmail } from '../affiliateActivation.js';
import { sendAdhesionPaymentLink } from '../adhesionPaymentLinkDelivery.js';

const REQUEST = {
  titular_email: 'juan@test.com',
  titular_phone: '011 15 1234-5678',
  titular_first_name: 'Juan',
  titular_last_name: 'Pérez',
  plan_type: 'individual',
  payment_method: 'card_debit',
};

const PLAN = { plan_kind: 'individual' };
const PAYMENT_URL = 'https://mp.example/pay/abc';

function createSupabaseStub({ request = REQUEST } = {}) {
  const from = (table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === 'adhesion_requests') return { data: request, error: null };
        return { data: null, error: null };
      },
    };
    return chain;
  };
  return { from };
}

function baseCtx(overrides = {}) {
  return {
    supabaseAdmin: createSupabaseStub(overrides.db),
    mpFetch: vi.fn(),
    publicAppUrl: 'https://app.example',
    nextBillingDate: vi.fn(),
    waha: {},
    createMailTransporter: vi.fn(),
    fromAddress: 'no-reply@medinex.com',
    ...overrides.ctx,
  };
}

describe('sendAdhesionPaymentLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSellablePlan.mockResolvedValue(PLAN);
    requiresCheckoutPayment.mockReturnValue(false);
    createAdhesionPreapproval.mockResolvedValue({ status: 200, body: { ok: true, initPoint: PAYMENT_URL } });
    createAdhesionCheckoutPreference.mockResolvedValue({ status: 200, body: { ok: true, initPoint: PAYMENT_URL } });
    sendPaymentLinkViaWhatsApp.mockResolvedValue({ status: 200, body: { status: 'sent' } });
    sendPaymentLinkEmail.mockResolvedValue({ status: 200, body: { status: 'sent' } });
  });

  it('returns 400 for an invalid channel', async () => {
    const result = await sendAdhesionPaymentLink(baseCtx(), { adhesionRequestId: 'adh-1', channel: 'sms' });
    expect(result.status).toBe(400);
    expect(createAdhesionPreapproval).not.toHaveBeenCalled();
  });

  it('returns 404 when the adhesion request does not exist', async () => {
    const ctx = baseCtx({ db: { request: null } });
    const result = await sendAdhesionPaymentLink(ctx, { adhesionRequestId: 'missing', channel: 'whatsapp' });
    expect(result.status).toBe(404);
    expect(sendPaymentLinkViaWhatsApp).not.toHaveBeenCalled();
  });

  it('returns 500 when the plan cannot be resolved', async () => {
    resolveSellablePlan.mockResolvedValue(null);
    const result = await sendAdhesionPaymentLink(baseCtx(), { adhesionRequestId: 'adh-1', channel: 'whatsapp' });
    expect(result.status).toBe(500);
    expect(sendPaymentLinkViaWhatsApp).not.toHaveBeenCalled();
  });

  it('creates a preapproval and dispatches via whatsapp when checkout is not required', async () => {
    requiresCheckoutPayment.mockReturnValue(false);
    const result = await sendAdhesionPaymentLink(baseCtx(), { adhesionRequestId: 'adh-1', channel: 'whatsapp' });

    expect(createAdhesionPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseAdmin: expect.anything(),
        mpFetch: expect.any(Function),
        publicAppUrl: 'https://app.example',
        nextBillingDate: expect.any(Function),
      }),
      { adhesionRequestId: 'adh-1' }
    );
    expect(createAdhesionCheckoutPreference).not.toHaveBeenCalled();
    expect(sendPaymentLinkViaWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ waha: expect.anything() }),
      { adhesionRequestId: 'adh-1', paymentUrl: PAYMENT_URL }
    );
    expect(result).toEqual({ status: 200, body: { status: 'sent' } });
  });

  it('creates a checkout preference and dispatches via email when checkout is required', async () => {
    requiresCheckoutPayment.mockReturnValue(true);
    const result = await sendAdhesionPaymentLink(baseCtx(), { adhesionRequestId: 'adh-1', channel: 'email' });

    expect(createAdhesionCheckoutPreference).toHaveBeenCalledWith(
      expect.objectContaining({ publicAppUrl: 'https://app.example' }),
      { adhesionRequestId: 'adh-1' }
    );
    expect(createAdhesionPreapproval).not.toHaveBeenCalled();
    expect(sendPaymentLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({ createMailTransporter: expect.any(Function), fromAddress: 'no-reply@medinex.com' }),
      { adhesionRequestId: 'adh-1', email: 'juan@test.com', fullName: 'Juan Pérez', paymentUrl: PAYMENT_URL }
    );
    expect(result).toEqual({ status: 200, body: { status: 'sent' } });
  });

  it('propagates the status when the MP link creation fails', async () => {
    createAdhesionPreapproval.mockResolvedValue({ status: 502, body: { ok: false, error: 'boom' } });
    const result = await sendAdhesionPaymentLink(baseCtx(), { adhesionRequestId: 'adh-1', channel: 'whatsapp' });
    expect(result).toEqual({ status: 502, body: { ok: false, error: 'boom' } });
    expect(sendPaymentLinkViaWhatsApp).not.toHaveBeenCalled();
  });
});
