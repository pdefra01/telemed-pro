// server/__tests__/supervisors.test.js
//
// Tests for POST /api/create-supervisor (odd/tasks/commercial-crm.md, S3, S7).
// server.js cannot be imported (unconditional app.listen), so the handler lives
// in server/supervisors.js and is exercised with a stubbed supabaseAdmin; the
// route wiring is proven by a source-regex assertion, like advisorStatus.test.js.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createSupervisorHandler } from '../supervisors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function buildMockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

/** profileResults: one result per `profiles.update(...)` call, in order. */
function buildAdmin({ createUser, profileResults = [] } = {}) {
  const updates = [];
  const queue = [...profileResults];
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const admin = {
    updates,
    deleteUser,
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue(createUser ?? { data: { user: { id: 'sup-1' } }, error: null }),
        deleteUser,
      },
    },
    from: vi.fn((table) => ({
      update: vi.fn((payload) => {
        updates.push({ table, payload });
        return { eq: vi.fn().mockResolvedValue(queue.shift() ?? { error: null }) };
      }),
    })),
  };
  return admin;
}

const validBody = { email: ' ana@test.local ', password: 'secret123', firstName: ' Ana ', lastName: ' Gómez ', phone: ' 3875000000 ' };

describe('createSupervisorHandler', () => {
  it('creates the auth user, grants the supervisor role and stores the name (201)', async () => {
    const admin = buildAdmin();
    const res = buildMockRes();

    await createSupervisorHandler(admin, { body: validBody }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, id: 'sup-1' });
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@test.local',
      password: 'secret123',
      email_confirm: true,
      user_metadata: { full_name: 'Ana Gómez' },
    }));
    expect(admin.updates[0]).toEqual({ table: 'profiles', payload: { role: 'supervisor', is_active: true } });
    expect(admin.updates[1]).toEqual({
      table: 'profiles',
      payload: { first_name: 'Ana', last_name: 'Gómez', phone: '3875000000' },
    });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects missing or blank required fields (400) without creating anything', async () => {
    for (const patch of [{ email: '  ' }, { password: '' }, { firstName: ' ' }, { lastName: undefined }]) {
      const admin = buildAdmin();
      const res = buildMockRes();
      await createSupervisorHandler(admin, { body: { ...validBody, ...patch } }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/obligatorios/);
      expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    }
  });

  it('answers 503 when the admin client is unavailable', async () => {
    const res = buildMockRes();
    await createSupervisorHandler(null, { body: validBody }, res);
    expect(res.statusCode).toBe(503);
  });

  it('relays the auth error (400) when the user cannot be created', async () => {
    const admin = buildAdmin({ createUser: { data: null, error: { message: 'User already registered' } } });
    const res = buildMockRes();

    await createSupervisorHandler(admin, { body: validBody }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'User already registered' });
    expect(admin.updates).toHaveLength(0);
  });

  it('removes the auth user when the role grant fails (500)', async () => {
    const admin = buildAdmin({ profileResults: [{ error: { message: 'boom' } }] });
    const res = buildMockRes();

    await createSupervisorHandler(admin, { body: validBody }, res);

    expect(res.statusCode).toBe(500);
    expect(admin.deleteUser).toHaveBeenCalledWith('sup-1');
  });

  it('removes the auth user when storing the name fails (500)', async () => {
    const admin = buildAdmin({ profileResults: [{ error: null }, { error: { message: 'boom' } }] });
    const res = buildMockRes();

    await createSupervisorHandler(admin, { body: validBody }, res);

    expect(res.statusCode).toBe(500);
    expect(admin.deleteUser).toHaveBeenCalledWith('sup-1');
  });

  it('is registered behind requireAuth then requireAdmin in server.js', () => {
    const source = readFileSync(resolve(__dirname, '../../server.js'), 'utf8');
    expect(source).toMatch(/app\.post\(\s*'\/api\/create-supervisor'\s*,\s*requireAuth\s*,\s*requireAdmin\s*,/);
  });
});
