import { describe, it, expect } from 'vitest';
import { billingEngine } from '../BillingEngine';
import { TaxConfiguration } from '../../types';

describe('BillingEngine - Tax Accuracy', () => {
  const mockTaxes: TaxConfiguration[] = [
    { id: '1', name: 'IVA 21%', rate: 21, isActive: true, scope: 'national' },
    { id: '2', name: 'IIBB 3.5%', rate: 3.5, isActive: true, scope: 'local' },
    { id: '3', name: 'Inactive Tax', rate: 10, isActive: false, scope: 'national' }
  ];

  it('should calculate taxes correctly for a simple integer amount', () => {
    const netAmount = 1000;
    const result = billingEngine.calculateTaxes(netAmount, mockTaxes);

    // IVA: 210, IIBB: 35
    expect(result.totalTax).toBe(245);
    expect(result.details).toHaveLength(2);
    expect(result.details[0].amount).toBe(210);
    expect(result.details[1].amount).toBe(35);
  });

  it('should handle complex decimals with 2-decimal rounding precision', () => {
    const netAmount = 1542.87;
    const result = billingEngine.calculateTaxes(netAmount, mockTaxes);

    // IVA 21%: 1542.87 * 0.21 = 324.0027 -> 324.00
    // IIBB 3.5%: 1542.87 * 0.035 = 54.00045 -> 54.00
    // Total Tax: 378.00
    
    expect(result.details[0].amount).toBe(324);
    expect(result.details[1].amount).toBe(54);
    expect(result.totalTax).toBe(378);
  });

  it('should generate full invoice data correctly', () => {
    const netAmount = 2000;
    const invoiceData = billingEngine.generateInvoiceData(
      'ent-123',
      'agreement',
      '2026-04',
      netAmount,
      mockTaxes
    );

    expect(invoiceData.netAmount).toBe(2000);
    expect(invoiceData.taxAmount).toBe(490); // (21% + 3.5%) * 2000 = 420 + 70 = 490
    expect(invoiceData.totalAmount).toBe(2490);
    expect(invoiceData.status).toBe('issued');
  });
});
