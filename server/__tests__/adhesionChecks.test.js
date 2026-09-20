import { describe, it, expect } from 'vitest';
import { normalize, buildConflictMessage, checkDuplicatesHandler } from '../adhesionChecks.js';

function createStub(tables) {
  function from(table) {
    const filters = {};
    const rows = () => (typeof tables[table] === 'function' ? tables[table](filters) : tables[table]) ?? [];
    const builder = {
      select: () => builder,
      or: () => builder,
      eq: (c, v) => { filters[c] = v; return builder; },
      limit: () => builder,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return builder;
  }
  return { from };
}

function createRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function run(supabaseAdmin, body) {
  const res = createRes();
  await checkDuplicatesHandler({ supabaseAdmin })({ body }, res);
  return res;
}

const EMPTY = { profiles: [], family_members: [], adhesion_requests: [], plans: [] };

describe('normalize / buildConflictMessage', () => {
  it('keeps only digits and maps null to empty', () => {
    expect(normalize('20-30111222-3')).toBe('20301112223');
    expect(normalize(null)).toBe('');
  });
  it('builds the phone message', () => {
    expect(buildConflictMessage('phone', 'affiliate')).toBe('El telefono ya esta registrado en otro afiliado o solicitud pendiente.');
    expect(buildConflictMessage('phone', 'pending_request')).toBe('El telefono ya esta registrado en otro afiliado o solicitud pendiente.');
  });
  it('keeps the dni/cuil messages', () => {
    expect(buildConflictMessage('dni', 'affiliate')).toBe('Este DNI ya se encuentra afiliado a Medinex.');
    expect(buildConflictMessage('cuil', 'pending_request')).toBe('Ya existe una solicitud pendiente con este CUIL.');
  });
});

describe('checkDuplicatesHandler', () => {
  it('returns 400 without the titular DNI', async () => {
    const res = await run(createStub(EMPTY), {});
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 ok when nothing conflicts', async () => {
    const res = await run(createStub(EMPTY), { titularDni: '30111222', titularPhone: '11 5555-1234', planType: 'familiar' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('keeps the 409 shape for a DNI conflict with an affiliate', async () => {
    const stub = createStub({ ...EMPTY, profiles: [{ id: 'u1', dni: '30.111.222', cuil: null, phone: null }] });
    const res = await run(stub, { titularDni: '30111222' });
    expect(res.statusCode).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.conflicts[0]).toMatchObject({ identifier: 'dni', person: 'titular', reason: 'affiliate' });
  });

  it('reports a phone conflict against a patient profile using normalized phones', async () => {
    const stub = createStub({ ...EMPTY, profiles: [{ id: 'u1', dni: '1', cuil: null, phone: '+54 9 11 5555-1234' }] });
    const res = await run(stub, { titularDni: '30111222', titularPhone: '11 5555 1234', planType: 'familiar' });
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicts).toContainEqual(expect.objectContaining({
      identifier: 'phone', person: 'titular',
      message: 'El telefono ya esta registrado en otro afiliado o solicitud pendiente.',
    }));
  });

  it('reports a phone conflict against a pending adhesion request', async () => {
    const stub = createStub({ ...EMPTY, adhesion_requests: [{ id: 'a1', titular_dni: '99', titular_cuil: null, titular_phone: '1155551234' }] });
    const res = await run(stub, { titularDni: '30111222', titularPhone: '11 5555 1234' });
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicts.map((c) => c.identifier)).toContain('phone');
  });

  it('skips the phone check when titularPhone is missing', async () => {
    const stub = createStub({ ...EMPTY, profiles: [{ id: 'u1', dni: '1', cuil: null, phone: '1155551234' }] });
    const res = await run(stub, { titularDni: '30111222' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects any additional member for an Individual plan with 400', async () => {
    const res = await run(createStub(EMPTY), { titularDni: '30111222', planType: 'Individual', family: [{ dni: '31123456' }] });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Individual/);
  });

  it('rejects more than 4 additional members for Familiar with 400', async () => {
    const family = [1, 2, 3, 4, 5].map((n) => ({ dni: `3112345${n}` }));
    const res = await run(createStub(EMPTY), { titularDni: '30111222', planType: 'familiar', family });
    expect(res.statusCode).toBe(400);
  });

  it('accepts exactly 4 additional members for Familiar', async () => {
    const family = [1, 2, 3, 4].map((n) => ({ dni: `3112345${n}` }));
    const res = await run(createStub(EMPTY), { titularDni: '30111222', planType: 'familiar', family });
    expect(res.statusCode).toBe(200);
  });

  it('resolves a legacy plan name through plans.plan_kind for the cap', async () => {
    const stub = createStub({ ...EMPTY, plans: [{ plan_kind: 'individual' }] });
    const res = await run(stub, { titularDni: '30111222', planType: 'Plan Viejo', family: [{ dni: '31123456' }] });
    expect(res.statusCode).toBe(400);
  });

  it('defaults to the family cap of 4 when planType is absent', async () => {
    const family = [1, 2, 3, 4].map((n) => ({ dni: `3112345${n}` }));
    const res = await run(createStub(EMPTY), { titularDni: '30111222', family });
    expect(res.statusCode).toBe(200);
  });
});
