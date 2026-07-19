import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdhesionRepository, AdhesionRequest } from '../AdhesionRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn()
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
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true })
    } as Response);

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

    const request = buildRequest();
    await repository.submitApplication(request);

    expect(fetchSpy).toHaveBeenCalledWith('/api/adhesion/check-duplicates', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        titularDni: request.titular_dni,
        titularCuil: request.titular_cuil,
        family: [
          { dni: '31123456', cuil: '27-31123456-4', name: 'María Pérez' }
        ]
      })
    }));

    // check-duplicates must be called before the insert
    expect(fetchSpy.mock.invocationCallOrder[0]).toBeLessThan(insertMock.mock.invocationCallOrder[0]);
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

  it('throws the conflict message returned by check-duplicates on a 409 response and does not insert', async () => {
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
      'Este DNI ya se encuentra afiliado a Medinex.'
    );

    expect(insertMock).not.toHaveBeenCalled();
  });

  it('joins multiple conflict messages when check-duplicates returns more than one conflict', async () => {
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
      'Este DNI ya se encuentra afiliado a Medinex. Ya existe una solicitud pendiente con este CUIL.'
    );

    expect(insertMock).not.toHaveBeenCalled();
  });
});
