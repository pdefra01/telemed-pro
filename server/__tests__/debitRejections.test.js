import { describe, it, expect, vi, afterEach } from 'vitest';
import { runDebitRejectionSync, startDebitRejectionJob } from '../debitRejections.js';

const SEARCH = (id) => `/authorized_payments/search?preapproval_id=${id}`;
const RECENT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const OLD = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();

/** In-memory service client: the subscriptions query and the events lookup the job uses. */
function createSupabaseStub({ subscriptions = [], events = [], subscriptionsError = null } = {}) {
  const queries = [];
  const from = (table) => {
    const filters = [];
    let limitN = null;
    const builder = {
      select: () => builder,
      in: (col, vals) => { filters.push((r) => vals.includes(r[col])); return builder; },
      not: (col, op, val) => { if (op === 'is' && val === null) filters.push((r) => r[col] != null); return builder; },
      gt: (col, val) => { filters.push((r) => r[col] > val); return builder; },
      eq: (col, val) => { filters.push((r) => r[col] === val); return builder; },
      order: () => builder,
      limit: (n) => { limitN = n; return builder; },
      maybeSingle: async () => {
        const rows = (table === 'mercadopago_events' ? events : []).filter((r) => filters.every((f) => f(r)));
        return { data: rows[0] || null, error: null };
      },
      then: (resolve) => {
        queries.push(table);
        if (table === 'affiliate_payment_subscriptions' && subscriptionsError) {
          return resolve({ data: null, error: subscriptionsError });
        }
        let rows = (table === 'affiliate_payment_subscriptions' ? subscriptions : [])
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b) => (a.id > b.id ? 1 : -1));
        if (limitN != null) rows = rows.slice(0, limitN);
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  };
  const rpc = vi.fn(async () => ({ data: 'status_applied', error: null }));
  return { from, rpc, queries };
}

const quietLogger = () => ({ log: vi.fn(), error: vi.fn() });

afterEach(() => {
  vi.useRealTimers();
});

