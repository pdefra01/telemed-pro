import { describe, it, expect } from 'vitest';
import { computeAdvisorStats } from '../advisorStats.js';

/**
 * Stub of the tables the stats read. `adhesion` rows are split by what the
 * query asks: head count queries, the 100-row sales list, and the approved list.
 */
function createStub({ profile = { promoter_code: 'ADV-1' }, profileError = null, sales = [], approved = [], counts = {}, producer = null, paidIds = [], errors = {} } = {}) {
  const rangeCalls = [];
  return {
    rangeCalls,
    rpc: async (fn, args) => (errors.ledger
      ? { data: null, error: errors.ledger }
      : { data: fn === 'confirmed_affiliate_ids' ? paidIds.filter((id) => (args?.p_profile_ids || []).includes(id)) : [], error: null }),
    from(table) {
      const f = { eq: {}, head: false, limit: null, in: {}, range: null };
      const builder = {
        select: (_cols, opts) => { f.head = Boolean(opts?.head); return builder; },
        eq: (c, v) => { f.eq[c] = v; return builder; },
        gt: () => builder,
        in: (c, v) => { f.in[c] = v; return builder; },
        order: () => builder,
        limit: (n) => { f.limit = n; return builder; },
        range: (from, to) => { f.range = [from, to]; rangeCalls.push([from, to]); return builder; },
        single: async () => ({ data: profile, error: profileError }),
        maybeSingle: async () => ({ data: producer, error: null }),
        then: (resolve, reject) => {
          let result;
          if (table === 'adhesion_requests') {
            if (errors.adhesion) result = { data: null, count: null, error: errors.adhesion };
            else if (f.head) result = { count: counts[f.eq.status ?? 'total'] ?? 0, error: null };
            else if (f.limit) result = { data: sales, error: null };
            else if (f.range) {
              // PostgREST caps every response at 1000 rows, whatever range is asked
              const [from, to] = f.range;
              result = { data: approved.slice(from, Math.min(to + 1, from + 1000)), error: null };
            } else result = { data: approved.slice(0, 1000), error: null };
          } else {
            result = { data: [], error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const sale = (id, status, approved_profile_id = null) => ({
  id, titular_name: `Titular ${id}`, titular_dni: '30123456', plan_type: 'Plan Familiar', status, created_at: '2026-10-01T00:00:00Z', approved_profile_id,
});

describe('computeAdvisorStats', () => {
  it('returns zeros when the advisor has no promoter code', async () => {
    const result = await computeAdvisorStats({ supabaseAdmin: createStub({ profile: { promoter_code: null } }) }, 'adv-1');

    expect(result).toEqual({
      totalSales: 0, approvedSales: 0, pendingSales: 0, confirmedSales: 0, unconfirmedSales: 0,
      linksSharedCount: 0, sales: [],
    });
  });

  it('returns zeros when the profile cannot be read', async () => {
    const result = await computeAdvisorStats({ supabaseAdmin: createStub({ profile: null, profileError: new Error('x') }) }, 'adv-1');
    expect(result.totalSales).toBe(0);
    expect(result.sales).toEqual([]);
  });

  it('keeps the request counts and the links shared', async () => {
    const stub = createStub({ counts: { total: 12, approved: 5, pending: 4 }, producer: { links_shared_count: 30 } });

    const result = await computeAdvisorStats({ supabaseAdmin: stub}, 'adv-1');

    expect(result.totalSales).toBe(12);
    expect(result.approvedSales).toBe(5);
    expect(result.pendingSales).toBe(4);
    expect(result.linksSharedCount).toBe(30);
  });

  it('splits the approved sales by confirmed payment and sends no commission figure (liquidations own it)', async () => {
    const approved = [{ approved_profile_id: 'paid' }, { approved_profile_id: 'unpaid' }, { approved_profile_id: null }];
    const stub = createStub({ approved, paidIds: ['paid'], counts: { approved: 3 } });

    const result = await computeAdvisorStats({ supabaseAdmin: stub }, 'adv-1');

    expect(result.confirmedSales).toBe(1);
    expect(result.unconfirmedSales).toBe(2);
    expect(result).not.toHaveProperty('commissions');
  });

  it('reports every approved sale as unconfirmed when nothing was paid', async () => {
    const approved = [{ approved_profile_id: 'a' }, { approved_profile_id: 'b' }];

    const result = await computeAdvisorStats({ supabaseAdmin: createStub({ approved, paidIds: [] }) }, 'adv-1');

    expect(result.confirmedSales).toBe(0);
    expect(result.unconfirmedSales).toBe(2);
  });

  it('flags each approved sale as paid or not, leaves other statuses unflagged and never leaks the profile id', async () => {
    const sales = [sale('s1', 'approved', 'paid'), sale('s2', 'approved', 'unpaid'), sale('s3', 'pending'), sale('s4', 'rejected')];
    const approved = [{ approved_profile_id: 'paid' }, { approved_profile_id: 'unpaid' }];

    const result = await computeAdvisorStats(
      { supabaseAdmin: createStub({ sales, approved, paidIds: ['paid'] })},
      'adv-1'
    );

    const byId = Object.fromEntries(result.sales.map((s) => [s.id, s]));
    expect(byId.s1.paymentConfirmed).toBe(true);
    expect(byId.s2.paymentConfirmed).toBe(false);
    expect(byId.s3.paymentConfirmed).toBeUndefined();
    expect(byId.s4.paymentConfirmed).toBeUndefined();
    expect(result.sales.every((s) => !('approved_profile_id' in s))).toBe(true);
    expect(byId.s1.titular_name).toBe('Titular s1');
  });

  it('flags a listed approved sale from the ledger even when it is not among the commission rows', async () => {
    // A listed sale (latest 100) whose profile is confirmed must be flagged on its own merits.
    const sales = [sale('s1', 'approved', 'paid-elsewhere')];

    const result = await computeAdvisorStats(
      { supabaseAdmin: createStub({ sales, approved: [], paidIds: ['paid-elsewhere'] })},
      'adv-1'
    );

    expect(result.sales[0].paymentConfirmed).toBe(true);
  });

  it('reads the approved sales in pages, so an advisor with more than 1000 approved sales is counted fully', async () => {
    const approved = Array.from({ length: 2500 }, (_, i) => ({ approved_profile_id: `p-${i}`, plan_type: 'Plan Familiar', payment_method: 'cash' }));
    const paidIds = approved.slice(0, 1200).map((r) => r.approved_profile_id);
    const stub = createStub({ approved, paidIds, counts: { approved: 2500 } });

    const result = await computeAdvisorStats({ supabaseAdmin: stub }, 'adv-1');

    expect(result.confirmedSales).toBe(1200);
    expect(result.unconfirmedSales).toBe(1300);
    expect(stub.rangeCalls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops after the first short page', async () => {
    const stub = createStub({ approved: [{ approved_profile_id: 'a' }] });

    await computeAdvisorStats({ supabaseAdmin: stub}, 'adv-1');

    expect(stub.rangeCalls).toEqual([[0, 999]]);
  });

  it('throws when a query fails, so the route can answer 500', async () => {
    await expect(computeAdvisorStats({ supabaseAdmin: createStub({ errors: { adhesion: new Error('db') } }) }, 'adv-1')).rejects.toThrow('db');
    await expect(computeAdvisorStats({ supabaseAdmin: createStub({ approved: [{ approved_profile_id: 'a' }], errors: { ledger: new Error('ledger') } })}, 'adv-1')).rejects.toThrow('ledger');
  });
});

describe('route wiring', () => {
  it('server.js delegates /api/advisor/stats to computeAdvisorStats behind requireAuth', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../server.js'), 'utf8');

    expect(source).toMatch(/app\.get\(\s*'\/api\/advisor\/stats'\s*,\s*requireAuth\s*,/);
    expect(source).toMatch(/computeAdvisorStats\(\s*\{\s*supabaseAdmin\s*\}\s*,\s*req\.user\.id\s*\)/);
  });
});
