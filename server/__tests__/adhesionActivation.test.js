import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../pricing.js', () => ({
  resolveSellablePlan: vi.fn(async () => ({ id: 'plan-1' })),
}));
vi.mock('../adhesionPayments.js', () => ({
  postAdhesionCheckoutPayment: vi.fn(async () => ({ ok: true, posted: false })),
}));
vi.mock('../mercadopago.js', () => ({
  handleSubscriptionEvent: vi.fn(async () => ({})),
  runDeferredReconciliation: vi.fn(async () => ({})),
}));
vi.mock('../affiliateActivation.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sendActivationEmail: vi.fn(async () => ({ sent: true })) };
});

import { activateAdhesion } from '../adhesionActivation.js';
import { sendActivationEmail } from '../affiliateActivation.js';
import { postAdhesionCheckoutPayment } from '../adhesionPayments.js';

const ADHESION_ID = 'adh-1';

function buildRequest(overrides = {}) {
  return {
    id: ADHESION_ID,
    status: 'pending',
    email_verified: true,
    titular_email: 'juan@test.com',
    titular_dni: '30123456',
    titular_first_name: 'Juan',
    titular_last_name: 'Pérez',
    titular_name: 'Juan Pérez',
    plan_type: 'individual',
    payment_method: 'cash',
    family_members: [],
    ...overrides,
  };
}

/**
 * Chainable Supabase stub. Every chain is recorded in `calls` as
 * { table, op, payload, eq: {col: val}, is: {col: val}, selected }.
 * `respond(call)` decides what an awaited chain resolves to.
 */
