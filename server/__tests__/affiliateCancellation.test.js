// server/__tests__/affiliateCancellation.test.js
//
// POST /api/affiliates/:id/cancel and the cancellation sweep
// (odd/tasks/affiliate-cancellation.md, S1). The handler is exercised directly
// with a stubbed supabaseAdmin and mpFetch; the route wiring is proven with a
// source-regex assertion on server.js (it cannot be imported).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  cancelAffiliateHandler,
  runAffiliateCancellationSweep,
  startAffiliateCancellationJob,
} from '../affiliateCancellation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ADMIN_ID = '00000000-0000-0000-0000-0000000000ad';
const TITULAR_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const GROUP_ID = '33333333-3333-3333-3333-333333333333';

function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function req(id = TITULAR_ID, userId = ADMIN_ID) {
  return { params: { id }, user: { id: userId }, body: {} };
}

/**
 * Minimal supabase stub: profiles / family_groups / affiliate_payment_subscriptions
 * reads and the cancel_affiliate RPC.
 */
function stub({
  profile = { id: TITULAR_ID, role: 'patient', family_group_id: null, agreement_id: null },
  primaryAffiliateId = TITULAR_ID,
  groupProfiles = [],
  subscriptions = [],
  rpc = { data: [{ profile_id: TITULAR_ID, effective_at: '2026-12-10T00:00:00Z', immediate: false, profiles_cancelled: 1 }], error: null },
} = {}) {
  const calls = { subscriptionProfiles: null };
  const from = vi.fn((table) => {
    const q = {};
    const chain = () => q;
    q.select = vi.fn(chain);
    q.eq = vi.fn((col, val) => { q._eq = [...(q._eq || []), [col, val]]; return q; });
    q.in = vi.fn((col, vals) => { if (table === 'affiliate_payment_subscriptions' && col === 'profile_id') calls.subscriptionProfiles = vals; return q; });
    q.not = vi.fn(chain);
    q.maybeSingle = vi.fn(async () => {
      if (table === 'profiles') return { data: profile, error: null };
      if (table === 'family_groups') return { data: { primary_affiliate_id: primaryAffiliateId }, error: null };
      return { data: null, error: null };
    });
    q.then = (resolveFn, rejectFn) => {
      let result = { data: [], error: null };
      if (table === 'profiles') result = { data: groupProfiles, error: null };
      if (table === 'affiliate_payment_subscriptions') result = { data: subscriptions, error: null };
      return Promise.resolve(result).then(resolveFn, rejectFn);
    };
    return q;
  });
  const supabaseAdmin = { from, rpc: vi.fn(async () => rpc) };
  return { supabaseAdmin, calls };
}

