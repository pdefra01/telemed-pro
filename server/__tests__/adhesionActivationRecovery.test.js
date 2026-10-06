import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  isActivationClaimStale,
  releaseStuckActivation,
  STALE_CLAIM_THRESHOLD_MS,
} from '../adhesionActivationRecovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADHESION_ID = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b';
const USER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-06T12:00:00.000Z');
const STALE_CLAIM = '2026-10-06T11:30:00.000Z'; // 30 min before NOW
const FRESH_CLAIM = '2026-10-06T11:58:00.000Z'; // 2 min before NOW

function buildRow(overrides = {}) {
  return {
    id: ADHESION_ID,
    status: 'pending',
    titular_email: ' Juan_Perez@Test.com ',
    titular_dni: '30123456',
    activation_claimed_at: STALE_CLAIM,
    ...overrides,
  };
}

function buildProfile(overrides = {}) {
  return {
    id: USER_ID,
    role: 'patient',
    email: 'juan_perez@test.com',
    created_at: '2026-10-06T11:30:01.000Z',
    ...overrides,
  };
}

/**
 * Chainable supabaseAdmin fake. Every terminal call (await / maybeSingle) is
 * recorded in `calls` as { table, op, payload, filters } and answered by
 * `respond(call)`, which defaults to `{ data: null, error: null }`.
 */
function createSupabase(respond) {
  const calls = [];
  const deleteUser = vi.fn(async () => ({ data: {}, error: null }));
  const from = (table) => {
    const call = { table, op: 'select', payload: null, filters: [] };
    const run = () => {
      calls.push(call);
      return Promise.resolve(respond(call) || { data: null, error: null });
    };
    const builder = {
      select: () => builder,
      update: (payload) => { call.op = 'update'; call.payload = payload; return builder; },
      delete: () => { call.op = 'delete'; return builder; },
      eq: (c, v) => { call.filters.push(['eq', c, v]); return builder; },
      is: (c, v) => { call.filters.push(['is', c, v]); return builder; },
      ilike: (c, v) => { call.filters.push(['ilike', c, v]); return builder; },
      limit: () => builder,
      maybeSingle: run,
      then: (resolveFn, rejectFn) => run().then(resolveFn, rejectFn),
    };
    return builder;
  };
  return { calls, deleteUser, supabaseAdmin: { from, auth: { admin: { deleteUser } } } };
}

/** Default happy-path responder; `overrides[table:op]` replaces one answer. */
function responder({ row = buildRow(), profiles = [buildProfile()], overrides = {} } = {}) {
  return (call) => {
    const key = `${call.table}:${call.op}`;
    if (key in overrides) return overrides[key](call);
    if (key === 'adhesion_requests:select') {
      const isRowLookup = call.filters.some(([, c]) => c === 'id');
      return { data: isRowLookup ? row : [], error: null };
    }
    if (key === 'profiles:select') return { data: profiles, error: null };
    if (key === 'appointments:select' || key === 'medical_records:select') return { data: [], error: null };
    if (key === 'adhesion_requests:update') return { data: [{ id: ADHESION_ID }], error: null };
    return { data: null, error: null };
  };
}

