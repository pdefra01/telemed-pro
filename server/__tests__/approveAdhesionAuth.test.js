import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// server.js calls app.listen(...) unconditionally at import time (confirmed:
// no NODE_ENV/test guard exists around it), so it cannot be imported here
// without binding a real port — and per design ("Testing Strategy" / File
// Changes note), server.js will NOT be refactored in this change to add
// exports. This is the "light Express harness" alternative the design
// explicitly allows: mock Express req/res/next objects drive a
// BYTE-IDENTICAL copy of server.js's `requireAuth`/`requireAdmin`
// middleware (same convention already used at /api/reset-user-password and
// /api/update-user-email), proving the auth-gate CONTRACT this route must
// satisfy per spec "Authenticated, Admin-Only Adhesion Approval" (D7) —
// without adding a new HTTP test-client dependency.

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

function buildSupabaseAdminStub({ getUserResult, profileRole } = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue(
        getUserResult || { data: { user: { id: 'admin-1', user_metadata: {} } }, error: null }
      ),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: profileRole ?? 'admin' } }),
        }),
      }),
    }),
  };
}

/** Runs requireAuth -> requireAdmin -> the route handler, exactly as Express would chain them. */
async function runApproveAdhesionRoute(supabaseAdmin, headers) {
  const requireAuth = buildRequireAuth(supabaseAdmin);
  const requireAdmin = buildRequireAdmin(supabaseAdmin);
  const routeHandler = vi.fn((req, res) => res.status(200).json({ message: 'ok' }));

  const req = { headers, body: { adhesionId: 'x' } };
  const res = buildMockRes();

  let reachedAdmin = false;
  let reachedHandler = false;

  await requireAuth(req, res, async () => {
    reachedAdmin = true;
    await requireAdmin(req, res, () => {
      reachedHandler = true;
      routeHandler(req, res);
    });
  });

  return { res, reachedAdmin, reachedHandler, routeHandler };
}

describe('/api/approve-adhesion route registration (server.js source, D7)', () => {
  // server.js has no exports and calls app.listen(...) unconditionally, so
  // it cannot be imported/executed in a unit test (confirmed above). This
  // asserts the actual production source registers the route with the
  // required middleware, in the correct order — the genuine RED/GREEN gate
  // for D7 (fails before the server.js edit, passes after).
  it('registers POST /api/approve-adhesion with requireAuth and requireAdmin, in that order', () => {
    const serverSource = readFileSync(resolve(__dirname, '..', '..', 'server.js'), 'utf-8');

    expect(serverSource).toMatch(
      /app\.post\(\s*['"]\/api\/approve-adhesion['"]\s*,\s*requireAuth\s*,\s*requireAdmin\s*,/
    );
  });
});

describe('/api/approve-adhesion auth gate (D7)', () => {
  it('rejects with 401 when no Bearer token is sent, before any Auth/MP logic runs', async () => {
    const supabaseAdmin = buildSupabaseAdminStub();

    const { res, reachedAdmin, reachedHandler } = await runApproveAdhesionRoute(supabaseAdmin, {});

    expect(res.statusCode).toBe(401);
    expect(supabaseAdmin.auth.getUser).not.toHaveBeenCalled();
    expect(reachedAdmin).toBe(false);
    expect(reachedHandler).toBe(false);
  });

  it('rejects with 401 when the token is invalid/expired', async () => {
    const supabaseAdmin = buildSupabaseAdminStub({
      getUserResult: { data: { user: null }, error: { message: 'invalid' } },
    });

    const { res, reachedHandler } = await runApproveAdhesionRoute(supabaseAdmin, {
      authorization: 'Bearer bad-token',
    });

    expect(res.statusCode).toBe(401);
    expect(reachedHandler).toBe(false);
  });

  it('rejects with 403 for a valid, non-admin session (e.g. patient or doctor)', async () => {
    const supabaseAdmin = buildSupabaseAdminStub({ profileRole: 'doctor' });

    const { res, reachedAdmin, reachedHandler } = await runApproveAdhesionRoute(supabaseAdmin, {
      authorization: 'Bearer valid-token',
    });

    expect(res.statusCode).toBe(403);
    expect(reachedAdmin).toBe(true);
    expect(reachedHandler).toBe(false);
  });

  it('allows the request through (200) for a valid admin session', async () => {
    const supabaseAdmin = buildSupabaseAdminStub({ profileRole: 'admin' });

    const { res, reachedHandler } = await runApproveAdhesionRoute(supabaseAdmin, {
      authorization: 'Bearer valid-token',
    });

    expect(res.statusCode).toBe(200);
    expect(reachedHandler).toBe(true);
  });
});
