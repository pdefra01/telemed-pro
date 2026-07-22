import { describe, it, expect, vi } from 'vitest';
import { FinancialService } from '../FinancialService';

// Mock Supabase client
vi.mock('../supabase', () => {
  return {
    supabase: {
      from: vi.fn((table) => {
        return {
          select: vi.fn(() => {
            const chain: any = {};
            
            chain.eq = vi.fn((col, val) => {
              if (table === 'invoices') {
                const subChain: any = {};
                subChain.eq = vi.fn(() => Promise.resolve({
                  data: [
                    { id: '1', period: '2026-07', entity_type: 'agreement', total_amount: 1000000, status: 'paid' },
                    { id: '2', period: '2026-07', entity_type: 'affiliate', total_amount: 500000, status: 'paid' }
                  ],
                  error: null
                }));
                return subChain;
              }
              if (table === 'operating_expenses') {
                return Promise.resolve({
                  data: [
                    { id: '1', period: '2026-07', category: 'administrative', amount: 450000, description: 'Alquiler oficinas', created_at: '2026-07-06T00:00:00Z' }
                  ],
                  error: null
                });
              }
              if (table === 'appointments') {
                const apptSubChain1: any = {};
                apptSubChain1.gte = vi.fn(() => {
                  const apptSubChain2: any = {};
                  apptSubChain2.lte = vi.fn(() => Promise.resolve({
                    data: [
                      { id: 'appt1', doctor_id: 'doc1', status: 'completed', doctor: { consultation_fee: 2000 } },
                      { id: 'appt2', doctor_id: 'doc2', status: 'completed', doctor: null }
                    ],
                    error: null
                  }));
                  return apptSubChain2;
                });
                return apptSubChain1;
              }
              return Promise.resolve({ data: [], error: null });
            });

            return chain;
          }),
          insert: vi.fn((data) => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { id: 'new-id', ...data[0], created_at: '2026-07-06T12:00:00Z' },
                error: null
              }))
            }))
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null }))
          }))
        };
      })
    }
  };
});

describe('FinancialService - Mathematical Accuracy', () => {
  const financialService = new FinancialService();

  it('should correctly sum revenues and expenses and calculate profit and margins', async () => {
    const summary = await financialService.getPLSummary('2026-07');

    // Revenues: 1.000.000 (B2B) + 500.000 (B2C) = 1.500.000
    expect(summary.totalRevenue).toBe(1500000);
    expect(summary.breakdown.revenue.b2b).toBe(1000000);
    expect(summary.breakdown.revenue.b2c).toBe(500000);

    // Expenses: 450.000 (Alquiler) + 2000 (Appt 1 fee) + 1500 (Appt 2 fallback fee) = 453.500
    expect(summary.totalExpenses).toBe(453500);
    expect(summary.breakdown.expenses.administrative).toBe(450000);
    expect(summary.breakdown.expenses.medicalFees).toBe(3500);

    // Profit: 1.500.000 - 453.500 = 1.046.500
    expect(summary.netProfit).toBe(1046500);

    // Margin: (1.046.500 / 1.500.000) * 100 = 69.76%
    expect(summary.netMargin).toBeCloseTo(69.766, 1);
  });
});
