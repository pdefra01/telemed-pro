import { describe, it, expect } from 'vitest';
import { findConfirmedProfileIds, splitConfirmedSales } from '../salesConfirmation.js';

/**
 * Chainable Supabase stub for the ledger query. `paidIds` are the affiliates that
 * have a positive payment movement; the recorded filters let the tests assert
 * what was asked.
 */
function createLedgerStub({ paidIds = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = { eq: {}, gt: {}, in: {} };
      calls.push({ table, filters });
      const builder = {
        select: () => builder,
        eq: (c, v) => { filters.eq[c] = v; return builder; },
        gt: (c, v) => { filters.gt[c] = v; return builder; },
        in: (c, v) => { filters.in[c] = v; return builder; },
        then: (resolve, reject) => {
          const asked = filters.in.entity_id || [];
          const data = error ? null : paidIds.filter((id) => asked.includes(id)).map((entity_id) => ({ entity_id }));
          return Promise.resolve({ data, error }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

describe('findConfirmedProfileIds', () => {
  it('returns the affiliates that have a positive payment movement in the ledger', async () => {
    const stub = createLedgerStub({ paidIds: ['a', 'c'] });

    const result = await findConfirmedProfileIds({ supabaseAdmin: stub }, ['a', 'b', 'c']);

    expect([...result].sort()).toEqual(['a', 'c']);
    expect(stub.calls[0].table).toBe('affiliate_account_movements');
    expect(stub.calls[0].filters.eq.type).toBe('payment');
    expect(stub.calls[0].filters.gt.amount).toBe(0);
  });

  it('does not query anything for an empty list and ignores missing ids', async () => {
    const stub = createLedgerStub();

    expect((await findConfirmedProfileIds({ supabaseAdmin: stub }, [])).size).toBe(0);
    expect((await findConfirmedProfileIds({ supabaseAdmin: stub }, [null, undefined])).size).toBe(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('asks each distinct id once and in chunks, so long lists do not overflow the request', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const stub = createLedgerStub({ paidIds: ['id-0', 'id-449'] });

    const result = await findConfirmedProfileIds({ supabaseAdmin: stub }, [...ids, 'id-0']);

    expect([...result].sort()).toEqual(['id-0', 'id-449']);
    expect(stub.calls.length).toBeGreaterThan(1);
    expect(stub.calls.every((c) => c.filters.in.entity_id.length <= 200)).toBe(true);
    expect(stub.calls.flatMap((c) => c.filters.in.entity_id)).toHaveLength(450);
  });

  it('throws the database error instead of reporting nothing confirmed', async () => {
    const stub = createLedgerStub({ error: new Error('ledger down') });
    await expect(findConfirmedProfileIds({ supabaseAdmin: stub }, ['a'])).rejects.toThrow('ledger down');
  });
});

describe('splitConfirmedSales', () => {
  const sale = (id, approved_profile_id) => ({ id, approved_profile_id, plan_type: 'Plan Familiar', payment_method: 'cash' });

  it('splits approved sales into confirmed and unconfirmed by their ledger payment', async () => {
    const stub = createLedgerStub({ paidIds: ['p1'] });

    const { confirmed, unconfirmed } = await splitConfirmedSales({ supabaseAdmin: stub }, [sale('s1', 'p1'), sale('s2', 'p2')]);

    expect(confirmed.map((s) => s.id)).toEqual(['s1']);
    expect(unconfirmed.map((s) => s.id)).toEqual(['s2']);
  });

  it('treats a sale with no profile as unconfirmed (it cannot have a payment)', async () => {
    const stub = createLedgerStub({ paidIds: ['p1'] });

    const { confirmed, unconfirmed } = await splitConfirmedSales({ supabaseAdmin: stub }, [sale('s1', null), sale('s2', 'p1')]);

    expect(confirmed.map((s) => s.id)).toEqual(['s2']);
    expect(unconfirmed.map((s) => s.id)).toEqual(['s1']);
  });

  it('returns empty lists for no sales', async () => {
    const stub = createLedgerStub();
    expect(await splitConfirmedSales({ supabaseAdmin: stub }, [])).toEqual({ confirmed: [], unconfirmed: [], confirmedIds: new Set() });
    expect(await splitConfirmedSales({ supabaseAdmin: stub }, undefined)).toEqual({ confirmed: [], unconfirmed: [], confirmedIds: new Set() });
  });

  it('exposes the confirmed profile ids so callers can flag other rows without a second query', async () => {
    const stub = createLedgerStub({ paidIds: ['p1'] });

    const { confirmedIds } = await splitConfirmedSales({ supabaseAdmin: stub }, [sale('s1', 'p1'), sale('s2', 'p2')]);

    expect(confirmedIds.has('p1')).toBe(true);
    expect(confirmedIds.has('p2')).toBe(false);
  });
});
