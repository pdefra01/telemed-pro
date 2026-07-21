import { describe, it, expect, vi, beforeEach } from 'vitest';
import { affiliateRepository, PlanAssignmentFailedError } from '../AffiliateRepository';
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

  it('assigns plan_id with a follow-up write when creating an affiliate with a real plan selected', async () => {
    const mockPatientData: Partial<Patient> = {
      name: 'Ana Gómez',
      dni: '30111222',
      email: 'ana@test.com',
      planId: 'plan-real-id',
    };

    const mockApiResponse = { id: 'mock-patient-id-2', email: 'ana@test.com', dni: '30111222' };

    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    // Chain 1: initial profile fetch right after the trigger creates the row (no plan yet)
    const initialSingle = vi.fn().mockResolvedValue({
      data: { id: 'mock-patient-id-2', full_name: 'Ana Gómez', email: 'ana@test.com', dni: '30111222', plan_id: null, role: 'patient' },
      error: null,
    });
    const initialSelectChain = { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: initialSingle }) }) };

    // Chain 2: the follow-up update().eq().select().single() assigning plan_id
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'mock-patient-id-2', full_name: 'Ana Gómez', email: 'ana@test.com', dni: '30111222', plan_id: 'plan-real-id', plan_name: 'Plan Familiar Medinex', role: 'patient' },
      error: null,
    });
    const updateChain = { update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) }) };

    vi.mocked(supabase.from)
      .mockReturnValueOnce(initialSelectChain as any)
      .mockReturnValueOnce(updateChain as any);

    const result = await affiliateRepository.createAffiliate(mockPatientData);

    // Proves the follow-up write set plan_id (not a free-text plan_name)
    expect(updateChain.update).toHaveBeenCalledWith({ plan_id: 'plan-real-id' });
    expect(result.planId).toBe('plan-real-id');
    expect(result.planName).toBe('Plan Familiar Medinex');
  });

  it('never fabricates "Plan Base" when the trigger sync fails and no real plan name is available (createAffiliate simulated fallback)', async () => {
    const mockPatientData: Partial<Patient> = {
      name: 'Sin Plan',
      dni: '40111222',
      email: 'sinplan@test.com',
    };

    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'mock-id-noplan', email: 'sinplan@test.com', dni: '40111222' }),
    } as Response);

    // Simulates the trigger not having synced yet — profile fetch errors out.
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    const result = await affiliateRepository.createAffiliate(mockPatientData);

    expect(result.planName).toBe('Sin plan asignado');
    expect(result.planName).not.toBe('Plan Base');
  });

  it('never fabricates "Plan Base" in the createBulk simulated fallback when profile fetch fails', async () => {
    const mockBulkData: Partial<Patient>[] = [
      { name: 'Bulk Sin Plan', dni: '50111222', email: 'bulk@test.com' },
    ];

    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        summary: { total: 1, success: 1, failed: 0 },
        successful: [{ dni: '50111222', id: 'bulk-id-1' }],
        failures: [],
      }),
    } as Response);

    const inMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    const selectMock = vi.fn().mockReturnValue({ in: inMock });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    const result = await affiliateRepository.createBulk(mockBulkData);

    expect(result[0].planName).toBe('Sin plan asignado');
    expect(result[0].planName).not.toBe('Plan Base');
  });

  it('never fabricates "Plan Base" when mapping a profile row with no plan_name (mapProfileToPatient via getAllAffiliates)', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ id: 'p1', full_name: 'Sin Plan', role: 'patient', plan_id: null, plan_name: null }],
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    const result = await affiliateRepository.getAllAffiliates();

    expect(result[0].planName).toBe('Sin plan asignado');
    expect(result[0].planName).not.toBe('Plan Base');
  });

  it('throws PlanAssignmentFailedError (instead of silently succeeding) when the follow-up plan_id write fails', async () => {
    const mockPatientData: Partial<Patient> = {
      name: 'Falla Plan',
      dni: '60111222',
      email: 'fallaplan@test.com',
      planId: 'plan-real-id',
    };

    vi.spyOn(window, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'mock-id-fallaplan', email: 'fallaplan@test.com', dni: '60111222' }),
    } as Response);

    const initialSingle = vi.fn().mockResolvedValue({
      data: { id: 'mock-id-fallaplan', full_name: 'Falla Plan', email: 'fallaplan@test.com', dni: '60111222', plan_id: null, role: 'patient' },
      error: null,
    });
    const initialSelectChain = { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: initialSingle }) }) };

    // The follow-up plan_id UPDATE fails.
    const updateSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'update failed' } });
    const updateChain = { update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) }) };

    vi.mocked(supabase.from)
      .mockReturnValueOnce(initialSelectChain as any)
      .mockReturnValueOnce(updateChain as any);

    await expect(affiliateRepository.createAffiliate(mockPatientData)).rejects.toBeInstanceOf(PlanAssignmentFailedError);
  });

  it('writes plan_id (never a free-text plan_name) when updating an affiliate with a plan selection', async () => {
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'test-id', full_name: 'Juan Pérez', email: 'juan@test.com', plan_id: 'plan-real-id', plan_name: 'Plan Familiar Medinex', role: 'patient' },
      error: null,
    });
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) });
    vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as any);

    const result = await affiliateRepository.updateAffiliate('test-id', { planId: 'plan-real-id' });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ plan_id: 'plan-real-id' }));
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({ plan_name: expect.anything() }));
    expect(result.planId).toBe('plan-real-id');
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

  it('should update profile to active when calling activateAffiliate', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as any);

    await affiliateRepository.activateAffiliate('test-id');

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith({ is_active: true, plan_status: 'active' });
    expect(eqMock).toHaveBeenCalledWith('id', 'test-id');
  });

  it('should update profile to suspended when calling deactivateAffiliate', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as any);

    await affiliateRepository.deactivateAffiliate('test-id');

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith({ is_active: false, plan_status: 'suspended' });
    expect(eqMock).toHaveBeenCalledWith('id', 'test-id');
  });

  describe('getConsultationQuotaStatus', () => {
    /** Builds a `profiles` select-by-id chain: select().eq().single() */
    const profileByIdChain = (data: any, error: any = null) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    });

    /** Builds a `plans` select-by-id chain: select().eq().single() */
    const planByIdChain = (data: any, error: any = null) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    });

    /** Builds a `profiles` family aggregation chain: select().eq() (no .single()) */
    const familyChain = (data: any[], error: any = null) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error }),
      }),
    });

    it('resolves a finite-quota plan and reports remaining/over-quota correctly', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(profileByIdChain({
          plan_id: 'plan-1',
          current_period_quota_used: 2,
          family_group_id: null,
        }) as any)
        .mockReturnValueOnce(planByIdChain({
          name: 'Plan Familiar Medinex',
          bonified_consultations: 6,
          is_unlimited: false,
        }) as any);

      const result = await affiliateRepository.getConsultationQuotaStatus('patient-1');

      expect(result).toEqual({
        quotaUsed: 2,
        totalBonified: 6,
        remaining: 4,
        isUnlimited: false,
        hasPlan: true,
        isOverQuota: false,
        planName: 'Plan Familiar Medinex',
      });
    });

    it('reports isOverQuota true once usage reaches the finite plan cap (proves the old =4 fabrication is gone)', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(profileByIdChain({
          plan_id: 'plan-1',
          current_period_quota_used: 6,
          family_group_id: null,
        }) as any)
        .mockReturnValueOnce(planByIdChain({
          name: 'Plan Familiar Medinex',
          bonified_consultations: 6,
          is_unlimited: false,
        }) as any);

      const result = await affiliateRepository.getConsultationQuotaStatus('patient-1');

      expect(result.isOverQuota).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.totalBonified).toBe(6);
    });

    it('reports unlimited plans with null bounds and never over-quota', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(profileByIdChain({
          plan_id: 'plan-2',
          current_period_quota_used: 999,
          family_group_id: null,
        }) as any)
        .mockReturnValueOnce(planByIdChain({
          name: 'Plan Ilimitado',
          bonified_consultations: 0,
          is_unlimited: true,
        }) as any);

      const result = await affiliateRepository.getConsultationQuotaStatus('patient-2');

      expect(result).toEqual({
        quotaUsed: 999,
        totalBonified: null,
        remaining: null,
        isUnlimited: true,
        hasPlan: true,
        isOverQuota: false,
        planName: 'Plan Ilimitado',
      });
    });

    it('returns an explicit no-plan state without fabricating a quota when plan_id is null', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(profileByIdChain({
          plan_id: null,
          current_period_quota_used: 1,
          family_group_id: null,
        }) as any);

      const result = await affiliateRepository.getConsultationQuotaStatus('patient-3');

      expect(result).toEqual({
        quotaUsed: 1,
        totalBonified: 0,
        remaining: 0,
        isUnlimited: false,
        hasPlan: false,
        isOverQuota: false,
        planName: 'Sin plan asignado',
      });
    });

    it('aggregates quotaUsed across the family group before resolving the plan', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(profileByIdChain({
          plan_id: 'plan-1',
          current_period_quota_used: 2,
          family_group_id: 'family-1',
        }) as any)
        .mockReturnValueOnce(familyChain([
          { current_period_quota_used: 2 },
          { current_period_quota_used: 3 },
        ]) as any)
        .mockReturnValueOnce(planByIdChain({
          name: 'Plan Familiar Medinex',
          bonified_consultations: 6,
          is_unlimited: false,
        }) as any);

      const result = await affiliateRepository.getConsultationQuotaStatus('patient-1');

      expect(result.quotaUsed).toBe(5);
      expect(result.remaining).toBe(1);
    });
  });
});
