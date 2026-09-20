import { describe, it, expect, vi } from 'vitest';
import { createAdhesionPreapproval, createAdhesionCheckoutPreference, postAdhesionCheckoutPayment } from '../adhesionPayments.js';

const PLANS = [
  { id: 'p-ind', name: 'Individual', plan_kind: 'individual', payment_option: 'standard', paid_months: 1, is_offered: true, is_default: true, monthly_cost: 14999 },
  { id: 'p-fam', name: 'Familiar', plan_kind: 'familiar', payment_option: 'standard', paid_months: 1, is_offered: true, monthly_cost: 49999 },
  { id: 'p-card', name: 'Familiar Tarjeta', plan_kind: 'familiar', payment_option: 'card_debit', paid_months: 1, is_offered: true, monthly_cost: 39999 },
  { id: 'p-s6', name: 'Familiar Semestral', plan_kind: 'familiar', payment_option: 'prepaid_6', paid_months: 6, is_offered: true, monthly_cost: 39999 },
  { id: 'p-a12', name: 'Familiar Anual', plan_kind: 'familiar', payment_option: 'prepaid_12', paid_months: 12, is_offered: true, monthly_cost: 39999 },
];

/**
 * Chainable stub: plans come from PLANS (filtered by eq); the adhesion request
 * and subscription rows are canned. insert/update are recorded.
 */
