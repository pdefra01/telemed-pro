import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PlanRepository } from '../PlanRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('PlanRepository', () => {
  let repository: PlanRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PlanRepository();
  });

  describe('getAll', () => {
    it('maps snake_case DB rows to the camelCase Plan shape, including isUnlimited', async () => {
      const rows = [
        {
          id: 'plan-1',
          name: 'Plan Familiar Medinex',
          monthly_cost: 50000,
          bonified_consultations: 6,
          is_unlimited: false,
          max_family_members: 4,
          metadata: { foo: 'bar' },
        },
      ];
      const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null });
      const selectMock = vi.fn().mockReturnValue({ order: orderMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const plans = await repository.getAll();

      expect(plans).toHaveLength(1);
      expect(plans[0]).toEqual({
        id: 'plan-1',
        name: 'Plan Familiar Medinex',
        monthlyCost: 50000,
        bonifiedConsultations: 6,
        isUnlimited: false,
        maxFamilyMembers: 4,
        metadata: { foo: 'bar' },
      });
    });

    it('maps an unlimited plan row with isUnlimited true', async () => {
      const rows = [
        {
          id: 'plan-2',
          name: 'Plan Ilimitado',
          monthly_cost: 90000,
          bonified_consultations: 0,
          is_unlimited: true,
          max_family_members: 6,
          metadata: null,
        },
      ];
      const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null });
      const selectMock = vi.fn().mockReturnValue({ order: orderMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const plans = await repository.getAll();

      expect(plans[0].isUnlimited).toBe(true);
      expect(plans[0].monthlyCost).toBe(90000);
    });
  });

  describe('getById', () => {
    it('maps a single snake_case DB row to the camelCase Plan shape', async () => {
      const row = {
        id: 'plan-1',
        name: 'Plan Familiar Medinex',
        monthly_cost: 50000,
        bonified_consultations: 6,
        is_unlimited: false,
        max_family_members: 4,
        metadata: {},
      };
      const singleMock = vi.fn().mockResolvedValue({ data: row, error: null });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const plan = await repository.getById('plan-1');

      expect(plan).toEqual({
        id: 'plan-1',
        name: 'Plan Familiar Medinex',
        monthlyCost: 50000,
        bonifiedConsultations: 6,
        isUnlimited: false,
        maxFamilyMembers: 4,
        metadata: {},
      });
    });

    it('returns null when no row is found', async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const plan = await repository.getById('missing');

      expect(plan).toBeNull();
    });
  });

  describe('create', () => {
    it('sends camelCase input as snake_case columns and maps the returned row back', async () => {
      const insertedRow = {
        id: 'plan-3',
        name: 'Plan Nuevo',
        monthly_cost: 30000,
        bonified_consultations: 3,
        is_unlimited: false,
        max_family_members: 2,
        metadata: {},
      };
      const singleMock = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
      const selectChainMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectChainMock });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

      const plan = await repository.create({
        name: 'Plan Nuevo',
        monthlyCost: 30000,
        bonifiedConsultations: 3,
        isUnlimited: false,
        maxFamilyMembers: 2,
      });

      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Plan Nuevo',
          monthly_cost: 30000,
          bonified_consultations: 3,
          is_unlimited: false,
          max_family_members: 2,
        }),
      ]);
      expect(plan.monthlyCost).toBe(30000);
      expect(plan.isUnlimited).toBe(false);
    });
  });
});
