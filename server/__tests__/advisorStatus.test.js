// server/__tests__/advisorStatus.test.js
//
// Tests for PATCH /api/advisors/:id/status and GET /api/advisors/search
// (sdd/advisor-auto-provisioning, PR 1/2 — design 3.3/3.4). server.js itself
// cannot be imported (unconditional app.listen(...) at import time — see
// server/__tests__/approveAdhesionAuth.test.js's note), so:
//   - the actual business-logic handlers (`setAdvisorStatusHandler`,
//     `searchAdvisorsHandler`) live in server/advisors.js and are exercised
//     directly here with a stubbed `supabaseAdmin` and mock req/res.
//   - the requireAuth/requireAdmin GATE is proven via a byte-identical copy
//     of server.js's middleware (same convention as approveAdhesionAuth.test.js),
//     chained in front of the real imported handler.
//   - route wiring itself (that server.js actually registers these routes
//     behind requireAuth/requireAdmin, in that order) is proven via a
//     source-regex assertion, exactly like approveAdhesionAuth.test.js does.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setAdvisorStatusHandler, searchAdvisorsHandler } from '../advisors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function buildRequireAuth(supabaseAdmin) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autorización requerido.' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Token de autenticación inválido o expirado.' });
      }
      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Fallo de autenticación.' });
    }
  };
}

function buildRequireAdmin(supabaseAdmin) {
  return async (req, res, next) => {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    const role = profile?.role || req.user.user_metadata?.role;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    next();
  };
}

function buildMockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

/** Stub for the requireAuth/requireAdmin gate ONLY — not used for the RPC/query calls. */
function buildGateSupabaseAdminStub({ profileRole = 'admin' } = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1', user_metadata: {} } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { role: profileRole } }) }),
      }),
    }),
  };
}

