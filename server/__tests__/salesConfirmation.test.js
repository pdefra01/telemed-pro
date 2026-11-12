import { describe, it, expect } from 'vitest';
import { findConfirmedProfileIds, partitionConfirmed } from '../salesConfirmation.js';

/**
 * Stub of the `confirmed_affiliate_ids` RPC. `paidIds` are the affiliates that
 * have a positive payment movement; the database returns each one once. The
 * recorded calls let the tests assert what was asked.
 */
function createLedgerStub({ paidIds = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      throw new Error(`unexpected table read: ${table}`);
    },
    rpc(fn, args) {
      calls.push({ fn, args });
      const asked = args?.p_profile_ids || [];
      const data = error ? null : paidIds.filter((id) => asked.includes(id));
      return Promise.resolve({ data, error });
    },
  };
}

describe('findConfirmedProfileIds', () => {
  it('returns the affiliates that have a positive payment movement in the ledger', async () => {
    const stub = createLedgerStub({ paidIds: ['a', 'c'] });

    const result = await findConfirmedProfileIds({ supabaseAdmin: stub }, ['a', 'b', 'c']);

    expect([...result].sort()).toEqual(['a', 'c']);
    expect(stub.calls[0]).toEqual({ fn: 'confirmed_affiliate_ids', args: { p_profile_ids: ['a', 'b', 'c'] } });
  });

  it('asks the database for one row per affiliate, never one per payment (so the 1000-row cap cannot cut it)', async () => {
    const stub = createLedgerStub({ paidIds: ['a'] });

    await findConfirmedProfileIds({ supabaseAdmin: stub }, ['a']);

    expect(stub.calls.map((c) => c.fn)).toEqual(['confirmed_affiliate_ids']);
  });

  it('accepts rows returned as objects keyed by the function name', async () => {
    const stub = {
      rpc: async () => ({ data: [{ confirmed_affiliate_ids: 'a' }], error: null }),
    };

    const result = await findConfirmedProfileIds({ supabaseAdmin: stub }, ['a', 'b']);

    expect([...result]).toEqual(['a']);
  });

  it('does not query anything for an empty list and ignores missing ids', async () => {
    const stub = createLedgerStub();

    expect((await findConfirmedProfileIds({ supabaseAdmin: stub }, [])).size).toBe(0);
    expect((await findConfirmedProfileIds({ supabaseAdmin: stub }, [null, undefined])).size).toBe(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('asks each distinct id once and in chunks of at most 200, so long lists do not overflow the request', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const stub = createLedgerStub({ paidIds: ['id-0', 'id-449'] });

    const result = await findConfirmedProfileIds({ supabaseAdmin: stub }, [...ids, 'id-0']);

    expect([...result].sort()).toEqual(['id-0', 'id-449']);
    expect(stub.calls).toHaveLength(3);
    expect(stub.calls.every((c) => c.args.p_profile_ids.length <= 200)).toBe(true);
    expect(stub.calls.flatMap((c) => c.args.p_profile_ids)).toHaveLength(450);
  });

  it('throws the database error instead of reporting nothing confirmed', async () => {
    const stub = createLedgerStub({ error: new Error('ledger down') });
    await expect(findConfirmedProfileIds({ supabaseAdmin: stub }, ['a'])).rejects.toThrow('ledger down');
  });
});

describe('partitionConfirmed', () => {
  const sale = (id, approved_profile_id) => ({ id, approved_profile_id });

  it('splits approved sales into confirmed and unconfirmed by the known confirmed ids', () => {
    const { confirmed, unconfirmed } = partitionConfirmed([sale('s1', 'p1'), sale('s2', 'p2')], new Set(['p1']));

    expect(confirmed.map((s) => s.id)).toEqual(['s1']);
    expect(unconfirmed.map((s) => s.id)).toEqual(['s2']);
  });

  it('treats a sale with no profile as unconfirmed and accepts no sales', () => {
    expect(partitionConfirmed([sale('s1', null)], new Set(['p1'])).unconfirmed.map((s) => s.id)).toEqual(['s1']);
    expect(partitionConfirmed(undefined, new Set())).toEqual({ confirmed: [], unconfirmed: [] });
  });
});
