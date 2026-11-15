import { describe, it, expect, vi } from 'vitest';
import { issuePrescription, IssuePrescriptionDeps } from '../issuePrescription.ts';

const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';
const PATIENT_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';

type Row = Record<string, unknown>;

// Minimal stand-in for the service-role supabase client: only the calls the
// function makes (select/eq/maybeSingle, insert[/select/single], auth.getUser).
function fakeSupabase(opts: {
  tables?: Record<string, Row[]>;
  tokenUser?: Record<string, Row | undefined>;
  affiliates?: string[];
  failingTables?: string[];
  failInsert?: boolean;
} = {}) {
  const tables: Record<string, Row[]> = {
    profiles: [
      { id: DOCTOR_ID, role: 'doctor', full_name: 'Ana Pérez', professional_title: 'Dra.', license_number: 'MN 123', specialty: 'Clínica' },
      { id: PATIENT_ID, role: 'patient', full_name: 'Juan Gómez', dni: '30111222', family_group_id: 'group-1' },
    ],
    family_members: [
      { id: MEMBER_ID, full_name: 'Lucía Gómez', dni: '50111222', family_group_id: 'group-1' },
      { id: OTHER_MEMBER_ID, full_name: 'Otro Grupo', dni: '50999888', family_group_id: 'group-2' },
    ],
    ...opts.tables,
  };
  const tokenUser = opts.tokenUser ?? { 'doctor-token': { id: DOCTOR_ID } };
  const affiliates = opts.affiliates ?? [PATIENT_ID];
  const inserted: Record<string, Row[]> = {};
  const touched: string[] = [];

  const client = {
    auth: {
      getUser: vi.fn(async (token: string) => {
        const user = tokenUser[token];
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
      }),
    },
    rpc: vi.fn(async (fn: string, args: { p_profile_id: string }) =>
      fn === 'is_affiliate' ? { data: affiliates.includes(args.p_profile_id), error: null } : { data: null, error: { message: 'unknown rpc' } }),
    from(table: string) {
      touched.push(table);
      return {
        select() {
          const filters: [string, unknown][] = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            async maybeSingle() {
              if (opts.failingTables?.includes(table)) return { data: null, error: { message: 'connection lost' } };
              const row = (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v));
              return { data: row ?? null, error: null };
            },
          };
          return builder;
        },
        insert(row: Row) {
          (inserted[table] ??= []).push(row);
          const result = { data: null, error: null };
          return {
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
            select() {
              return {
                single: async () => (opts.failInsert && table === 'prescriptions'
                  ? { data: null, error: { message: 'insert failed' } }
                  : { data: { id: 'presc-1' }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  return { client, inserted, touched };
}

function deps(over: Partial<IssuePrescriptionDeps> = {}, supa = fakeSupabase()) {
  const buildPdf = vi.fn(async () => new Uint8Array([1, 2, 3]));
  const uploadPdf = vi.fn(async (_client: unknown, fileName: string) => ({ pdfUrl: `https://signed/${fileName}`, pdfPath: fileName }));
  const removePdf = vi.fn(async () => {});
  return {
    supa,
    buildPdf,
    uploadPdf,
    removePdf,
    deps: { supabase: supa.client, buildPdf, uploadPdf, removePdf, now: () => 1700000000000, ...over } as IssuePrescriptionDeps,
  };
}

const medsBody = {
  patientId: PATIENT_ID,
  medications: [
    { name: ' Amoxicilina 500mg ', instructions: 'Cada 8hs por 7 días', productId: PRODUCT_ID },
    { name: 'Ibuprofeno 400mg', instructions: 'Si hay dolor', productId: 'not-a-uuid' },
  ],
  indications: '  Reposo  ',
};

describe('issuePrescription', () => {
  it('rejects a request without a token with 401 and writes nothing', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: null, body: medsBody });
    expect(res.status).toBe(401);
    expect(supa.inserted).toEqual({});
  });

  it('rejects an invalid token with 401', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: 'bad', body: medsBody });
    expect(res.status).toBe(401);
    expect(supa.inserted).toEqual({});
  });

  it('rejects a caller who is not a doctor with 403 and writes nothing', async () => {
    const supa = fakeSupabase({ tokenUser: { 'patient-token': { id: PATIENT_ID } } });
    const { deps: d, buildPdf } = deps({}, supa);
    const res = await issuePrescription(d, { token: 'patient-token', body: medsBody });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Solo un médico puede emitir recetas.' });
    expect(supa.inserted).toEqual({});
    expect(buildPdf).not.toHaveBeenCalled();
  });

  it('returns 404 when the patient does not exist', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, patientId: '99999999-9999-4999-8999-999999999999' } });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Paciente no encontrado.' });
    expect(supa.inserted).toEqual({});
  });

  it('requires medications, indications or an obra social link', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { patientId: PATIENT_ID, medications: [], indications: '   ' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'La receta necesita al menos un medicamento, indicaciones o el link de obra social.' });
    expect(supa.inserted).toEqual({});
  });

  it('rejects a medication without a name', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { patientId: PATIENT_ID, medications: [{ name: '  ', instructions: 'x' }] } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Cada medicamento necesita un nombre.' });
    expect(supa.inserted).toEqual({});
  });

  it('rejects an obra social link that is not https', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { patientId: PATIENT_ID, externalPrescriptionUrl: 'http://os.example/receta' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'El link de la receta de obra social debe ser una URL https válida (máximo 2000 caracteres)' });
    expect(supa.inserted).toEqual({});
  });

  it('rejects a family member from another family group before building or storing anything', async () => {
    const { deps: d, supa, buildPdf, uploadPdf } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, familyMemberId: OTHER_MEMBER_ID } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'El integrante no pertenece al grupo familiar del paciente.' });
    expect(buildPdf).not.toHaveBeenCalled();
    expect(uploadPdf).not.toHaveBeenCalled();
    expect(supa.inserted).toEqual({});
  });

  it('issues a receta for the titular with no appointment and the caller as doctor', async () => {
    const { deps: d, supa, buildPdf, uploadPdf } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, doctorId: PATIENT_ID, appointmentId: 'x' } });

    const fileName = `${PATIENT_ID}/standalone-1700000000000.pdf`;
    expect(res).toEqual({ status: 201, body: { prescriptionId: 'presc-1', pdfUrl: `https://signed/${fileName}` } });

    expect(buildPdf).toHaveBeenCalledWith({
      attended: { full_name: 'Juan Gómez', dni: '30111222' },
      doctorDisplayName: 'Dra. Ana Pérez',
      doctor: { license_number: 'MN 123', specialty: 'Clínica' },
      medications: [
        { name: 'Amoxicilina 500mg', instructions: 'Cada 8hs por 7 días' },
        { name: 'Ibuprofeno 400mg', instructions: 'Si hay dolor' },
      ],
    });
    expect(uploadPdf).toHaveBeenCalledWith(supa.client, fileName, new Uint8Array([1, 2, 3]));

    expect(supa.inserted.prescriptions).toHaveLength(1);
    const row = supa.inserted.prescriptions[0];
    expect(row).toMatchObject({
      appointment_id: null,
      patient_id: PATIENT_ID,
      family_member_id: null,
      doctor_id: DOCTOR_ID,
      doctor_name: 'Ana Pérez',
      digital_signature: '',
      medications: [
        { name: 'Amoxicilina 500mg', instructions: 'Cada 8hs por 7 días', quantity: 1, productId: PRODUCT_ID },
        { name: 'Ibuprofeno 400mg', instructions: 'Si hay dolor', quantity: 1 },
      ],
      notes: 'Reposo',
      pdf_url: `https://signed/${fileName}`,
      pdf_path: fileName,
    });
    expect(row.expiration_date).toBe(new Date(1700000000000 + 30 * 24 * 60 * 60 * 1000).toISOString());
    expect(row).not.toHaveProperty('external_prescription_url');

    // A receta is not a consultation: no evolución, no appointment change.
    expect(supa.touched).not.toContain('medical_records');
    expect(supa.touched).not.toContain('appointments');

    expect(supa.inserted.notifications).toEqual([
      {
        user_id: PATIENT_ID,
        title: 'Nueva receta',
        message: 'La Dra. Ana Pérez te envió una receta. Ya podés verla en tu historial.',
        type: 'success',
        link: '/dashboard/medical-records',
      },
    ]);
  });

  it('issues the receta for a family member and prints the member on the PDF', async () => {
    const { deps: d, supa, buildPdf } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, familyMemberId: MEMBER_ID } });
    expect(res.status).toBe(201);
    expect(buildPdf.mock.calls[0][0]).toMatchObject({ attended: { full_name: 'Lucía Gómez', dni: '50111222' } });
    expect(supa.inserted.prescriptions[0]).toMatchObject({ patient_id: PATIENT_ID, family_member_id: MEMBER_ID });
  });

  it('stores indications alone without building a PDF', async () => {
    const { deps: d, supa, buildPdf, uploadPdf } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { patientId: PATIENT_ID, indications: 'Dieta blanda' } });
    expect(res).toEqual({ status: 201, body: { prescriptionId: 'presc-1', pdfUrl: null } });
    expect(buildPdf).not.toHaveBeenCalled();
    expect(uploadPdf).not.toHaveBeenCalled();
    expect(supa.inserted.prescriptions[0]).toMatchObject({ medications: [], notes: 'Dieta blanda', pdf_url: null, pdf_path: null });
  });

  it('stores an obra social link instead of medications and a PDF', async () => {
    const { deps: d, supa, buildPdf } = deps();
    const url = 'https://os.example/receta/123';
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, externalPrescriptionUrl: ` ${url} ` } });
    expect(res.status).toBe(201);
    expect(buildPdf).not.toHaveBeenCalled();
    expect(supa.inserted.prescriptions[0]).toMatchObject({ medications: [], external_prescription_url: url, pdf_url: null });
  });

  it('fails with 500 and stores nothing when the PDF upload fails', async () => {
    const { deps: d, supa } = deps({ uploadPdf: vi.fn(async () => { throw new Error('storage down'); }) });
    const res = await issuePrescription(d, { token: 'doctor-token', body: medsBody });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'No se pudo guardar el PDF de la receta. Intentá de nuevo.' });
    expect(supa.inserted.prescriptions).toBeUndefined();
  });

  it('only issues recetas to affiliates, never to staff profiles', async () => {
    const { deps: d, supa, buildPdf } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, patientId: DOCTOR_ID } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Solo se pueden emitir recetas a afiliados.' });
    expect(supa.client.rpc).toHaveBeenCalledWith('is_affiliate', { p_profile_id: DOCTOR_ID });
    expect(buildPdf).not.toHaveBeenCalled();
    expect(supa.inserted).toEqual({});
  });

  it('reports a failed lookup as a server error instead of "not found"', async () => {
    const supa = fakeSupabase({ failingTables: ['family_members'] });
    const { deps: d } = deps({}, supa);
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, familyMemberId: MEMBER_ID } });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'No se pudo emitir la receta. Intentá de nuevo.' });
    expect(supa.inserted).toEqual({});
  });

  it('removes the uploaded PDF when the receta cannot be saved', async () => {
    const supa = fakeSupabase({ failInsert: true });
    const { deps: d, removePdf } = deps({}, supa);
    const res = await issuePrescription(d, { token: 'doctor-token', body: medsBody });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'No se pudo guardar la receta. Intentá de nuevo.' });
    expect(removePdf).toHaveBeenCalledWith(supa.client, `${PATIENT_ID}/standalone-1700000000000.pdf`);
    expect(supa.inserted.notifications).toBeUndefined();
  });

  it('treats an empty family member as the titular', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, familyMemberId: '' } });
    expect(res.status).toBe(201);
    expect(supa.inserted.prescriptions[0]).toMatchObject({ family_member_id: null });
    expect(supa.touched).not.toContain('family_members');
  });

  it('rejects a malformed family member id before reading the patient', async () => {
    const { deps: d, supa } = deps();
    const res = await issuePrescription(d, { token: 'doctor-token', body: { ...medsBody, familyMemberId: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    expect(supa.client.rpc).not.toHaveBeenCalled();
    expect(supa.touched.filter((t) => t !== 'profiles')).toEqual([]);
    expect(supa.inserted).toEqual({});
  });

  describe('suspended or cancelled affiliates (L7: "Bloquear")', () => {
    const blocked = 'El afiliado está suspendido o dado de baja: no se le pueden emitir recetas.';
    const withPatient = (patch: Row, extra: Record<string, Row[]> = {}) => {
      const profiles = [
        { id: DOCTOR_ID, role: 'doctor', full_name: 'Ana Pérez', professional_title: 'Dra.' },
        { id: PATIENT_ID, role: 'patient', full_name: 'Juan Gómez', dni: '30111222', family_group_id: 'group-1', is_active: true, plan_status: 'active', ...patch },
      ];
      return fakeSupabase({ tables: { profiles, ...extra } });
    };

    it.each([
      ['inactive', { is_active: false }],
      ['suspended', { plan_status: 'suspended' }],
      ['cancelled', { plan_status: 'cancelled' }],
    ])('blocks a receta for a %s affiliate before building or storing anything', async (_label, patch) => {
      const supa = withPatient(patch);
      const { deps: d, buildPdf } = deps({}, supa);
      const res = await issuePrescription(d, { token: 'doctor-token', body: medsBody });
      expect(res).toEqual({ status: 400, body: { error: blocked } });
      expect(buildPdf).not.toHaveBeenCalled();
      expect(supa.inserted).toEqual({});
    });

    it('blocks a receta once the cancellation is effective, even before the sweep', async () => {
      const supa = withPatient({}, { affiliate_cancellations: [{ profile_id: PATIENT_ID, effective_at: '2023-11-01T00:00:00.000Z' }] });
      const { deps: d } = deps({}, supa);
      const res = await issuePrescription(d, { token: 'doctor-token', body: medsBody });
      expect(res).toEqual({ status: 400, body: { error: blocked } });
      expect(supa.inserted).toEqual({});
    });

    it('still issues while a scheduled cancellation is within the paid period', async () => {
      const supa = withPatient({}, { affiliate_cancellations: [{ profile_id: PATIENT_ID, effective_at: '2023-12-31T00:00:00.000Z' }] });
      const { deps: d } = deps({}, supa);
      const res = await issuePrescription(d, { token: 'doctor-token', body: medsBody });
      expect(res.status).toBe(201);
    });
  });
});