describe('runDebitRejectionSync', () => {
  it('replays a rejection whose webhook never arrived through the webhook handler', async () => {
    const supabaseAdmin = createSupabaseStub({
      subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' }],
    });
    const rejected = {
      id: 'ap-1', status: 'processed', preapproval_id: 'pre-1', last_modified: RECENT,
      payment: { id: 'pay-1', status: 'rejected' },
    };
    const mpFetch = vi.fn(async (path) => {
      if (path === SEARCH('pre-1')) return { paging: { total: 1 }, results: [rejected] };
      if (path === '/authorized_payments/ap-1') return rejected;
      if (path === '/v1/payments/pay-1') return { id: 'pay-1', status: 'rejected' };
      throw new Error(`Unexpected path: ${path}`);
    });
    const logger = quietLogger();

    const result = await runDebitRejectionSync({ supabaseAdmin, mpFetch, logger });

    expect(result).toMatchObject({ ok: true, checked: 1, replayed: 1, rejected: 1, alreadyRecorded: 0, errors: 0 });
    // Same re-fetch the webhook does, then the same RPC with the same event key.
    expect(mpFetch).toHaveBeenCalledWith('/authorized_payments/ap-1');
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_subscription_event', expect.objectContaining({
      p_mp_preapproval_id: 'pre-1',
      p_event_type: 'subscription_authorized_payment_rejected',
      p_mp_resource_id: 'ap-1',
      p_new_status: 'payment_failed',
    }));
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toContain('checked=1 replayed=1 rejected=1');
  });

  it('skips an invoice already recorded, a non-terminal one and an old one', async () => {
    const supabaseAdmin = createSupabaseStub({
      subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'payment_failed' }],
      events: [{ id: 'e1', event_type: 'subscription_authorized_payment_rejected', mp_resource_id: 'ap-1' }],
    });
    const mpFetch = vi.fn(async (path) => {
      if (path === SEARCH('pre-1')) {
        return {
          results: [
            { id: 'ap-1', status: 'processed', last_modified: RECENT, payment: { id: 'pay-1', status: 'rejected' } },
            { id: 'ap-2', status: 'recycling', last_modified: RECENT, payment: { id: 'pay-2', status: 'rejected' } },
            { id: 'ap-0', status: 'processed', last_modified: OLD, payment: { id: 'pay-0', status: 'rejected' } },
          ],
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await runDebitRejectionSync({ supabaseAdmin, mpFetch, logger: quietLogger() });

    expect(result).toMatchObject({ ok: true, checked: 1, replayed: 0, alreadyRecorded: 1, errors: 0 });
    expect(mpFetch).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('only asks MP for live debit subscriptions and bounds the work per run', async () => {
    const supabaseAdmin = createSupabaseStub({
      subscriptions: [
        { id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' },
        { id: 's2', mp_preapproval_id: 'pre-2', status: 'payment_failed' },
        { id: 's3', mp_preapproval_id: 'pre-3', status: 'authorized' },
        { id: 's4', mp_preapproval_id: 'pre-4', status: 'cancelled' },
        { id: 's5', mp_preapproval_id: null, status: 'pending' },
      ],
    });
    const mpFetch = vi.fn(async () => ({ results: [] }));

    const first = await runDebitRejectionSync({ supabaseAdmin, mpFetch, logger: quietLogger(), batchSize: 2 });
    expect(mpFetch.mock.calls.map((c) => c[0])).toEqual([SEARCH('pre-1'), SEARCH('pre-2')]);
    expect(first).toMatchObject({ ok: true, checked: 2, nextAfterId: 's2' });

    mpFetch.mockClear();
    const second = await runDebitRejectionSync({ supabaseAdmin, mpFetch, logger: quietLogger(), batchSize: 2, afterId: first.nextAfterId });
    expect(mpFetch.mock.calls.map((c) => c[0])).toEqual([SEARCH('pre-3')]);
    // A short page means the roster was covered: the next run starts over.
    expect(second).toMatchObject({ ok: true, checked: 1, nextAfterId: null });
  });

  it('logs an MP error, keeps going with the next subscription and never throws', async () => {
    const supabaseAdmin = createSupabaseStub({
      subscriptions: [
        { id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' },
        { id: 's2', mp_preapproval_id: 'pre-2', status: 'authorized' },
      ],
    });
    const mpFetch = vi.fn(async (path) => {
      if (path === SEARCH('pre-1')) throw new Error('MP 500');
      return { results: [] };
    });
    const logger = quietLogger();

    const result = await runDebitRejectionSync({ supabaseAdmin, mpFetch, logger });

    expect(result).toMatchObject({ ok: true, checked: 2, errors: 1 });
    expect(mpFetch).toHaveBeenCalledWith(SEARCH('pre-2'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[debit-rejections]'), expect.stringContaining('MP 500'));
  });

  it('returns ok:false and logs when the subscriptions cannot be read', async () => {
    const supabaseAdmin = createSupabaseStub({ subscriptionsError: { message: 'db down' } });
    const logger = quietLogger();

    const result = await runDebitRejectionSync({ supabaseAdmin, mpFetch: vi.fn(), logger });

    expect(result).toEqual({ ok: false, error: 'db down' });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('startDebitRejectionJob', () => {
  it('is skipped without Mercado Pago or without a service client', () => {
    expect(startDebitRejectionJob({ supabaseAdmin: createSupabaseStub(), mpFetch: null }).skipped).toBe(true);
    expect(startDebitRejectionJob({ supabaseAdmin: null, mpFetch: vi.fn() }).skipped).toBe(true);
  });

  it('runs at start and on every interval, never overlapping a run still in flight', async () => {
    vi.useFakeTimers();
    let release;
    const mpFetch = vi.fn(() => new Promise((resolve) => { release = () => resolve({ results: [] }); }));
    const supabaseAdmin = createSupabaseStub({ subscriptions: [{ id: 's1', mp_preapproval_id: 'pre-1', status: 'authorized' }] });

    const job = startDebitRejectionJob({ supabaseAdmin, mpFetch, intervalMs: 1000, logger: quietLogger() });
    await vi.advanceTimersByTimeAsync(0);
    expect(mpFetch).toHaveBeenCalledTimes(1);

    // The first run is still waiting on MP: the next tick does not start another.
    await vi.advanceTimersByTimeAsync(1000);
    expect(mpFetch).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mpFetch).toHaveBeenCalledTimes(2);

    job.stop();
  });
});