describe('advisors routes registration (server.js source)', () => {
  const serverSource = readFileSync(resolve(__dirname, '..', '..', 'server.js'), 'utf-8');

  it('registers PATCH /api/advisors/:id/status with requireAuth and requireAdmin, in that order', () => {
    expect(serverSource).toMatch(
      /app\.patch\(\s*['"]\/api\/advisors\/:id\/status['"]\s*,\s*requireAuth\s*,\s*requireAdmin\s*,/
    );
  });

  it('registers GET /api/advisors/search with requireAuth and requireAdmin, in that order', () => {
    expect(serverSource).toMatch(
      /app\.get\(\s*['"]\/api\/advisors\/search['"]\s*,\s*requireAuth\s*,\s*requireAdmin\s*,/
    );
  });
});

describe('PATCH /api/advisors/:id/status auth gate (Esc.8 — 403 no-admin)', () => {
  it('rejects with 403 for a valid, non-admin session and never reaches the handler', async () => {
    const gateSupabaseAdmin = buildGateSupabaseAdminStub({ profileRole: 'doctor' });
    const requireAuth = buildRequireAuth(gateSupabaseAdmin);
    const requireAdmin = buildRequireAdmin(gateSupabaseAdmin);

    const req = { headers: { authorization: 'Bearer valid-token' }, params: { id: '11111111-1111-1111-1111-111111111111' }, body: { active: false } };
    const res = buildMockRes();
    let reachedHandler = false;

    await requireAuth(req, res, async () => {
      await requireAdmin(req, res, async () => {
        reachedHandler = true;
        await setAdvisorStatusHandler(req, res, { supabaseAdmin: gateSupabaseAdmin });
      });
    });

    expect(res.statusCode).toBe(403);
    expect(reachedHandler).toBe(false);
  });
});

describe('setAdvisorStatusHandler (design 3.3)', () => {
  const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
  const ADVISOR_ID = '22222222-2222-2222-2222-222222222222';

  function buildReq(overrides = {}) {
    return {
      user: { id: ADMIN_ID },
      params: { id: ADVISOR_ID },
      body: { active: false },
      ...overrides,
    };
  }

  it('returns 403 and never calls the RPC when the admin targets their own id (Esc.6)', async () => {
    const rpc = vi.fn();
    const supabaseAdmin = { rpc };
    const req = buildReq({ params: { id: ADMIN_ID } });
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin });

    expect(res.statusCode).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-UUID id, never calling the RPC', async () => {
    const rpc = vi.fn();
    const req = buildReq({ params: { id: 'not-a-uuid' } });
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin: { rpc } });

    expect(res.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when `active` is not a strict boolean, never calling the RPC', async () => {
    const rpc = vi.fn();
    const req = buildReq({ body: { active: 'false' } });
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin: { rpc } });

    expect(res.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 404 when the RPC raises advisor_not_found (P0002)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'P0002', message: 'advisor_not_found' } });
    const req = buildReq();
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin: { rpc } });

    expect(res.statusCode).toBe(404);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with hasAccount:false for a placeholder producer with no linked profile (Esc.7)', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ advisor_id: ADVISOR_ID, producer_status: 'inactive', has_account: false }],
      error: null,
    });
    const req = buildReq();
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin: { rpc } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, id: ADVISOR_ID, status: 'inactive', isActive: false, hasAccount: false });
  });

  it('deactivates an active advisor, calling the RPC exactly once with the right args (Esc.4)', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ advisor_id: ADVISOR_ID, producer_status: 'inactive', has_account: true }],
      error: null,
    });
    const req = buildReq({ body: { active: false } });
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin: { rpc } });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('set_advisor_status', { p_advisor_id: ADVISOR_ID, p_active: false });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'inactive', hasAccount: true });
  });

  it('reactivates a previously inactive advisor, calling the RPC exactly once (Esc.5)', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ advisor_id: ADVISOR_ID, producer_status: 'active', has_account: true }],
      error: null,
    });
    const req = buildReq({ body: { active: true } });
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin: { rpc } });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('set_advisor_status', { p_advisor_id: ADVISOR_ID, p_active: true });
    expect(res.body).toMatchObject({ success: true, status: 'active' });
  });

  it('returns 503 when supabaseAdmin is not configured', async () => {
    const req = buildReq();
    const res = buildMockRes();

    await setAdvisorStatusHandler(req, res, { supabaseAdmin: null });

    expect(res.statusCode).toBe(503);
  });
});

describe('GET /api/advisors/search auth gate (Esc.17 — 403 no-admin)', () => {
  it('rejects with 403 for a valid, non-admin session and never reaches the handler', async () => {
    const gateSupabaseAdmin = buildGateSupabaseAdminStub({ profileRole: 'doctor' });
    const requireAuth = buildRequireAuth(gateSupabaseAdmin);
    const requireAdmin = buildRequireAdmin(gateSupabaseAdmin);

    const req = { headers: { authorization: 'Bearer valid-token' }, query: {} };
    const res = buildMockRes();
    let reachedHandler = false;

    await requireAuth(req, res, async () => {
      await requireAdmin(req, res, async () => {
        reachedHandler = true;
        await searchAdvisorsHandler(req, res, { supabaseAdmin: gateSupabaseAdmin });
      });
    });

    expect(res.statusCode).toBe(403);
    expect(reachedHandler).toBe(false);
  });
});

