import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdhesionRepository, AdhesionRequest } from '../AdhesionRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        getSession: vi.fn()
      }
    }
  };
});

const buildRequest = (overrides: Partial<AdhesionRequest> = {}): AdhesionRequest => ({
  titular_name: 'Juan Pérez',
  titular_first_name: 'Juan',
  titular_last_name: 'Pérez',
  titular_dni: '30123456',
  titular_cuil: '20-30123456-7',
  titular_birth_date: '1990-01-01',
  titular_address: 'Calle Falsa 123',
  titular_locality: 'Rosario',
  titular_neighborhood: 'Centro',
  titular_email: 'juan@test.com',
  titular_phone: '3416123456',
  titular_civil_status: 'Soltero/a',
  payment_method: 'debit',
  family_members: [
    { name: 'María Pérez', dni: '31123456', cuil: '27-31123456-4', parentesco: 'cónyuge' }
  ],
  consent_data_treatment: true,
  consent_promotions: false,
  signature_base64: 'data:image/png;base64,xxx',
  ...overrides
});

describe('AdhesionRepository', () => {
  let repository: AdhesionRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    repository = new AdhesionRepository();
  });

  it('calls POST /api/adhesion/check-duplicates before inserting the adhesion request', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'adhesion-1' });

    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest();
    const result = await repository.submitApplication(request);

    expect(fetchSpy).toHaveBeenCalledWith('/api/adhesion/check-duplicates', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        titularDni: request.titular_dni,
        titularCuil: request.titular_cuil,
        titularPhone: request.titular_phone,
        planType: request.plan_type,
        family: [
          { dni: '31123456', cuil: '27-31123456-4', name: 'María Pérez' }
        ]
      })
    }));

    // check-duplicates must be called before the insert
    expect(fetchSpy.mock.invocationCallOrder[0]).toBeLessThan(insertMock.mock.invocationCallOrder[0]);

    // The id is generated client-side (no SELECT policy exists for the anon
    // role, so the caller cannot rely on a post-insert .select().single())
    // and returned so the caller (AdhesionForm.tsx) can create the
    // débito-automático MP preapproval against it.
    expect(result).toEqual({ id: 'adhesion-1' });

    vi.unstubAllGlobals();
  });

  it('includes titular_cuil in the insert payload and preserves cuil in each family member entry', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest();
    await repository.submitApplication(request);

    expect(supabase.from).toHaveBeenCalledWith('adhesion_requests');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      titular_cuil: '20-30123456-7',
      family_members: [
        { name: 'María Pérez', dni: '31123456', cuil: '27-31123456-4', parentesco: 'cónyuge' }
      ]
    }));
  });

  it('throws a conflict message identifying the titular on a 409 response and does not insert', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        conflicts: [
          {
            identifier: 'dni',
            value: '30123456',
            person: 'titular',
            name: null,
            reason: 'affiliate',
            message: 'Este DNI ya se encuentra afiliado a Medinex.'
          }
        ]
      })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest();

    await expect(repository.submitApplication(request)).rejects.toThrow(
      'Titular: Este DNI ya se encuentra afiliado a Medinex.'
    );

    expect(insertMock).not.toHaveBeenCalled();
  });

  it('renders a phone conflict for the titular', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        conflicts: [
          {
            identifier: 'phone',
            value: '3416123456',
            person: 'titular',
            name: null,
            reason: 'affiliate',
            message: 'El telefono ya esta registrado en otro afiliado o solicitud pendiente.'
          }
        ]
      })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    await expect(repository.submitApplication(buildRequest())).rejects.toThrow(
      'Titular: El telefono ya esta registrado en otro afiliado o solicitud pendiente.'
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('surfaces the server error message (e.g. plan family cap) on a 400 response and does not insert', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'El plan Individual no admite integrantes adicionales.' })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    await expect(repository.submitApplication(buildRequest({ plan_type: 'individual' }))).rejects.toThrow(
      'El plan Individual no admite integrantes adicionales.'
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('joins multiple conflict messages, each identifying the specific person (titular or named family member)', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        conflicts: [
          {
            identifier: 'dni',
            value: '30123456',
            person: 'titular',
            name: null,
            reason: 'affiliate',
            message: 'Este DNI ya se encuentra afiliado a Medinex.'
          },
          {
            identifier: 'cuil',
            value: '27-31123456-4',
            person: 'family',
            name: 'María Pérez',
            reason: 'pending_request',
            message: 'Ya existe una solicitud pendiente con este CUIL.'
          }
        ]
      })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest();

    await expect(repository.submitApplication(request)).rejects.toThrow(
      'Titular: Este DNI ya se encuentra afiliado a Medinex. Familiar María Pérez: Ya existe una solicitud pendiente con este CUIL.'
    );

    expect(insertMock).not.toHaveBeenCalled();
  });

  // Corte 1 (design 3.7/3.6) — sdd/advisor-auto-provisioning: this branch
  // already existed before this change; this test only blinds/documents it,
  // with no production code touched.
  it('rejects submission with an inactive or non-existent promoter_id, never inserting the request', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const producerChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockImplementation((table: string) =>
      (table === 'producers' ? producerChain : { insert: insertMock }) as any
    );

    const request = buildRequest({ promoter_id: 'PROMO_INACTIVE' });

    await expect(repository.submitApplication(request)).rejects.toThrow(
      'El código de promotor ingresado no es válido o no está activo.'
    );

    expect(supabase.from).toHaveBeenCalledWith('producers');
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Judgment Day finding K3: when the promoter_id validation query itself
  // errors (not "not found" — a network/DB error), the insert must never
  // persist the unvalidated code, and the caller's `data` object must stay
  // untouched (in case it's reused/shared by the caller).
  it('clears promoter_id from the insert (without mutating the caller object) when validation itself errors', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const producerChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'network error' } }),
          }),
        }),
      }),
    };
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockImplementation((table: string) =>
      (table === 'producers' ? producerChain : { insert: insertMock }) as any
    );

    const request = buildRequest({ promoter_id: 'PROMO_UNVERIFIABLE' });
    await repository.submitApplication(request);

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ promoter_id: null }));
    // The caller's own object must not have been mutated as a side effect
    expect(request.promoter_id).toBe('PROMO_UNVERIFIABLE');
  });

  // Judgment Day finding K6: server-side DNI format guard mirroring
  // AdhesionForm.tsx's client-side `/^\d{7,8}$/` check, so a direct API call
  // bypassing the UI can't persist a malformed titular_dni.
  it('rejects a titular_dni that does not match 7-8 numeric digits and does not insert', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest({ titular_dni: '123ABC45' });

    await expect(repository.submitApplication(request)).rejects.toThrow(
      /DNI debe contener entre 7 y 8 dígitos/
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('accepts a titular_dni with surrounding whitespace, trimming it before the format check and insert', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest({ titular_dni: '  30123456  ' });
    await repository.submitApplication(request);

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ titular_dni: '30123456' }));
  });

  it('throws when the insert itself fails, instead of silently returning an undefined id', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: { message: 'insert failed' } });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest();

    await expect(repository.submitApplication(request)).rejects.toThrow('insert failed');
  });

  describe('approveApplication (D7 — sends the session Bearer token)', () => {
    it('sends the current session access_token as an Authorization Bearer header', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'admin-jwt-123' } }
      } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok' })
      } as Response);

      await repository.approveApplication('adhesion-1');

      expect(fetchSpy).toHaveBeenCalledWith('/api/approve-adhesion', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer admin-jwt-123'
        }),
        body: JSON.stringify({ adhesionId: 'adhesion-1' })
      }));
    });

    it('sends an empty Bearer token (never omits the header) when there is no active session', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null }
      } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok' })
      } as Response);

      await repository.approveApplication('adhesion-2');

      expect(fetchSpy).toHaveBeenCalledWith('/api/approve-adhesion', expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer ' })
      }));
    });

    it('throws the server error message when the request is rejected (e.g. 401/403)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'x' } }
      } as any);
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Acceso denegado. Se requieren permisos de administrador.' })
      } as Response);

      await expect(repository.approveApplication('adhesion-3')).rejects.toThrow(
        'Acceso denegado. Se requieren permisos de administrador.'
      );
    });
  });

  describe('updateApplicationEmail', () => {
    it('PATCHes the endpoint with the session Bearer token and returns the saved email', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'admin-jwt-9' } }
      } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, email: 'new@test.com', changed: true })
      } as Response);

      const email = await repository.updateApplicationEmail('adhesion-9', 'New@Test.com');

      expect(email).toBe('new@test.com');
      expect(fetchSpy).toHaveBeenCalledWith('/api/adhesion-requests/adhesion-9/email', expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Authorization': 'Bearer admin-jwt-9' }),
        body: JSON.stringify({ email: 'New@Test.com' })
      }));
    });

    it('surfaces the server error message (409 email in use)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: { access_token: 'x' } } } as any);
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Ese email ya pertenece a otra cuenta. Ingresá otro email.' })
      } as Response);

      await expect(repository.updateApplicationEmail('a', 'b@test.com')).rejects.toThrow(
        'Ese email ya pertenece a otra cuenta. Ingresá otro email.'
      );
    });

    it('falls back to a generic message when the error body is not JSON', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null } } as any);
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => { throw new Error('not json'); }
      } as unknown as Response);

      await expect(repository.updateApplicationEmail('a', 'b@test.com')).rejects.toThrow('Error al actualizar el email de la solicitud.');
    });
  });
});
