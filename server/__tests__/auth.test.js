import { describe, it, expect, vi } from 'vitest';
import { buildRequireAdmin } from '../auth.js';

function buildRes() {
  const res = {};
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

function stubSupabase(result) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

async function run(result, userMetadata = {}) {
  const requireAdmin = buildRequireAdmin(stubSupabase(result));
  const req = { user: { id: 'u1', user_metadata: userMetadata } };
  const res = buildRes();
  const next = vi.fn();
  await requireAdmin(req, res, next);
  return { res, next };
}

describe('requireAdmin', () => {
  it('lets a profile with role admin through', async () => {
    const { res, next } = await run({ data: { role: 'admin' }, error: null });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a non-admin profile even if user_metadata claims admin', async () => {
    const { res, next } = await run({ data: { role: 'patient' }, error: null }, { role: 'admin' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('rejects a user without a profile row even if user_metadata claims admin', async () => {
    const { res, next } = await run({ data: null, error: { code: 'PGRST116' } }, { role: 'admin' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('rejects a profile with a null role even if user_metadata claims admin', async () => {
    const { res, next } = await run({ data: { role: null }, error: null }, { role: 'admin' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('answers 500 and never falls back to user_metadata when the lookup fails', async () => {
    const { res, next } = await run({ data: null, error: { code: '08006', message: 'connection lost' } }, { role: 'admin' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});
