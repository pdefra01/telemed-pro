import { describe, it, expect, vi, beforeEach } from 'vitest';
import { affiliateRepository } from '../AffiliateRepository';
import { supabase } from '../../services/supabase';
import { Patient } from '../../types';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn()
    }
  };
});

describe('AffiliateRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should call /api/create-patient and fetch profiles on createAffiliate', async () => {
    const mockPatientData: Partial<Patient> = {
      name: 'Juan Pérez',
      dni: '35123456',
      email: 'juan@test.com',
      phone: '1122334455',
      address: 'Calle Falsa 123'
    };

    const mockApiResponse = {
      id: 'mock-patient-id',
      email: 'juan@test.com',
      dni: '35123456'
    };

    const mockProfileData = {
      id: 'mock-patient-id',
      full_name: 'Juan Pérez',
      email: 'juan@test.com',
      dni: '35123456',
      plan_name: 'Plan Base',
      plan_status: 'active',
      role: 'patient'
    };

    // Mock fetch
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse
    } as Response);

    // Mock supabase.from
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockProfileData, error: null })
      })
    });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    // Mock mapProfileToPatient internally to avoid actual mapping complexities
    const mapSpy = vi.spyOn(affiliateRepository as any, 'mapProfileToPatient').mockReturnValueOnce({
      id: 'mock-patient-id',
      name: 'Juan Pérez',
      email: 'juan@test.com',
      role: 'patient',
      dni: '35123456',
      planName: 'Plan Base',
      planStatus: 'active',
      paymentStatus: 'paid',
      currentPeriodQuotaUsed: 0
    });

    const result = await affiliateRepository.createAffiliate(mockPatientData);

    expect(fetchSpy).toHaveBeenCalledWith('/api/create-patient', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        full_name: 'Juan Pérez',
        dni: '35123456',
        email: 'juan@test.com',
        phone: '1122334455',
        address: 'Calle Falsa 123',
        password: '35123456'
      })
    }));

    expect(result.id).toBe('mock-patient-id');
    expect(result.name).toBe('Juan Pérez');
  });

  it('should call /api/create-patient-bulk and fetch profiles on createBulk', async () => {
    const mockBulkData: Partial<Patient>[] = [
      { name: 'Patient 1', dni: '11111111', email: 'p1@test.com' },
      { name: 'Patient 2', dni: '22222222', email: 'p2@test.com' }
    ];

    const mockApiResponse = {
      summary: { total: 2, success: 2, failed: 0 },
      successful: [
        { dni: '11111111', id: 'id-1' },
        { dni: '22222222', id: 'id-2' }
      ],
      failures: []
    };

    const mockProfiles = [
      { id: 'id-1', full_name: 'Patient 1', email: 'p1@test.com', dni: '11111111', role: 'patient' },
      { id: 'id-2', full_name: 'Patient 2', email: 'p2@test.com', dni: '22222222', role: 'patient' }
    ];

    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse
    } as Response);

    // Mock supabase.from
    const inMock = vi.fn().mockResolvedValue({ data: mockProfiles, error: null });
    const selectMock = vi.fn().mockReturnValue({ in: inMock });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    const result = await affiliateRepository.createBulk(mockBulkData);

    expect(fetchSpy).toHaveBeenCalledWith('/api/create-patient-bulk', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify([
        { name: 'Patient 1', email: 'p1@test.com', dni: '11111111', password: '11111111' },
        { name: 'Patient 2', email: 'p2@test.com', dni: '22222222', password: '22222222' }
      ])
    }));

    expect(result.length).toBe(2);
    expect(result[0].name).toBe('Patient 1');
    expect(result[1].name).toBe('Patient 2');
  });
});