describe('cancelAffiliateHandler (POST /api/affiliates/:id/cancel)', () => {
  it('cancels the MP debit first, then records the cancellation, and reports the effective date', async () => {
    const { supabaseAdmin } = stub({ subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' }] });
    const mpFetch = vi.fn(async () => ({ id: 'pre-1', status: 'cancelled' }));
    const handleSubscriptionEvent = vi.fn(async () => ({ outcome: 'recorded' }));
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch, handleSubscriptionEvent });

    expect(mpFetch).toHaveBeenCalledWith('/preapproval/pre-1', { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
    expect(handleSubscriptionEvent).toHaveBeenCalledWith({ supabaseAdmin }, { resource: { id: 'pre-1', status: 'cancelled' }, kind: 'preapproval' });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('cancel_affiliate', { p_profile_id: TITULAR_ID, p_requested_by: ADMIN_ID });
    expect(mpFetch.mock.invocationCallOrder[0]).toBeLessThan(supabaseAdmin.rpc.mock.invocationCallOrder[0]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      id: TITULAR_ID,
      effectiveAt: '2026-12-10T00:00:00Z',
      immediate: false,
      profilesCancelled: 1,
      debitsCancelled: 1,
    });
  });

  it('fails closed: when MP rejects the cancel nothing is recorded', async () => {
    const { supabaseAdmin } = stub({ subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' }] });
    const mpFetch = vi.fn(async () => { throw new Error('MP 500'); });
    const handleSubscriptionEvent = vi.fn();
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch, handleSubscriptionEvent });

    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expect(handleSubscriptionEvent).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No se pudo cancelar el débito automático en MercadoPago. El afiliado no fue dado de baja; volvé a intentar.',
    });
  });

  it('refuses when there is a debit to cancel but MercadoPago is not configured', async () => {
    const { supabaseAdmin } = stub({ subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' }] });
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch: null, handleSubscriptionEvent: vi.fn() });

    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: 'MercadoPago no está configurado: no se puede cancelar el débito automático. El afiliado no fue dado de baja.',
    });
  });

  it('cancels without touching MP when the affiliate has no open debit', async () => {
    const { supabaseAdmin } = stub({ subscriptions: [] });
    const mpFetch = vi.fn();
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch, handleSubscriptionEvent: vi.fn() });

    expect(mpFetch).not.toHaveBeenCalled();
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('cancel_affiliate', { p_profile_id: TITULAR_ID, p_requested_by: ADMIN_ID });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ debitsCancelled: 0 }));
  });

  it('cancels the debits of every profile of the titular\'s family group', async () => {
    const { supabaseAdmin, calls } = stub({
      profile: { id: TITULAR_ID, role: 'patient', family_group_id: GROUP_ID, agreement_id: null },
      groupProfiles: [{ id: TITULAR_ID }, { id: MEMBER_ID }],
      subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' }],
    });
    const mpFetch = vi.fn(async () => ({ id: 'pre-1', status: 'cancelled' }));
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch, handleSubscriptionEvent: vi.fn() });

    expect(calls.subscriptionProfiles).toEqual([TITULAR_ID, MEMBER_ID]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('refuses a family member who is not the titular before touching MP', async () => {
    const { supabaseAdmin } = stub({
      profile: { id: MEMBER_ID, role: 'patient', family_group_id: GROUP_ID, agreement_id: null },
      primaryAffiliateId: TITULAR_ID,
      subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' }],
    });
    const mpFetch = vi.fn();
    const res = mockRes();

    await cancelAffiliateHandler(req(MEMBER_ID), res, { supabaseAdmin, mpFetch, handleSubscriptionEvent: vi.fn() });

    expect(mpFetch).not.toHaveBeenCalled();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Solo se puede dar de baja al titular del grupo familiar; la baja alcanza a todo el grupo.' });
  });

  it('refuses an agreement (convenio) affiliate', async () => {
    const { supabaseAdmin } = stub({ profile: { id: TITULAR_ID, role: 'patient', family_group_id: null, agreement_id: 'agr-1' } });
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch: vi.fn(), handleSubscriptionEvent: vi.fn() });

    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Los afiliados de un convenio se dan de baja desde el convenio.' });
  });

  it('returns 404 for anything that is not a patient', async () => {
    const { supabaseAdmin } = stub({ profile: { id: TITULAR_ID, role: 'doctor', family_group_id: null, agreement_id: null } });
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch: vi.fn(), handleSubscriptionEvent: vi.fn() });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Afiliado no encontrado.' });
  });

  it('validates the id', async () => {
    const { supabaseAdmin } = stub();
    const res = mockRes();

    await cancelAffiliateHandler(req('not-a-uuid'), res, { supabaseAdmin, mpFetch: vi.fn(), handleSubscriptionEvent: vi.fn() });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Identificador de afiliado inválido.' });
  });

  it('returns 503 without a service client', async () => {
    const res = mockRes();
    await cancelAffiliateHandler(req(), res, { supabaseAdmin: null, mpFetch: vi.fn(), handleSubscriptionEvent: vi.fn() });
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 500 when recording the cancellation fails after MP was cancelled', async () => {
    const { supabaseAdmin } = stub({ rpc: { data: null, error: { message: 'boom', code: 'XX000' } } });
    const res = mockRes();

    await cancelAffiliateHandler(req(), res, { supabaseAdmin, mpFetch: vi.fn(), handleSubscriptionEvent: vi.fn() });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error al registrar la baja. Volvé a intentar: el débito ya cancelado no se vuelve a tocar.' });
  });
});

describe('affiliate cancellation sweep', () => {
  it('applies the due cancellations through the RPC', async () => {
    const supabaseAdmin = { rpc: vi.fn(async () => ({ data: 2, error: null })) };
    const logger = { log: vi.fn(), error: vi.fn() };

    const result = await runAffiliateCancellationSweep({ supabaseAdmin, logger });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('apply_due_affiliate_cancellations');
    expect(result).toEqual({ ok: true, applied: 2 });
  });

  it('logs and survives a failed run', async () => {
    const supabaseAdmin = { rpc: vi.fn(async () => ({ data: null, error: { message: 'down' } })) };
    const logger = { log: vi.fn(), error: vi.fn() };

    const result = await runAffiliateCancellationSweep({ supabaseAdmin, logger });

    expect(result).toEqual({ ok: false, error: 'down' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('does nothing without a service client', () => {
    expect(startAffiliateCancellationJob({ supabaseAdmin: null })).toMatchObject({ skipped: true });
  });
});

describe('server.js wiring', () => {
  const source = readFileSync(resolve(__dirname, '../../server.js'), 'utf8');

  it('registers POST /api/affiliates/:id/cancel behind requireAuth and requireAdmin', () => {
    expect(source).toMatch(/app\.post\(\s*'\/api\/affiliates\/:id\/cancel',\s*requireAuth,\s*requireAdmin,/);
  });

  it('starts the cancellation sweep', () => {
    expect(source).toMatch(/startAffiliateCancellationJob\(\{\s*supabaseAdmin\s*\}\)/);
  });
});
