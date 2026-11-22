import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { livekitTokenHandler } from '../livekitToken.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APPOINTMENT_ID = '11111111-2222-4333-8444-555555555555';
const APPOINTMENT = { id: APPOINTMENT_ID, patient_id: 'pat1', doctor_id: 'doc1' };

function createRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function createSupabase({ appointment = APPOINTMENT, error = null } = {}) {
  const maybeSingle = vi.fn(async () => ({ data: appointment, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })), eq };
}

class FakeAccessToken {
  constructor(key, secret, opts) { this.opts = opts; this.grants = []; }
  addGrant(grant) { this.grants.push(grant); }
  async toJwt() { return `jwt-for-${this.grants[0].room}`; }
}

function setup({ supabase = createSupabase(), apiKey = 'key', apiSecret = 'secret' } = {}) {
  return livekitTokenHandler({ supabaseAdmin: supabase, apiKey, apiSecret, AccessToken: FakeAccessToken });
}

const call = async (handler, { userId = 'pat1', appointmentId = APPOINTMENT_ID } = {}) => {
  const res = createRes();
  await handler({ body: { appointmentId }, user: { id: userId } }, res);
  return res;
};

describe('livekitTokenHandler', () => {
  it('gives the patient of the appointment a token for its room', async () => {
    const res = await call(setup());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ token: `jwt-for-room-${APPOINTMENT_ID}`, roomName: `room-${APPOINTMENT_ID}` });
  });

  it('gives the doctor of the appointment a token for its room', async () => {
    const res = await call(setup(), { userId: 'doc1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.roomName).toBe(`room-${APPOINTMENT_ID}`);
  });

  it('refuses a signed-in user who is neither the patient nor the doctor', async () => {
    const res = await call(setup(), { userId: 'someone-else' });
    expect(res.statusCode).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it('returns 404 when the appointment does not exist', async () => {
    const res = await call(setup({ supabase: createSupabase({ appointment: null }) }));
    expect(res.statusCode).toBe(404);
    expect(res.body.token).toBeUndefined();
  });

  it('returns 500 without a token when the appointment lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(setup({ supabase: createSupabase({ appointment: null, error: { message: 'db down' } }) }));
    expect(res.statusCode).toBe(500);
    expect(res.body.token).toBeUndefined();
  });

  it('keeps rejecting a missing or malformed appointment id', async () => {
    expect((await call(setup(), { appointmentId: '' })).statusCode).toBe(400);
    expect((await call(setup(), { appointmentId: 'not-a-uuid' })).statusCode).toBe(400);
  });

  it('reports an incomplete LiveKit configuration', async () => {
    const res = await call(setup({ apiKey: '' }));
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /api/livekit-token wiring', () => {
  it('requires an authenticated user', () => {
    const source = readFileSync(resolve(__dirname, '..', '..', 'server.js'), 'utf-8');
    expect(source).toMatch(/app\.post\(\s*['"]\/api\/livekit-token['"]\s*,\s*requireAuth\s*,/);
  });
});
