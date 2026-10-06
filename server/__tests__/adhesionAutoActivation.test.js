import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

vi.mock('../adhesionActivation.js', () => ({
  activateAdhesion: vi.fn(),
}));
vi.mock('../emailVerification.js', () => ({
  isEmailVerified: vi.fn(),
}));
vi.mock('../adhesionChecks.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, findRegisteredIdentityConflicts: vi.fn() };
});

import { autoActivateAdhesion } from '../adhesionAutoActivation.js';
import { activateAdhesion } from '../adhesionActivation.js';
import { isEmailVerified } from '../emailVerification.js';
import { findRegisteredIdentityConflicts } from '../adhesionChecks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADHESION_ID = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b';

function buildRow(overrides = {}) {
  return {
    id: ADHESION_ID,
    status: 'pending',
    titular_email: 'Juan@Test.com',
    titular_dni: '30.123.456',
    titular_cuil: '20-30123456-7',
    family_members: [{ name: 'Ana', dni: '40111222', cuil: null }],
    ...overrides,
  };
}

/** supabaseAdmin stub: from('adhesion_requests').select().eq().maybeSingle(). */
function createSupabase({ row = buildRow(), error = null } = {}) {
  const query = { table: null, eq: {} };
  const builder = {
    select: () => builder,
    eq: (c, v) => { query.eq[c] = v; return builder; },
    maybeSingle: async () => ({ data: error ? null : row, error }),
  };
  return { query, supabaseAdmin: { from: (t) => { query.table = t; return builder; } } };
}

function buildDeps(supabaseAdmin, overrides = {}) {
  return { supabaseAdmin, emailVerificationRequired: true, mercadoPagoEnabled: false, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  isEmailVerified.mockResolvedValue(true);
  findRegisteredIdentityConflicts.mockResolvedValue([]);
  activateAdhesion.mockResolvedValue({
    status: 200,
    body: { message: 'Solicitud aprobada exitosamente.', userId: 'user-1', activationEmailSent: true },
  });
});

describe('autoActivateAdhesion — guards', () => {
  it('returns 503 without a service-role client', async () => {
    const res = await autoActivateAdhesion({}, ADHESION_ID);
    expect(res.status).toBe(503);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'abc', `${ADHESION_ID}x`])('returns 400 for an invalid id %j', async (id) => {
    const { supabaseAdmin } = createSupabase();
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), id);
    expect(res.status).toBe(400);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });

  it('returns 404 when the adhesion request does not exist', async () => {
    const { supabaseAdmin, query } = createSupabase({ row: null });
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);
    expect(query).toMatchObject({ table: 'adhesion_requests', eq: { id: ADHESION_ID } });
    expect(res.status).toBe(404);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });

  it('returns 500 when the lookup fails', async () => {
    const { supabaseAdmin } = createSupabase({ error: { message: 'boom' } });
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);
    expect(res.status).toBe(500);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });
});

describe('autoActivateAdhesion — request status', () => {
  it('is idempotent for an already approved request (200 alreadyActive, no re-activation)', async () => {
    const { supabaseAdmin } = createSupabase({ row: buildRow({ status: 'approved' }) });
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ alreadyActive: true });
    expect(isEmailVerified).not.toHaveBeenCalled();
    expect(activateAdhesion).not.toHaveBeenCalled();
  });

  it('returns 400 for a rejected request', async () => {
    const { supabaseAdmin } = createSupabase({ row: buildRow({ status: 'rejected' }) });
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);
    expect(res.status).toBe(400);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });
});

