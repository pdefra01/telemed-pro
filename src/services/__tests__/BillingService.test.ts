import { describe, it, expect, vi, beforeEach } from 'vitest';
import { billingService } from '../BillingService';
import { affiliateRepository } from '../../repositories/AffiliateRepository';
import { agreementRepository } from '../../repositories/AgreementRepository';
import { invoiceRepository } from '../../repositories/InvoiceRepository';
import { taxRepository } from '../../repositories/TaxRepository';
import { planRepository } from '../../repositories/PlanRepository';

vi.mock('../../repositories/AffiliateRepository', () => ({
  affiliateRepository: {
    getAllAffiliates: vi.fn(),
    getDirectAffiliates: vi.fn(),
    updateAffiliate: vi.fn(),
    updateStatusByAgreement: vi.fn(),
  },
}));

vi.mock('../../repositories/AgreementRepository', () => ({
  agreementRepository: { getAll: vi.fn() },
}));

vi.mock('../../repositories/InvoiceRepository', () => ({
  invoiceRepository: {
    getAll: vi.fn(),
    createBulk: vi.fn(),
    getById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock('../../repositories/TaxRepository', () => ({
  taxRepository: { getAll: vi.fn() },
}));

vi.mock('../../repositories/PlanRepository', () => ({
  planRepository: { getAll: vi.fn() },
}));

describe('BillingService.runMonthlyBillingCycle — direct affiliate plan resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementRepository.getAll).mockResolvedValue([]);
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getAll).mockResolvedValue([]);
    vi.mocked(invoiceRepository.createBulk).mockResolvedValue(undefined as any);
    vi.mocked(taxRepository.getAll).mockResolvedValue([]);
  });

  it('resolves a direct affiliate\'s billing cost by plan_id, not by name-matching plan_name', async () => {
    // The affiliate's cached planName is stale/renamed relative to the real plan's
    // current name — a name-match lookup would fail to find it, but an id-match
    // lookup (via affiliate.planId) must still resolve the correct cost.
    vi.mocked(planRepository.getAll).mockResolvedValue([
      { id: 'plan-1', name: 'Plan Renombrado', monthlyCost: 7000, bonifiedConsultations: 6, isUnlimited: false, maxFamilyMembers: 4 } as any,
    ]);
    vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([
      { id: 'aff-1', planId: 'plan-1', planName: 'Plan Familiar Medinex' } as any,
    ]);

    const result = await billingService.runMonthlyBillingCycle('2026-07');

    expect(result.processedIndividuals).toBe(1);
    expect(result.totalAmount).toBe(7000);
    expect(invoiceRepository.createBulk).toHaveBeenCalledWith([
      expect.objectContaining({ entityId: 'aff-1', netAmount: 7000 }),
    ]);
  });

  it('never fabricates a fallback cost — skips billing an affiliate whose plan_id does not resolve to a real plan', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(planRepository.getAll).mockResolvedValue([
      { id: 'plan-1', name: 'Plan Familiar Medinex', monthlyCost: 50000, bonifiedConsultations: 6, isUnlimited: false, maxFamilyMembers: 4 } as any,
    ]);
    vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([
      { id: 'aff-no-plan', planId: undefined, planName: 'Plan Base' } as any,
    ]);

    const result = await billingService.runMonthlyBillingCycle('2026-07');

    expect(result.processedIndividuals).toBe(0);
    expect(result.totalAmount).toBe(0);
    expect(invoiceRepository.createBulk).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('aff-no-plan'));
  });
});
