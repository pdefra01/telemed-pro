import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeEmail, maskEmail, updateAdhesionEmailHandler } from '../adhesionEmail.js';

function createStub({ request = { id: 'r1', status: 'pending', titular_email: 'old@test.com' }, profiles = [], inUse = false, rpcError = null, updateError = null, updated = [{ id: 'r1' }] } = {}) {
  const calls = { update: null, rpc: null, ilike: null };
  function from(table) {
    const state = { table, mode: 'select', filters: {} };
    const builder = {
      select: () => builder,
      update: (patch) => { state.mode = 'update'; calls.update = { patch, filters: state.filters }; return builder; },
      eq: (c, v) => { state.filters[c] = v; return builder; },
      ilike: (c, v) => { calls.ilike = { c, v }; return builder; },
      limit: () => builder,
      maybeSingle: async () => ({ data: table === 'adhesion_requests' ? request : null, error: null }),
      then: (resolve, reject) => {
        let result;
        if (state.mode === 'update') result = { data: updated, error: updateError };
        else result = { data: table === 'profiles' ? profiles : [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from, rpc: async (fn, args) => { calls.rpc = { fn, args }; return { data: inUse, error: rpcError }; }, calls };
}

function createRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function run(supabaseAdmin, body, id = 'r1') {
  const res = createRes();
  await updateAdhesionEmailHandler({ supabaseAdmin })({ params: { id }, body, user: { id: 'admin-1' } }, res);
  return res;
}

const BS = String.fromCharCode(92);

afterEach(() => vi.restoreAllMocks());

describe('normalizeEmail / maskEmail', () => {
  it('trims and lowercases', () => expect(normalizeEmail('  Ana@Test.COM ')).toBe('ana@test.com'));
  it('returns null for non-strings and invalid formats', () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('no-at')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('a b@test.com')).toBeNull();
  });
  it('masks the local part', () => {
    expect(maskEmail('juan@test.com')).toBe('j***@test.com');
    expect(maskEmail(null)).toBe('');
  });
});

describe('updateAdhesionEmailHandler', () => {
  it('503 without supabaseAdmin', async () => {
    const res = await run(null, { email: 'a@test.com' });
    expect(res.statusCode).toBe(503);
  });
  it('400 for an invalid email and never writes', async () => {
    const stub = createStub();
    const res = await run(stub, { email: 'nope' });
    expect(res.statusCode).toBe(400);
    expect(stub.calls.update).toBeNull();
  });
  it('404 when the request does not exist', async () => {
    const res = await run(createStub({ request: null }), { email: 'a@test.com' });
    expect(res.statusCode).toBe(404);
  });
  it('409 when the request is not pending', async () => {
    const stub = createStub({ request: { id: 'r1', status: 'approved', titular_email: 'old@test.com' } });
    const res = await run(stub, { email: 'a@test.com' });
    expect(res.statusCode).toBe(409);
    expect(stub.calls.update).toBeNull();
  });
  it('returns ok without writing when the email is unchanged (case-insensitive)', async () => {
    const stub = createStub();
    const res = await run(stub, { email: ' OLD@test.com ' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, email: 'old@test.com', changed: false });
    expect(stub.calls.update).toBeNull();
  });
  it('409 with a Spanish message when a profile already uses the email', async () => {
    const stub = createStub({ profiles: [{ id: 'p1' }] });
    const res = await run(stub, { email: 'Taken@test.com' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/ya pertenece a otra cuenta/);
    expect(stub.calls.ilike).toEqual({ c: 'email', v: 'taken@test.com' });
    expect(stub.calls.update).toBeNull();
  });
  it('409 when auth.users already has the email', async () => {
    const stub = createStub({ inUse: true });
    const res = await run(stub, { email: 'a@test.com' });
    expect(res.statusCode).toBe(409);
    expect(stub.calls.rpc).toEqual({ fn: 'email_in_use', args: { p_email: 'a@test.com' } });
  });
  it('escapes LIKE wildcards in the profile lookup', async () => {
    const stub = createStub();
    await run(stub, { email: 'a_b%@test.com' });
    expect(stub.calls.ilike.v).toBe('a' + BS + '_b' + BS + '%@test.com');
  });
  it('500 when the auth lookup fails (never assumes free)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run(createStub({ rpcError: { message: 'boom' } }), { email: 'a@test.com' });
    expect(res.statusCode).toBe(500);
  });
  it('updates a pending request, resets email_verified and logs masked emails', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stub = createStub();
    const res = await run(stub, { email: 'New@Test.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, email: 'new@test.com', changed: true });
    expect(stub.calls.update.patch).toEqual({ titular_email: 'new@test.com', email_verified: false });
    expect(stub.calls.update.filters).toEqual({ id: 'r1', status: 'pending' });
    const line = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(line).toContain('admin-1');
    expect(line).toContain('o***@test.com');
    expect(line).toContain('n***@test.com');
    expect(line).toContain('r1');
    expect(line).not.toContain('old@test.com');
  });
  it('409 when the request stopped being pending during the write (0 rows)', async () => {
    const res = await run(createStub({ updated: [] }), { email: 'new@test.com' });
    expect(res.statusCode).toBe(409);
  });
  it('500 on update error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run(createStub({ updateError: { message: 'x' } }), { email: 'new@test.com' });
    expect(res.statusCode).toBe(500);
  });
});