describe('autoActivateAdhesion — email verification', () => {
  it('returns 403 and never activates when the titular email is not verified server-side', async () => {
    isEmailVerified.mockResolvedValue(false);
    const { supabaseAdmin } = createSupabase();

    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);

    expect(isEmailVerified).toHaveBeenCalledWith(supabaseAdmin, 'Juan@Test.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/correo/i);
    expect(findRegisteredIdentityConflicts).not.toHaveBeenCalled();
    expect(activateAdhesion).not.toHaveBeenCalled();
  });

  it('returns 500 when the verification lookup fails', async () => {
    isEmailVerified.mockRejectedValue(new Error('db down'));
    const { supabaseAdmin } = createSupabase();
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);
    expect(res.status).toBe(500);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });

  it('skips the server-side check only when verification is disabled', async () => {
    isEmailVerified.mockResolvedValue(false);
    const { supabaseAdmin } = createSupabase();
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin, { emailVerificationRequired: false }), ADHESION_ID);
    expect(isEmailVerified).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

describe('autoActivateAdhesion — duplicate re-check', () => {
  it('checks the titular and family identities of the row against registered records', async () => {
    const { supabaseAdmin } = createSupabase();
    await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);

    const [client, people] = findRegisteredIdentityConflicts.mock.calls[0];
    expect(client).toBe(supabaseAdmin);
    expect(people).toEqual([
      expect.objectContaining({ person: 'titular', dni: '30123456', cuil: '20301234567' }),
      expect.objectContaining({ person: 'family', name: 'Ana', dni: '40111222' }),
    ]);
  });

  it('returns 409 with the conflict message and never activates', async () => {
    findRegisteredIdentityConflicts.mockResolvedValue([
      { identifier: 'dni', person: 'titular', reason: 'affiliate', message: 'Este DNI ya se encuentra afiliado a Medinex.' },
    ]);
    const { supabaseAdmin } = createSupabase();

    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'Este DNI ya se encuentra afiliado a Medinex.' });
    expect(res.body.conflicts).toHaveLength(1);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });

  it('returns 500 when the duplicate check fails', async () => {
    findRegisteredIdentityConflicts.mockRejectedValue(new Error('db down'));
    const { supabaseAdmin } = createSupabase();
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);
    expect(res.status).toBe(500);
    expect(activateAdhesion).not.toHaveBeenCalled();
  });
});

describe('autoActivateAdhesion — activation', () => {
  it('activates with source auto and returns 200 without exposing the user id', async () => {
    const { supabaseAdmin } = createSupabase();
    const deps = buildDeps(supabaseAdmin);

    const res = await autoActivateAdhesion(deps, ADHESION_ID);

    expect(activateAdhesion).toHaveBeenCalledWith(deps, ADHESION_ID, { source: 'auto' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ activated: true, message: 'Solicitud aprobada exitosamente.', activationEmailSent: true });
  });

  it('maps a lost activation claim (409) to 202 processing', async () => {
    activateAdhesion.mockResolvedValue({ status: 409, body: { error: 'La solicitud ya está siendo procesada o no está pendiente.' } });
    const { supabaseAdmin } = createSupabase();

    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ processing: true });
  });

  it.each([400, 500, 503])('passes through a %i from activateAdhesion', async (status) => {
    activateAdhesion.mockResolvedValue({ status, body: { error: 'x' } });
    const { supabaseAdmin } = createSupabase();
    const res = await autoActivateAdhesion(buildDeps(supabaseAdmin), ADHESION_ID);
    expect(res).toEqual({ status, body: { error: 'x' } });
  });
});

describe('/api/adhesion/:id/activate route registration (server.js source)', () => {
  // server.js calls app.listen at import time, so the registration is
  // asserted over its source (same approach as approveAdhesionAuth.test.js).
  it('registers a public POST /api/adhesion/:id/activate that delegates to autoActivateAdhesion', () => {
    const serverSource = readFileSync(resolve(__dirname, '..', '..', 'server.js'), 'utf-8');
    expect(serverSource).toMatch(
      /app\.post\(\s*['"]\/api\/adhesion\/:id\/activate['"]\s*,\s*async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{[\s\S]{0,200}?autoActivateAdhesion\(/
    );
  });
});