function createDb({ request = null, subscription = null, insertError = null, updateError = null } = {}) {
  const writes = { inserts: [], updates: [] };
  function from(table) {
    const filters = { eq: {} };
    let mode = 'select';
    const rows = () => {
      if (table === 'plans') return PLANS.filter((p) => Object.entries(filters.eq).every(([c, v]) => p[c] === v));
      if (table === 'adhesion_requests') return request ? [request] : [];
      if (table === 'affiliate_payment_subscriptions') return subscription ? [subscription] : [];
      return [];
    };
    const builder = {
      select: () => builder,
      eq: (c, v) => { filters.eq[c] = v; return builder; },
      is: () => builder,
      limit: () => builder,
      insert: (p) => { mode = 'insert'; writes.inserts.push({ table, payload: p }); return builder; },
      update: (p) => { mode = 'update'; writes.updates.push({ table, payload: p, filters }); return builder; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => {
        const r = rows()[0] ?? null;
        return { data: r, error: r ? null : { message: 'not found' } };
      },
      then: (resolve, reject) => {
        let result = { data: rows(), error: null };
        if (mode === 'insert') result = { data: null, error: insertError };
        if (mode === 'update') result = { data: null, error: updateError };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from, writes };
}

const nextBillingDate = () => '2026-10-10T00:00:00.000-03:00';

function ctx(db, mpFetch) {
  return { supabaseAdmin: db, mpFetch, publicAppUrl: 'https://app.test', nextBillingDate };
}

describe('createAdhesionPreapproval', () => {
  const baseRequest = { titular_email: 'a@b.com', titular_dni: '123', plan_type: 'familiar', payment_method: 'card_debit', preferred_billing_day: 5 };

  it('400 without adhesionRequestId', async () => {
    const r = await createAdhesionPreapproval(ctx(createDb(), vi.fn()), {});
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('monthly card option: frequency 1 at monthly cost, records the subscription', async () => {
    const db = createDb({ request: baseRequest });
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pre-1', init_point: 'https://mp/pre-1' });
    const r = await createAdhesionPreapproval(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r).toEqual({ status: 200, body: { ok: true, initPoint: 'https://mp/pre-1' } });
    const body = JSON.parse(mpFetch.mock.calls[0][1].body);
    expect(body.auto_recurring).toMatchObject({ frequency: 1, frequency_type: 'months', transaction_amount: 39999, currency_id: 'ARS' });
    expect(body.external_reference).toBe('adhesion:adh-1');
    expect(db.writes.inserts[0].payload).toMatchObject({ adhesion_request_id: 'adh-1', mp_preapproval_id: 'pre-1', discounted_monthly_cost: 39999, billing_day: 5 });
  });

  it('semester and annual recur every 6 / 12 months at monthly_cost x months', async () => {
    for (const [method, freq, amount] of [['prepaid_6', 6, 239994], ['prepaid_12', 12, 479988]]) {
      const db = createDb({ request: { ...baseRequest, payment_method: method } });
      const mpFetch = vi.fn().mockResolvedValue({ id: 'p', init_point: 'x' });
      await createAdhesionPreapproval(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
      const body = JSON.parse(mpFetch.mock.calls[0][1].body);
      expect(body.auto_recurring).toMatchObject({ frequency: freq, frequency_type: 'months', transaction_amount: amount });
      expect(db.writes.inserts[0].payload.discounted_monthly_cost).toBe(amount);
    }
  });

  it('serves Individual (no longer refused)', async () => {
    const db = createDb({ request: { ...baseRequest, plan_type: 'individual', payment_method: 'monthly' } });
    const mpFetch = vi.fn().mockResolvedValue({ id: 'p', init_point: 'x' });
    const r = await createAdhesionPreapproval(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(200);
    expect(JSON.parse(mpFetch.mock.calls[0][1].body).auto_recurring.transaction_amount).toBe(14999);
  });

  it('is idempotent: reuses the recorded preapproval without creating another', async () => {
    const db = createDb({ request: baseRequest, subscription: { mp_preapproval_id: 'pre-9' } });
    const mpFetch = vi.fn().mockResolvedValue({ init_point: 'https://mp/pre-9' });
    const r = await createAdhesionPreapproval(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r).toEqual({ status: 200, body: { ok: true, initPoint: 'https://mp/pre-9' } });
    expect(mpFetch).toHaveBeenCalledTimes(1);
    expect(mpFetch.mock.calls[0][0]).toBe('/preapproval/pre-9');
    expect(db.writes.inserts).toHaveLength(0);
  });

  it('returns 502 { ok:false, error } when MP creation fails and records nothing', async () => {
    const db = createDb({ request: baseRequest });
    const mpFetch = vi.fn().mockRejectedValue(new Error('boom'));
    const r = await createAdhesionPreapproval(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
    expect(typeof r.body.error).toBe('string');
    expect(db.writes.inserts).toHaveLength(0);
  });

  it('returns 502 when re-fetching the existing preapproval fails', async () => {
    const db = createDb({ request: baseRequest, subscription: { mp_preapproval_id: 'pre-9' } });
    const r = await createAdhesionPreapproval(ctx(db, vi.fn().mockRejectedValue(new Error('x'))), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(502);
  });

  it('404 when the adhesion request does not exist', async () => {
    const r = await createAdhesionPreapproval(ctx(createDb(), vi.fn()), { adhesionRequestId: 'nope' });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
  });

  it('400 for methods that pay through Checkout instead', async () => {
    const db = createDb({ request: { ...baseRequest, payment_method: 'cash' } });
    const mpFetch = vi.fn();
    const r = await createAdhesionPreapproval(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(400);
    expect(mpFetch).not.toHaveBeenCalled();
  });

  it('409 when the subscription row cannot be recorded (concurrent duplicate)', async () => {
    const db = createDb({ request: baseRequest, insertError: { message: 'dup' } });
    const r = await createAdhesionPreapproval(ctx(db, vi.fn().mockResolvedValue({ id: 'p', init_point: 'x' })), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(409);
    expect(r.body.ok).toBe(false);
  });
});

describe('createAdhesionCheckoutPreference', () => {
  const req = { titular_email: 'a@b.com', titular_dni: '123', plan_type: 'familiar', payment_method: 'cash', mp_checkout_preference_id: null, payment_status: null };

  it('400 without adhesionRequestId', async () => {
    const r = await createAdhesionCheckoutPreference(ctx(createDb(), vi.fn()), {});
    expect(r.status).toBe(400);
  });

  it('creates a first-period preference tied to the adhesion and stores its id', async () => {
    const db = createDb({ request: req });
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pref-1', init_point: 'https://mp/pref-1' });
    const r = await createAdhesionCheckoutPreference(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r).toEqual({ status: 200, body: { ok: true, initPoint: 'https://mp/pref-1' } });
    expect(mpFetch.mock.calls[0][0]).toBe('/checkout/preferences');
    const body = JSON.parse(mpFetch.mock.calls[0][1].body);
    expect(body.external_reference).toBe('adhesion:adh-1:checkout');
    expect(body.items).toEqual([expect.objectContaining({ quantity: 1, unit_price: 49999, currency_id: 'ARS' })]);
    expect(body.payer).toEqual({ email: 'a@b.com' });
    expect(body.back_urls.success).toBe('https://app.test/');
    expect(body.notification_url).toBe('https://app.test/api/webhooks/mercadopago');
    expect(db.writes.updates[0].payload).toEqual({ mp_checkout_preference_id: 'pref-1', payment_status: 'pending' });
  });

  it('falls back to the dni email when the titular has none', async () => {
    const db = createDb({ request: { ...req, titular_email: '  ' } });
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pref-1', init_point: 'x' });
    await createAdhesionCheckoutPreference(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(JSON.parse(mpFetch.mock.calls[0][1].body).payer.email).toBe('123@medinex-paciente.com');
  });

  it('is idempotent: reuses the stored preference', async () => {
    const db = createDb({ request: { ...req, mp_checkout_preference_id: 'pref-7' } });
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pref-7', init_point: 'https://mp/pref-7' });
    const r = await createAdhesionCheckoutPreference(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r).toEqual({ status: 200, body: { ok: true, initPoint: 'https://mp/pref-7' } });
    expect(mpFetch).toHaveBeenCalledTimes(1);
    expect(mpFetch.mock.calls[0][0]).toBe('/checkout/preferences/pref-7');
    expect(db.writes.updates).toHaveLength(0);
  });

  it('400 when the payment method does not require checkout', async () => {
    for (const method of ['card_debit', 'prepaid_6']) {
      const mpFetch = vi.fn();
      const r = await createAdhesionCheckoutPreference(ctx(createDb({ request: { ...req, payment_method: method } }), mpFetch), { adhesionRequestId: 'adh-1' });
      expect(r.status).toBe(400);
      expect(mpFetch).not.toHaveBeenCalled();
    }
    const r = await createAdhesionCheckoutPreference(ctx(createDb({ request: { ...req, plan_type: 'individual' } }), vi.fn()), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(400);
  });

  it('409 when the first payment was already approved', async () => {
    const db = createDb({ request: { ...req, mp_checkout_preference_id: 'pref-7', payment_status: 'approved' } });
    const mpFetch = vi.fn();
    const r = await createAdhesionCheckoutPreference(ctx(db, mpFetch), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(409);
    expect(mpFetch).not.toHaveBeenCalled();
  });

  it('502 { ok:false, error } when MP fails', async () => {
    const r = await createAdhesionCheckoutPreference(ctx(createDb({ request: req }), vi.fn().mockRejectedValue(new Error('x'))), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
  });

  it('502 when the preference id cannot be stored', async () => {
    const db = createDb({ request: req, updateError: { message: 'x' } });
    const r = await createAdhesionCheckoutPreference(ctx(db, vi.fn().mockResolvedValue({ id: 'p', init_point: 'x' })), { adhesionRequestId: 'adh-1' });
    expect(r.status).toBe(502);
  });

  it('404 for an unknown adhesion request', async () => {
    const r = await createAdhesionCheckoutPreference(ctx(createDb(), vi.fn()), { adhesionRequestId: 'nope' });
    expect(r.status).toBe(404);
  });
});

describe('postAdhesionCheckoutPayment', () => {
  it('calls the ledger RPC with the adhesion id and maps a posted result', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: { posted: true, reason: 'posted', invoice_id: 'inv-1' }, error: null }) };
    const result = await postAdhesionCheckoutPayment(db, 'adh-1');
    expect(db.rpc).toHaveBeenCalledWith('post_adhesion_checkout_payment', { p_adhesion_request_id: 'adh-1' });
    expect(result).toEqual({ ok: true, posted: true, reason: 'posted', invoiceId: 'inv-1' });
  });

  it('maps a non-posted business answer (already_posted) without flagging an error', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: { posted: false, reason: 'already_posted', invoice_id: null }, error: null }) };
    expect(await postAdhesionCheckoutPayment(db, 'adh-1')).toEqual({ ok: true, posted: false, reason: 'already_posted', invoiceId: null });
  });

  it('returns ok:false with the message when the RPC reports an error', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }) };
    expect(await postAdhesionCheckoutPayment(db, 'adh-1')).toEqual({ ok: false, error: 'db down' });
  });

  it('never throws: a rejected RPC call becomes ok:false', async () => {
    const db = { rpc: vi.fn().mockRejectedValue(new Error('network')) };
    expect(await postAdhesionCheckoutPayment(db, 'adh-1')).toEqual({ ok: false, error: 'network' });
  });

  it('treats an empty RPC payload as an error', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    expect(await postAdhesionCheckoutPayment(db, 'adh-1')).toMatchObject({ ok: false });
  });
});