describe('searchAdvisorsHandler (design 3.4)', () => {
  const PEDRO = {
    id: 'adv-pedro',
    name: 'Pedro Gómez',
    producer_code: 'PROMO_PEDRO',
    email: 'pedro@medinex.com',
    phone: '3416000000',
    status: 'active',
    commission_rate: 10,
  };
  const PEDRO_PROFILE = { id: 'adv-pedro', first_name: 'Pedro', last_name: 'Gómez', dni: '30123456', is_active: true };

  const ANA = {
    id: 'adv-ana',
    name: 'Ana Ruiz',
    producer_code: 'PROMO_ANA',
    email: 'ana@medinex.com',
    phone: '3416111111',
    status: 'inactive',
    commission_rate: 10,
  };
  const ANA_PROFILE = { id: 'adv-ana', first_name: 'Ana', last_name: 'Ruiz', dni: '31000111', is_active: false };

  // The producers query and the profiles query (role lookup vs. referral-count
  // lookup) share table names but different `.select()` shapes, so the stub
  // below routes profiles' `.select()` by inspecting the requested columns.
  function buildFullSearchSupabaseAdmin({ producers, profiles, referrals = [] }) {
    return {
      from: vi.fn((table) => {
        if (table === 'producers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: producers, error: null }),
              }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn((cols) => {
              // Role-lookup query: select('id, first_name, last_name, dni, is_active').eq('role','advisor')
              if (typeof cols === 'string' && cols.includes('dni')) {
                return { eq: vi.fn().mockResolvedValue({ data: profiles, error: null }) };
              }
              // Referral-count query: select('producer_id').in('producer_id', ids)
              return { in: vi.fn().mockResolvedValue({ data: referrals, error: null }) };
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
  }

  it('returns 400 when q has exactly 1 character', async () => {
    const supabaseAdmin = buildFullSearchSupabaseAdmin({ producers: [], profiles: [] });
    const req = { query: { q: 'p' } };
    const res = buildMockRes();

    await searchAdvisorsHandler(req, res, { supabaseAdmin });

    expect(res.statusCode).toBe(400);
  });

  it('returns the full list (active + inactive) when q is empty (Esc.15)', async () => {
    const supabaseAdmin = buildFullSearchSupabaseAdmin({
      producers: [PEDRO, ANA],
      profiles: [PEDRO_PROFILE, ANA_PROFILE],
      referrals: [],
    });
    const req = { query: {} };
    const res = buildMockRes();

    await searchAdvisorsHandler(req, res, { supabaseAdmin });

    expect(res.statusCode).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('returns an empty array (no error) when nothing matches (Esc.16)', async () => {
    const supabaseAdmin = buildFullSearchSupabaseAdmin({
      producers: [PEDRO, ANA],
      profiles: [PEDRO_PROFILE, ANA_PROFILE],
      referrals: [],
    });
    const req = { query: { q: 'zzz-no-match' } };
    const res = buildMockRes();

    await searchAdvisorsHandler(req, res, { supabaseAdmin });

    expect(res.statusCode).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('includes inactive advisors, correctly labeled by status (Esc.18)', async () => {
    const supabaseAdmin = buildFullSearchSupabaseAdmin({
      producers: [PEDRO, ANA],
      profiles: [PEDRO_PROFILE, ANA_PROFILE],
      referrals: [],
    });
    const req = { query: { q: 'ruiz' } };
    const res = buildMockRes();

    await searchAdvisorsHandler(req, res, { supabaseAdmin });

    expect(res.statusCode).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ id: 'adv-ana', status: 'inactive', isActive: false });
  });

  it('matches by accent-insensitive first name via the same merged-row matcher (Esc.11)', async () => {
    const supabaseAdmin = buildFullSearchSupabaseAdmin({
      producers: [PEDRO, ANA],
      profiles: [PEDRO_PROFILE, ANA_PROFILE],
      referrals: [],
    });
    const req = { query: { q: 'gomez' } };
    const res = buildMockRes();

    await searchAdvisorsHandler(req, res, { supabaseAdmin });

    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].id).toBe('adv-pedro');
  });

  it('returns 400 for an invalid status filter value', async () => {
    const supabaseAdmin = buildFullSearchSupabaseAdmin({ producers: [], profiles: [] });
    const req = { query: { status: 'bogus' } };
    const res = buildMockRes();

    await searchAdvisorsHandler(req, res, { supabaseAdmin });

    expect(res.statusCode).toBe(400);
  });
});
