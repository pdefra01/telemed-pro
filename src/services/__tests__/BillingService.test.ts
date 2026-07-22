import { describe, it, expect, vi, beforeEach } from 'vitest';
import { billingService } from '../BillingService';
import { affiliateRepository } from '../../repositories/AffiliateRepository';
import { agreementRepository } from '../../repositories/AgreementRepository';
import { invoiceRepository } from '../../repositories/InvoiceRepository';
import { taxRepository } from '../../repositories/TaxRepository';
import { planRepository } from '../../repositories/PlanRepository';
import { accountMovementRepository } from '../../repositories/AccountMovementRepository';

vi.mock('../../repositories/AffiliateRepository', () => ({
  affiliateRepository: {
    getAllAffiliates: vi.fn(),
    getDirectAffiliates: vi.fn(),
    updateAffiliate: vi.fn(),
    updateStatusByAgreement: vi.fn(),
    getCoverageWindowsForBilling: vi.fn(),
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

vi.mock('../../repositories/AccountMovementRepository', () => ({
  accountMovementRepository: {
    postBillingCharge: vi.fn(),
    postPaymentMovement: vi.fn(),
  },
}));

describe('BillingService.runMonthlyBillingCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementRepository.getAll).mockResolvedValue([]);
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([]);
    vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([]);
    vi.mocked(affiliateRepository.getCoverageWindowsForBilling).mockResolvedValue(new Map());
    vi.mocked(invoiceRepository.getAll).mockResolvedValue([]);
    vi.mocked(invoiceRepository.createBulk).mockResolvedValue(undefined as any);
    vi.mocked(taxRepository.getAll).mockResolvedValue([]);
    vi.mocked(planRepository.getAll).mockResolvedValue([]);
    vi.mocked(accountMovementRepository.postBillingCharge).mockResolvedValue({} as any);
  });

  describe('direct affiliate plan validity (legacy safety net, preserved)', () => {
    it('never fabricates a fallback cost — skips billing an affiliate whose plan_id does not resolve to a real plan', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(planRepository.getAll).mockResolvedValue([
        { id: 'plan-1', name: 'Plan Familiar Medinex', monthlyCost: 50000, bonifiedConsultations: 6, isUnlimited: false, maxFamilyMembers: 4 } as any,
      ]);
      vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([
        { id: 'aff-no-plan', name: 'Sin Plan', planId: undefined, planName: 'Plan Base' } as any,
      ]);

      const result = await billingService.runMonthlyBillingCycle('2026-07');

      expect(result.processedIndividuals).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(accountMovementRepository.postBillingCharge).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('aff-no-plan'));
    });
  });

  describe('bonus-month-aware charge scheduling (D6/D9 — reads the FROZEN window snapshot, never the live plan)', () => {
    it('posts a charge for the snapshot monthly cost during a paid month, via post_billing_charge', async () => {
      vi.mocked(planRepository.getAll).mockResolvedValue([{ id: 'plan-1', monthlyCost: 999999 } as any]); // decoy: live plan cost must be ignored
      vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([{ id: 'aff-1', name: 'Ana', planId: 'plan-1' } as any]);
      vi.mocked(affiliateRepository.getCoverageWindowsForBilling).mockResolvedValue(new Map([
        ['aff-1', { periodStart: '2026-07-01T00:00:00.000Z', paidMonthsSnapshot: 12, bonusMonthsSnapshot: 2, monthlyCostSnapshot: 15000 }],
      ]));

      const result = await billingService.runMonthlyBillingCycle('2026-07');

      expect(accountMovementRepository.postBillingCharge).toHaveBeenCalledWith({
        entityId: 'aff-1',
        period: '2026-07',
        amount: 15000,
        externalRef: 'charge:affiliate:aff-1:2026-07',
      });
      expect(result.processedIndividuals).toBe(1);
      expect(result.totalAmount).toBe(15000);
      expect(result.skippedNoWindow).toEqual([]);
    });

    it('posts a $0 charge during a bonus month (still emits the compliance invoice, via post_billing_charge)', async () => {
      vi.mocked(planRepository.getAll).mockResolvedValue([{ id: 'plan-1', monthlyCost: 15000 } as any]);
      vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([{ id: 'aff-1', name: 'Ana', planId: 'plan-1' } as any]);
      // periodStart 2026-01, billed period 2026-07 -> elapsed=6, paid=6 -> in the bonus range [6,8)
      vi.mocked(affiliateRepository.getCoverageWindowsForBilling).mockResolvedValue(new Map([
        ['aff-1', { periodStart: '2026-01-01T00:00:00.000Z', paidMonthsSnapshot: 6, bonusMonthsSnapshot: 2, monthlyCostSnapshot: 15000 }],
      ]));

      const result = await billingService.runMonthlyBillingCycle('2026-07');

      expect(accountMovementRepository.postBillingCharge).toHaveBeenCalledWith({
        entityId: 'aff-1',
        period: '2026-07',
        amount: 0,
        externalRef: 'charge:affiliate:aff-1:2026-07',
      });
      expect(result.totalAmount).toBe(0);
      expect(result.processedIndividuals).toBe(1);
    });

    it('never bills an expired window — skips without posting a charge or listing it under skippedNoWindow', async () => {
      vi.mocked(planRepository.getAll).mockResolvedValue([{ id: 'plan-1', monthlyCost: 15000 } as any]);
      vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([{ id: 'aff-1', name: 'Ana', planId: 'plan-1' } as any]);
      vi.mocked(affiliateRepository.getCoverageWindowsForBilling).mockResolvedValue(new Map([
        ['aff-1', { periodStart: '2020-01-01T00:00:00.000Z', paidMonthsSnapshot: 1, bonusMonthsSnapshot: 0, monthlyCostSnapshot: 15000 }],
      ]));

      const result = await billingService.runMonthlyBillingCycle('2026-07');

      expect(accountMovementRepository.postBillingCharge).not.toHaveBeenCalled();
      expect(result.processedIndividuals).toBe(0);
      expect(result.skippedNoWindow).toEqual([]);
    });

    it('is not blocked by the app-layer "already invoiced" pre-filter — idempotency for affiliates now lives in the DB (D5b, self-heals on re-run)', async () => {
      vi.mocked(planRepository.getAll).mockResolvedValue([{ id: 'plan-1', monthlyCost: 15000 } as any]);
      vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([{ id: 'aff-1', name: 'Ana', planId: 'plan-1' } as any]);
      vi.mocked(affiliateRepository.getCoverageWindowsForBilling).mockResolvedValue(new Map([
        ['aff-1', { periodStart: '2026-07-01T00:00:00.000Z', paidMonthsSnapshot: 12, bonusMonthsSnapshot: 2, monthlyCostSnapshot: 15000 }],
      ]));
      // An invoice already exists for this affiliate/period — under the OLD
      // code this would have suppressed billing entirely for them.
      vi.mocked(invoiceRepository.getAll).mockResolvedValue([
        { id: 'inv-existing', entityType: 'affiliate', entityId: 'aff-1', period: '2026-07' } as any,
      ]);

      await billingService.runMonthlyBillingCycle('2026-07');

      expect(accountMovementRepository.postBillingCharge).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'aff-1' })
      );
    });
  });

  describe('no-coverage-window affiliates (spec: Affiliate With No Coverage Window Is Skipped And Surfaced)', () => {
    it('skips an affiliate with a valid plan but no window and surfaces them in skippedNoWindow, without fabricating a charge', async () => {
      vi.mocked(planRepository.getAll).mockResolvedValue([{ id: 'plan-1', monthlyCost: 15000 } as any]);
      vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([{ id: 'aff-1', name: 'Sin Ventana', planId: 'plan-1' } as any]);
      vi.mocked(affiliateRepository.getCoverageWindowsForBilling).mockResolvedValue(new Map());

      const result = await billingService.runMonthlyBillingCycle('2026-07');

      expect(accountMovementRepository.postBillingCharge).not.toHaveBeenCalled();
      expect(result.skippedNoWindow).toEqual([{ id: 'aff-1', name: 'Sin Ventana' }]);
      expect(result.processedIndividuals).toBe(0);
    });
  });

  describe('agreement path (legacy, untouched — Scope Boundary)', () => {
    it('still bills agreements through calculateAgreementTotal + createBulk, and never routes them through post_billing_charge', async () => {
      vi.mocked(agreementRepository.getAll).mockResolvedValue([{ id: 'agr-1', status: 'active', baseCostPerAffiliate: 5000 } as any]);
      vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([
        { id: 'aff-a', agreementId: 'agr-1' } as any,
        { id: 'aff-b', agreementId: 'agr-1' } as any,
      ]);

      const result = await billingService.runMonthlyBillingCycle('2026-07');

      expect(result.processedAgreements).toBe(1);
      expect(invoiceRepository.createBulk).toHaveBeenCalledWith([
        expect.objectContaining({ entityId: 'agr-1', entityType: 'agreement', netAmount: 10000 }),
      ]);
      expect(accountMovementRepository.postBillingCharge).not.toHaveBeenCalled();
    });

    it('does not double-push affiliate invoices into createBulk (R3 #6) — affiliate invoices come exclusively from post_billing_charge', async () => {
      vi.mocked(planRepository.getAll).mockResolvedValue([{ id: 'plan-1', monthlyCost: 15000 } as any]);
      vi.mocked(affiliateRepository.getDirectAffiliates).mockResolvedValue([{ id: 'aff-1', name: 'Ana', planId: 'plan-1' } as any]);
      vi.mocked(affiliateRepository.getCoverageWindowsForBilling).mockResolvedValue(new Map([
        ['aff-1', { periodStart: '2026-07-01T00:00:00.000Z', paidMonthsSnapshot: 12, bonusMonthsSnapshot: 2, monthlyCostSnapshot: 15000 }],
      ]));

      await billingService.runMonthlyBillingCycle('2026-07');

      // No agreements this run -> createBulk must never be called at all,
      // proving the affiliate charge did NOT also flow through createBulk.
      expect(invoiceRepository.createBulk).not.toHaveBeenCalled();
    });
  });
});

