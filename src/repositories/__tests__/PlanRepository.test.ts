import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PlanRepository } from '../PlanRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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
          paid_months: 12,
          bonus_months: 2,
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
        paidMonths: 12,
        bonusMonths: 2,
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
          paid_months: 1,
          bonus_months: 0,
          metadata: null,
        },
      ];
      const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null });
      const selectMock = vi.fn().mockReturnValue({ order: orderMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const plans = await repository.getAll();

      expect(plans[0].isUnlimited).toBe(true);
      expect(plans[0].monthlyCost).toBe(90000);
      expect(plans[0].paidMonths).toBe(1);
      expect(plans[0].bonusMonths).toBe(0);
    });

    it('defaults paidMonths/bonusMonths to 1/0 for rows predating the billing-period migration', async () => {
      const rows = [
        {
          id: 'plan-legacy',
          name: 'Plan Legacy',
          monthly_cost: 40000,
          bonified_consultations: 4,
          is_unlimited: false,
          max_family_members: 3,
          paid_months: null,
          bonus_months: undefined,
          metadata: null,
        },
      ];
      const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null });
      const selectMock = vi.fn().mockReturnValue({ order: orderMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const plans = await repository.getAll();

      expect(plans[0].paidMonths).toBe(1);
      expect(plans[0].bonusMonths).toBe(0);
    });
  });

  describe('catalog fields and getOffered', () => {
    const row = {
      id: 'plan-fam-card',
      name: 'Familiar Debito Tarjeta',
      monthly_cost: 39999,
      bonified_consultations: 0,
      is_unlimited: true,
      max_family_members: 4,
      paid_months: 1,
      bonus_months: 0,
      plan_kind: 'familiar',
      payment_option: 'card_debit',
      is_offered: true,
      advisor_commission_amount: 25000,
      metadata: null,
    };

    it('maps plan_kind, payment_option, is_offered and advisor_commission_amount', async () => {
      const orderMock = vi.fn().mockResolvedValue({ data: [row], error: null });
      vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ order: orderMock }) } as any);

      const [plan] = await repository.getAll();

      expect(plan.planKind).toBe('familiar');
      expect(plan.paymentOption).toBe('card_debit');
      expect(plan.isOffered).toBe(true);
      expect(plan.advisorCommissionAmount).toBe(25000);
    });

    it('getOffered only queries plans with is_offered = true', async () => {
      const orderMock = vi.fn().mockResolvedValue({ data: [row], error: null });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqMock }) } as any);

      const plans = await repository.getOffered();

      expect(eqMock).toHaveBeenCalledWith('is_offered', true);
      expect(plans).toHaveLength(1);
      expect(plans[0].paymentOption).toBe('card_debit');
    });

    it('getOffered throws on a DB error', async () => {
      const orderMock = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') });
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: orderMock }) }),
      } as any);

      await expect(repository.getOffered()).rejects.toThrow('boom');
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
        paid_months: 6,
        bonus_months: 1,
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
        paidMonths: 6,
        bonusMonths: 1,
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
        is_default: false,
        paid_months: 12,
        bonus_months: 2,
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
        isDefault: false,
        paidMonths: 12,
        bonusMonths: 2,
      });

      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Plan Nuevo',
          monthly_cost: 30000,
          bonified_consultations: 3,
          is_unlimited: false,
          max_family_members: 2,
          paid_months: 12,
          bonus_months: 2,
        }),
      ]);
      expect(plan.monthlyCost).toBe(30000);
      expect(plan.isUnlimited).toBe(false);
      expect(plan.paidMonths).toBe(12);
      expect(plan.bonusMonths).toBe(2);
    });
  });

  describe('update', () => {
    it('sends only the provided camelCase fields as snake_case columns, including paidMonths/bonusMonths', async () => {
      const updatedRow = {
        id: 'plan-1',
        name: 'Plan Familiar Medinex',
        monthly_cost: 50000,
        bonified_consultations: 6,
        is_unlimited: false,
        max_family_members: 4,
        is_default: false,
        paid_months: 6,
        bonus_months: 1,
        metadata: {},
      };
      const singleMock = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
      const selectChainMock = vi.fn().mockReturnValue({ single: singleMock });
      const eqMock = vi.fn().mockReturnValue({ select: selectChainMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as any);

      const plan = await repository.update('plan-1', { paidMonths: 6, bonusMonths: 1 });

      expect(updateMock).toHaveBeenCalledWith({ paid_months: 6, bonus_months: 1 });
      expect(plan.paidMonths).toBe(6);
      expect(plan.bonusMonths).toBe(1);
    });
  });

  describe('setDefault', () => {
    it('delegates to the atomic set_default_plan RPC with the target id', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { id: 'plan-1', is_default: true },
        error: null,
      } as any);

      await repository.setDefault('plan-1');

      expect(supabase.rpc).toHaveBeenCalledWith('set_default_plan', { p_plan_id: 'plan-1' });
      // Proves this is no longer two sequential non-transactional UPDATEs —
      // a single atomic call replaces the old unset-then-set pattern.
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('throws when the RPC reports an error instead of silently succeeding', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Acceso denegado: Solo administradores pueden cambiar el plan por defecto.' },
      } as any);

      await expect(repository.setDefault('plan-1')).rejects.toBeTruthy();
    });

    it('throws when the RPC returns no row, proving a stale/deleted id is never silently accepted', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);

      await expect(repository.setDefault('deleted-plan-id')).rejects.toThrow();
    });
  });

  describe('create/update new catalog fields', () => {
    it('persists kind, payment option, offered flag and advisor commission as snake_case', async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: { id: 'p', name: 'x' }, error: null });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

      await repository.create({
        name: 'x', monthlyCost: 1, bonifiedConsultations: 0, isUnlimited: true, maxFamilyMembers: 4,
        isDefault: false, paidMonths: 1, bonusMonths: 0,
        planKind: 'familiar', paymentOption: 'standard', isOffered: false, advisorCommissionAmount: 25000,
      });

      const row = insertMock.mock.calls[0][0][0];
      expect(row).toMatchObject({
        plan_kind: 'familiar', payment_option: 'standard', is_offered: false, advisor_commission_amount: 25000,
      });
    });

    it('sends null kind/option when a withdrawn plan has none', async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: { id: 'p' }, error: null });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const eqMock = vi.fn().mockReturnValue({ select: selectMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as any);

      await repository.update('p', { planKind: null, paymentOption: null } as any);

      expect(updateMock.mock.calls[0][0]).toEqual({ plan_kind: null, payment_option: null });
    });
  });

  describe('isInUse', () => {
    const mockCounts = (profiles: number, windows: number) => {
      vi.mocked(supabase.from).mockImplementation(((table: string) => ({
        select: () => ({
          eq: () => Promise.resolve({ count: table === 'profiles' ? profiles : windows, error: null }),
        }),
      })) as any);
    };

    it('is true when an affiliate has the plan', async () => {
      mockCounts(2, 0);
      expect(await repository.isInUse('p')).toBe(true);
    });

    it('is true when only a coverage window froze the plan', async () => {
      mockCounts(0, 1);
      expect(await repository.isInUse('p')).toBe(true);
    });

    it('is false when nothing references the plan', async () => {
      mockCounts(0, 0);
      expect(await repository.isInUse('p')).toBe(false);
    });

    it('throws on query error instead of reporting not-in-use', async () => {
      vi.mocked(supabase.from).mockImplementation((() => ({
        select: () => ({ eq: () => Promise.resolve({ count: null, error: { message: 'boom' } }) }),
      })) as any);
      await expect(repository.isInUse('p')).rejects.toBeTruthy();
    });
  });
});
