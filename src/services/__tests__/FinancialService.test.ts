import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinancialService } from '../FinancialService';
import { invoiceRepository } from '../../repositories/InvoiceRepository';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { operatingExpenseRepository } from '../../repositories/OperatingExpenseRepository';

vi.mock('../../repositories/InvoiceRepository', () => ({
  invoiceRepository: { getPaidByPeriod: vi.fn() },
}));

vi.mock('../../repositories/AppointmentRepository', () => ({
  appointmentRepository: { getCompletedConsultationFeesByPeriod: vi.fn() },
}));

vi.mock('../../repositories/OperatingExpenseRepository', () => ({
  operatingExpenseRepository: {
    getByPeriod: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('FinancialService', () => {
  const financialService = new FinancialService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPLSummary - Mathematical Accuracy', () => {
    it('correctly sums revenues and expenses and calculates profit and margins', async () => {
      vi.mocked(invoiceRepository.getPaidByPeriod).mockResolvedValue([
        { id: '1', period: '2026-07', entityType: 'agreement', entityId: 'agr-1', netAmount: 1000000, taxAmount: 0, totalAmount: 1000000, status: 'paid', createdAt: '2026-07-01T00:00:00.000Z' } as any,
        { id: '2', period: '2026-07', entityType: 'affiliate', entityId: 'aff-1', netAmount: 500000, taxAmount: 0, totalAmount: 500000, status: 'paid', createdAt: '2026-07-01T00:00:00.000Z' } as any,
      ]);
      vi.mocked(operatingExpenseRepository.getByPeriod).mockResolvedValue([
        { id: 'exp-1', period: '2026-07', category: 'administrative', amount: 450000, description: 'Alquiler oficinas', createdAt: '2026-07-06T00:00:00.000Z' },
      ]);
      // Appt 1 tiene honorario configurado ($2000); Appt 2 no tiene (null -> usa el fallback de $1500)
      vi.mocked(appointmentRepository.getCompletedConsultationFeesByPeriod).mockResolvedValue([2000, null]);

      const summary = await financialService.getPLSummary('2026-07');

      // Ingresos: 1.000.000 (B2B) + 500.000 (B2C) = 1.500.000
      expect(summary.totalRevenue).toBe(1500000);
      expect(summary.breakdown.revenue.b2b).toBe(1000000);
      expect(summary.breakdown.revenue.b2c).toBe(500000);

      // Egresos: 450.000 (Alquiler) + 2000 (Appt 1) + 1500 (Appt 2 fallback) = 453.500
      expect(summary.totalExpenses).toBe(453500);
      expect(summary.breakdown.expenses.administrative).toBe(450000);
      expect(summary.breakdown.expenses.medicalFees).toBe(3500);

      // Ganancia: 1.500.000 - 453.500 = 1.046.500
      expect(summary.netProfit).toBe(1046500);

      // Margen: (1.046.500 / 1.500.000) * 100 ≈ 69.77%
      expect(summary.netMargin).toBeCloseTo(69.766, 1);
    });

    it('counts an explicit $0 consultation fee as 0, not the fallback, while still applying the fallback to entries with no fee configured (null)', async () => {
      vi.mocked(invoiceRepository.getPaidByPeriod).mockResolvedValue([]);
      vi.mocked(operatingExpenseRepository.getByPeriod).mockResolvedValue([]);
      // Appt 1 has an explicit $0 fee; Appt 2 has no fee configured (null -> fallback $1500); Appt 3 has $2000.
      vi.mocked(appointmentRepository.getCompletedConsultationFeesByPeriod).mockResolvedValue([0, null, 2000]);

      const summary = await financialService.getPLSummary('2026-07');

      // Egresos por honorarios: 0 (Appt 1) + 1500 (Appt 2 fallback) + 2000 (Appt 3) = 3500
      expect(summary.breakdown.expenses.medicalFees).toBe(3500);
    });

    it('returns a zero margin (not NaN/Infinity) when there is no revenue for the period', async () => {
      vi.mocked(invoiceRepository.getPaidByPeriod).mockResolvedValue([]);
      vi.mocked(operatingExpenseRepository.getByPeriod).mockResolvedValue([
        { id: 'exp-1', period: '2026-07', category: 'other', amount: 1000, description: 'Gasto varios', createdAt: '2026-07-06T00:00:00.000Z' },
      ]);
      vi.mocked(appointmentRepository.getCompletedConsultationFeesByPeriod).mockResolvedValue([]);

      const summary = await financialService.getPLSummary('2026-07');

      expect(summary.totalRevenue).toBe(0);
      expect(summary.netMargin).toBe(0);
      expect(summary.breakdown.expenses.other).toBe(1000);
    });
  });

  describe('expense CRUD delegation', () => {
    it('saveExpense() delegates to operatingExpenseRepository.create', async () => {
      const created: import('../../types').OperatingExpense = {
        id: 'exp-1', period: '2026-07', category: 'marketing', amount: 5000, description: 'Ads', createdAt: '2026-07-06T00:00:00.000Z',
      };
      vi.mocked(operatingExpenseRepository.create).mockResolvedValue(created);

      const result = await financialService.saveExpense({ period: '2026-07', category: 'marketing', amount: 5000, description: 'Ads' });

      expect(operatingExpenseRepository.create).toHaveBeenCalledWith({ period: '2026-07', category: 'marketing', amount: 5000, description: 'Ads' });
      expect(result).toEqual(created);
    });

    it('getExpensesByPeriod() delegates to operatingExpenseRepository.getByPeriod', async () => {
      vi.mocked(operatingExpenseRepository.getByPeriod).mockResolvedValue([]);

      await financialService.getExpensesByPeriod('2026-07');

      expect(operatingExpenseRepository.getByPeriod).toHaveBeenCalledWith('2026-07');
    });

    it('deleteExpense() delegates to operatingExpenseRepository.delete', async () => {
      vi.mocked(operatingExpenseRepository.delete).mockResolvedValue(undefined);

      await financialService.deleteExpense('exp-1');

      expect(operatingExpenseRepository.delete).toHaveBeenCalledWith('exp-1');
    });
  });
});
