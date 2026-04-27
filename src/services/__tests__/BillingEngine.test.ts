import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingEngine } from '../BillingEngine';
import { TaxConfiguration } from '../../types';

// Mock de Supabase
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
    }))
  }
}));

describe('BillingEngine', () => {
  let billingEngine: BillingEngine;

  const mockTaxes: TaxConfiguration[] = [
    { id: '1', name: 'IVA', rate: 21.0, scope: 'national', isActive: true },
    { id: '2', name: 'IIBB', rate: 3.5, scope: 'local', isActive: true }
  ];

  beforeEach(() => {
    billingEngine = new BillingEngine();
    vi.clearAllMocks();
  });

  describe('calculateTaxes', () => {
    it('should calculate correct tax amount for a given net amount', () => {
      const netAmount = 1000;
      // 21% IVA (210) + 3.5% IIBB (35) = 245
      const result = billingEngine.calculateTaxes(netAmount, mockTaxes);
      
      expect(result.totalTax).toBe(245);
      expect(result.details).toHaveLength(2);
      expect(result.details[0].amount).toBe(210);
      expect(result.details[1].amount).toBe(35);
    });

    it('should return zero tax if no active taxes are provided', () => {
      const result = billingEngine.calculateTaxes(1000, []);
      expect(result.totalTax).toBe(0);
      expect(result.details).toHaveLength(0);
    });
  });

  describe('generateInvoiceData', () => {
    it('should create a complete invoice object with net, tax and total', () => {
      const netAmount = 5000;
      const invoice = billingEngine.generateInvoiceData(
        'affiliate-1',
        'affiliate',
        '2024-05',
        netAmount,
        mockTaxes
      );

      expect(invoice.netAmount).toBe(5000);
      expect(invoice.taxAmount).toBe(1225); // 24.5% of 5000
      expect(invoice.totalAmount).toBe(6225);
      expect(invoice.entityId).toBe('affiliate-1');
      expect(invoice.period).toBe('2024-05');
    });
  });
});