function find(calls, table, op) {
  return calls.filter((c) => c.table === table && c.op === op);
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('isActivationClaimStale', () => {
  it('uses a 10 minute default threshold', () => {
    expect(STALE_CLAIM_THRESHOLD_MS).toBe(10 * 60 * 1000);
  });

  it('is true for a pending row whose claim is older than the threshold', () => {
    expect(isActivationClaimStale(buildRow(), NOW)).toBe(true);
  });

  it('is false for a fresh claim', () => {
    expect(isActivationClaimStale(buildRow({ activation_claimed_at: FRESH_CLAIM }), NOW)).toBe(false);
  });

  it('is false without a claim, for non-pending rows and for unparsable dates', () => {
    expect(isActivationClaimStale(buildRow({ activation_claimed_at: null }), NOW)).toBe(false);
    expect(isActivationClaimStale(buildRow({ status: 'approved' }), NOW)).toBe(false);
    expect(isActivationClaimStale(buildRow({ activation_claimed_at: 'not-a-date' }), NOW)).toBe(false);
    expect(isActivationClaimStale(null, NOW)).toBe(false);
  });

  it('honors a custom threshold', () => {
    expect(isActivationClaimStale(buildRow({ activation_claimed_at: FRESH_CLAIM }), NOW, 60 * 1000)).toBe(true);
  });
});

describe('releaseStuckActivation — preconditions', () => {
  it('returns 503 without a service-role client', async () => {
    const res = await releaseStuckActivation({}, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(503);
  });

  it('returns 400 for an invalid id', async () => {
    const { supabaseAdmin } = createSupabase(responder());
    const res = await releaseStuckActivation({ supabaseAdmin }, 'abc', { now: NOW });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the request does not exist', async () => {
    const { supabaseAdmin, deleteUser } = createSupabase(responder({ row: null }));
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(404);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('returns 400 when the request is not pending', async () => {
    const { supabaseAdmin, deleteUser } = createSupabase(responder({ row: buildRow({ status: 'approved' }) }));
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('returns 400 when there is no activation claim to release', async () => {
    const { supabaseAdmin } = createSupabase(responder({ row: buildRow({ activation_claimed_at: null }) }));
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(400);
  });

  it('returns 409 and touches nothing while the claim is fresh', async () => {
    const { supabaseAdmin, calls, deleteUser } = createSupabase(
      responder({ row: buildRow({ activation_claimed_at: FRESH_CLAIM }) })
    );
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('La activación está en curso; reintentá en unos minutos.');
    expect(find(calls, 'profiles', 'select')).toHaveLength(0);
    expect(find(calls, 'adhesion_requests', 'update')).toHaveLength(0);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe('releaseStuckActivation — no orphan account', () => {
  it('looks the account up by the normalized titular email and only clears the claim', async () => {
    const { supabaseAdmin, calls, deleteUser } = createSupabase(responder({ profiles: [] }));

    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });

    expect(res).toEqual({ status: 200, body: { released: true, deletedUserId: null } });
    // `_` is a LIKE wildcard and must be escaped.
    expect(find(calls, 'profiles', 'select')[0].filters).toContainEqual(['ilike', 'email', 'juan\\_perez@test.com']);
    expect(deleteUser).not.toHaveBeenCalled();
    const [clear] = find(calls, 'adhesion_requests', 'update');
    expect(clear.payload).toEqual({ activation_claimed_at: null });
    expect(clear.filters).toEqual(expect.arrayContaining([['eq', 'id', ADHESION_ID], ['eq', 'status', 'pending']]));
  });

  it('ignores profiles whose email only matches as a LIKE pattern', async () => {
    const { supabaseAdmin, deleteUser } = createSupabase(
      responder({ profiles: [buildProfile({ email: 'juanXperez@test.com' })] })
    );
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.body).toEqual({ released: true, deletedUserId: null });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('falls back to the synthetic DNI email when the request has no email', async () => {
    const { supabaseAdmin, calls } = createSupabase(responder({ row: buildRow({ titular_email: null }), profiles: [] }));
    await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(find(calls, 'profiles', 'select')[0].filters).toContainEqual(['ilike', 'email', '30123456@medinex-paciente.com']);
  });
});

describe('releaseStuckActivation — refusals (claim kept, user kept)', () => {
  async function expectRefusal(options) {
    const { supabaseAdmin, calls, deleteUser } = createSupabase(responder(options));
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(409);
    expect(typeof res.body.error).toBe('string');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(find(calls, 'adhesion_requests', 'update')).toHaveLength(0);
    expect(find(calls, 'family_groups', 'delete')).toHaveLength(0);
    return res;
  }

  it('refuses when the account is linked to an approved adhesion', async () => {
    await expectRefusal({
      overrides: {
        'adhesion_requests:select': (call) => (call.filters.some(([, c]) => c === 'approved_profile_id')
          ? { data: [{ id: 'other' }], error: null }
          : { data: buildRow(), error: null }),
      },
    });
  });

  it('refuses when the account is not a patient', async () => {
    await expectRefusal({ profiles: [buildProfile({ role: 'doctor' })] });
  });

  it('refuses when the account predates the activation claim', async () => {
    await expectRefusal({ profiles: [buildProfile({ created_at: '2026-01-01T00:00:00.000Z' })] });
  });

  it('refuses when the account already has appointments', async () => {
    await expectRefusal({ overrides: { 'appointments:select': () => ({ data: [{ id: 'apt' }], error: null }) } });
  });

  it('refuses when the account already has medical records', async () => {
    await expectRefusal({ overrides: { 'medical_records:select': () => ({ data: [{ id: 'mr' }], error: null }) } });
  });

  it('refuses when more than one profile matches the email', async () => {
    await expectRefusal({ profiles: [buildProfile(), buildProfile({ id: 'second' })] });
  });
});

describe('releaseStuckActivation — orphan cleanup', () => {
  it('unlinks the MP subscription, removes the family group, deletes the user and clears the claim', async () => {
    const { supabaseAdmin, calls, deleteUser } = createSupabase(responder());

    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });

    expect(res).toEqual({ status: 200, body: { released: true, deletedUserId: USER_ID } });

    const [unlink] = find(calls, 'affiliate_payment_subscriptions', 'update');
    expect(unlink.payload).toEqual({ profile_id: null });
    expect(unlink.filters).toEqual(expect.arrayContaining([
      ['eq', 'adhesion_request_id', ADHESION_ID],
      ['eq', 'profile_id', USER_ID],
    ]));

    const [detach] = find(calls, 'profiles', 'update');
    expect(detach.payload).toEqual({ family_group_id: null });
    expect(detach.filters).toContainEqual(['eq', 'id', USER_ID]);

    const [groups] = find(calls, 'family_groups', 'delete');
    expect(groups.filters).toContainEqual(['eq', 'primary_affiliate_id', USER_ID]);

    expect(deleteUser).toHaveBeenCalledWith(USER_ID);

    const [clear] = find(calls, 'adhesion_requests', 'update');
    expect(clear.payload).toEqual({ activation_claimed_at: null });
    expect(clear.filters).toContainEqual(['eq', 'status', 'pending']);

    // Order: unlink/cleanup before the user deletion, claim cleared last.
    const order = calls.map((c) => `${c.table}:${c.op}`);
    expect(order.indexOf('family_groups:delete')).toBeLessThan(order.lastIndexOf('adhesion_requests:update'));
  });

  it('returns 500 and keeps the claim when deleting the auth user fails', async () => {
    const { supabaseAdmin, calls, deleteUser } = createSupabase(responder());
    deleteUser.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(500);
    expect(find(calls, 'adhesion_requests', 'update')).toHaveLength(0);
  });

  it('returns 500 and never deletes the user when a cleanup step fails', async () => {
    const { supabaseAdmin, deleteUser } = createSupabase(responder({
      overrides: { 'family_groups:delete': () => ({ data: null, error: { message: 'fk' } }) },
    }));
    const res = await releaseStuckActivation({ supabaseAdmin }, ADHESION_ID, { now: NOW });
    expect(res.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe('/api/adhesion-requests/:id/release-activation route registration (server.js source)', () => {
  it('is admin-only and delegates to releaseStuckActivation', () => {
    const serverSource = readFileSync(resolve(__dirname, '..', '..', 'server.js'), 'utf-8');
    expect(serverSource).toMatch(
      /app\.post\(\s*['"]\/api\/adhesion-requests\/:id\/release-activation['"]\s*,\s*requireAuth\s*,\s*requireAdmin\s*,\s*async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{[\s\S]{0,120}?releaseStuckActivation\(/
    );
  });
});