function createDb({
  request = buildRequest(),
  claimRows = [{ id: ADHESION_ID }],
  claimError = null,
  profileError = null,
  createUserResult = { data: { user: { id: 'user-1' } }, error: null },
} = {}) {
  const calls = [];

  function respond(call) {
    if (call.table === 'adhesion_requests' && call.op === 'update' && 'activation_claimed_at' in (call.payload || {})
      && call.payload.activation_claimed_at !== null) {
      return { data: claimError ? null : claimRows, error: claimError };
    }
    if (call.table === 'profiles' && call.op === 'update' && 'first_name' in (call.payload || {})) {
      return { data: null, error: profileError };
    }
    return { data: null, error: null };
  }

  function from(table) {
    const call = { table, op: 'select', payload: null, eq: {}, is: {}, selected: false };
    calls.push(call);
    const builder = {
      select: () => { if (call.op !== 'select') call.selected = true; return builder; },
      eq: (c, v) => { call.eq[c] = v; return builder; },
      is: (c, v) => { call.is[c] = v; return builder; },
      insert: (p) => { call.op = 'insert'; call.payload = p; return builder; },
      update: (p) => { call.op = 'update'; call.payload = p; return builder; },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (table === 'adhesion_requests' && call.op === 'select') {
          return request ? { data: request, error: null } : { data: null, error: { message: 'not found' } };
        }
        if (table === 'family_groups') return { data: { id: 'fg-1' }, error: null };
        return { data: null, error: null };
      },
      then: (resolve, reject) => Promise.resolve(respond(call)).then(resolve, reject),
    };
    return builder;
  }

  const supabaseAdmin = {
    from: vi.fn(from),
    auth: {
      admin: {
        createUser: vi.fn(async () => createUserResult),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
  };
  return { supabaseAdmin, calls };
}

function deps(supabaseAdmin, overrides = {}) {
  return {
    supabaseAdmin,
    mercadoPagoEnabled: false,
    mpFetch: vi.fn(),
    createMailTransporter: vi.fn(),
    fromAddress: 'no-reply@test.com',
    publicAppUrl: 'https://app.test',
    emailVerificationRequired: false,
    ...overrides,
  };
}

const adhesionUpdates = (calls) => calls.filter((c) => c.table === 'adhesion_requests' && c.op === 'update');
const claimCall = (calls) => adhesionUpdates(calls).find((c) => c.payload.activation_claimed_at);
const releaseCalls = (calls) => adhesionUpdates(calls).filter((c) => c.payload.activation_claimed_at === null);
const approveCall = (calls) => adhesionUpdates(calls).find((c) => c.payload.status === 'approved');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('activateAdhesion', () => {
  it('503 when the admin client is not configured', async () => {
    const result = await activateAdhesion(deps(null), ADHESION_ID, { source: 'admin' });
    expect(result.status).toBe(503);
  });

  it('400 without adhesionId', async () => {
    const { supabaseAdmin } = createDb();
    const result = await activateAdhesion(deps(supabaseAdmin), undefined, { source: 'admin' });
    expect(result).toEqual({ status: 400, body: { error: 'Falta el campo adhesionId.' } });
  });

  it('404 when the request does not exist', async () => {
    const { supabaseAdmin } = createDb({ request: null });
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(result.status).toBe(404);
    expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('400 when the request is not pending, without claiming or creating a user', async () => {
    const { supabaseAdmin, calls } = createDb({ request: buildRequest({ status: 'approved' }) });
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(result).toEqual({ status: 400, body: { error: 'La solicitud ya se encuentra en estado: approved' } });
    expect(claimCall(calls)).toBeUndefined();
    expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('400 when email verification is required and the email is not verified', async () => {
    const { supabaseAdmin } = createDb({ request: buildRequest({ email_verified: false }) });
    const result = await activateAdhesion(
      deps(supabaseAdmin, { emailVerificationRequired: true }), ADHESION_ID, { source: 'admin' }
    );
    expect(result.status).toBe(400);
    expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('claims the row atomically (pending + unclaimed) before creating the auth user', async () => {
    const { supabaseAdmin, calls } = createDb();
    await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    const claim = claimCall(calls);
    expect(claim).toBeDefined();
    expect(claim.eq).toEqual({ id: ADHESION_ID, status: 'pending' });
    expect(claim.is).toEqual({ activation_claimed_at: null });
    expect(claim.selected).toBe(true);
    expect(calls.indexOf(claim)).toBeLessThan(
      calls.findIndex((c) => c.table === 'profiles')
    );
  });

  it('409 when the claim is lost, and never creates a user', async () => {
    const { supabaseAdmin, calls } = createDb({ claimRows: [] });
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'auto' });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('La solicitud ya está siendo procesada o no está pendiente.');
    expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(releaseCalls(calls)).toHaveLength(0);
  });

  it('500 when the claim query fails, and never creates a user', async () => {
    const { supabaseAdmin } = createDb({ claimError: { message: 'db down' } });
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(result.status).toBe(500);
    expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('happy path: creates the user, updates the profile, marks approved with source and activated_at', async () => {
    const { supabaseAdmin, calls } = createDb();
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'auto' });

    expect(result).toEqual({
      status: 200,
      body: {
        message: 'Solicitud aprobada exitosamente y paciente registrado.',
        userId: 'user-1',
        activationEmailSent: true,
      },
    });
    expect(supabaseAdmin.auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.auth.admin.createUser.mock.calls[0][0]).not.toHaveProperty('password');

    const profile = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    expect(profile.payload).toMatchObject({
      first_name: 'Juan', last_name: 'Pérez', email: 'juan@test.com', dni: '30123456',
      plan_id: 'plan-1', plan_status: 'active', is_active: true,
    });
    expect(profile.eq).toEqual({ id: 'user-1' });

    const approve = approveCall(calls);
    expect(approve.payload).toMatchObject({
      status: 'approved', approved_profile_id: 'user-1', activation_source: 'auto',
    });
    expect(typeof approve.payload.activated_at).toBe('string');
    expect(approve.eq).toEqual({ id: ADHESION_ID, status: 'pending' });

    expect(postAdhesionCheckoutPayment).toHaveBeenCalledWith(supabaseAdmin, ADHESION_ID);
    expect(sendActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ supabaseAdmin, fromAddress: 'no-reply@test.com', publicAppUrl: 'https://app.test' }),
      { email: 'juan@test.com', fullName: 'Juan Pérez' }
    );
    expect(releaseCalls(calls)).toHaveLength(0);
  });

  it('records activation_source admin for the admin endpoint', async () => {
    const { supabaseAdmin, calls } = createDb();
    await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(approveCall(calls).payload.activation_source).toBe('admin');
  });

  it('rejects an unknown source without touching the row', async () => {
    const { supabaseAdmin, calls } = createDb();
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'web' });
    expect(result.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it('createUser failure returns 400 and releases the claim', async () => {
    const { supabaseAdmin, calls } = createDb({
      createUserResult: { data: null, error: { message: 'User already registered' } },
    });
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'auto' });
    expect(result).toEqual({ status: 400, body: { error: 'Error en autenticación: User already registered' } });
    const releases = releaseCalls(calls);
    expect(releases).toHaveLength(1);
    expect(releases[0].eq).toMatchObject({ id: ADHESION_ID });
    expect(approveCall(calls)).toBeUndefined();
  });

  it('profile failure deletes the auth user, releases the claim and returns 500', async () => {
    const { supabaseAdmin, calls } = createDb({ profileError: { message: 'constraint' } });
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(result).toEqual({ status: 500, body: { error: 'Error al crear el perfil: constraint' } });
    expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith('user-1');
    expect(releaseCalls(calls)).toHaveLength(1);
    expect(approveCall(calls)).toBeUndefined();
  });

  it('an activation email failure is non-blocking', async () => {
    sendActivationEmail.mockRejectedValueOnce(new Error('smtp down'));
    const { supabaseAdmin } = createDb();
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(result.status).toBe(200);
    expect(result.body.activationEmailSent).toBe(false);
  });

  it('a ledger posting failure is non-blocking', async () => {
    postAdhesionCheckoutPayment.mockResolvedValueOnce({ ok: false, error: 'rpc failed' });
    const { supabaseAdmin } = createDb();
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(result.status).toBe(200);
  });

  it('creates the family group and members when the request has them', async () => {
    const { supabaseAdmin, calls } = createDb({
      request: buildRequest({ family_members: [{ name: 'Ana Pérez', parentesco: 'Hija', dni: ' 40111222 ' }] }),
    });
    const result = await activateAdhesion(deps(supabaseAdmin), ADHESION_ID, { source: 'admin' });
    expect(result.status).toBe(200);
    expect(calls.find((c) => c.table === 'family_groups').payload).toEqual({
      primary_affiliate_id: 'user-1', name: 'Familia de Juan Pérez',
    });
    expect(calls.find((c) => c.table === 'family_members').payload).toEqual([
      expect.objectContaining({ family_group_id: 'fg-1', first_name: 'Ana', last_name: 'Pérez', relation: 'hijo/a', dni: '40111222' }),
    ]);
  });
});