describe('BillingService.reconcileInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiliate invoices: posts a payment movement via post_payment_movement (atomic — replaces the old two-write path)', async () => {
    vi.mocked(invoiceRepository.getById).mockResolvedValue({ id: 'inv-1', entityType: 'affiliate', entityId: 'aff-1', totalAmount: 15000 } as any);
    vi.mocked(accountMovementRepository.postPaymentMovement).mockResolvedValue({} as any);

    await billingService.reconcileInvoice('inv-1');

    expect(accountMovementRepository.postPaymentMovement).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      entityId: 'aff-1',
      amount: 15000,
      externalRef: 'payment:manual:inv-1',
    });
    expect(invoiceRepository.updateStatus).not.toHaveBeenCalled();
    expect(affiliateRepository.updateAffiliate).not.toHaveBeenCalled();
  });

  it('agreement invoices: keeps the OLD unmodified path (status flip + updateStatusByAgreement), never posts a ledger movement', async () => {
    vi.mocked(invoiceRepository.getById).mockResolvedValue({ id: 'inv-2', entityType: 'agreement', entityId: 'agr-1', totalAmount: 30000 } as any);

    await billingService.reconcileInvoice('inv-2');

    expect(invoiceRepository.updateStatus).toHaveBeenCalledWith('inv-2', 'paid');
    expect(affiliateRepository.updateStatusByAgreement).toHaveBeenCalledWith('agr-1', 'active');
    expect(accountMovementRepository.postPaymentMovement).not.toHaveBeenCalled();
  });

  it('throws when the invoice is not found', async () => {
    vi.mocked(invoiceRepository.getById).mockResolvedValue(null);

    await expect(billingService.reconcileInvoice('missing')).rejects.toThrow('Factura no encontrada');
  });
});
