import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoiceRepository } from '../InvoiceRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('InvoiceRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('orders getAll() results by the real DB column created_at, not the camelCase createdAt', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn().mockReturnValue({ order });
    vi.mocked(supabase.from).mockReturnValue({ select } as any);

    await invoiceRepository.getAll();

    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('orders getByEntity() results by created_at as well', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq2 = vi.fn().mockReturnValue({ order });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    vi.mocked(supabase.from).mockReturnValue({ select } as any);

    await invoiceRepository.getByEntity('affiliate', 'aff-1');

    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  describe('row <-> Invoice mapping', () => {
    const rawRow = {
      id: 'inv-1',
      entity_type: 'affiliate',
      entity_id: 'aff-1',
      period: '2026-08',
      net_amount: '1000.00', // Postgres numeric comes back as a string over PostgREST
      tax_amount: '210.00',
      total_amount: '1210.00',
      tax_details: [{ name: 'IVA', rate: 21, amount: 210 }],
      status: 'issued',
      pdf_url: null,
      created_at: '2026-08-01T00:00:00.000Z',
    };

    it('getById() maps the raw snake_case row to a real camelCase Invoice (proves entityType/totalAmount are no longer undefined)', async () => {
      const single = vi.fn().mockResolvedValue({ data: rawRow, error: null });
      const eq = vi.fn().mockReturnValue({ single });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await invoiceRepository.getById('inv-1');

      expect(result).toEqual({
        id: 'inv-1',
        entityType: 'affiliate',
        entityId: 'aff-1',
        period: '2026-08',
        netAmount: 1000,
        taxAmount: 210,
        totalAmount: 1210,
        taxDetails: [{ name: 'IVA', rate: 21, amount: 210 }],
        status: 'issued',
        pdfUrl: undefined,
        createdAt: '2026-08-01T00:00:00.000Z',
      });
    });

    it('getAll() maps every row in the list', async () => {
      const order = vi.fn().mockResolvedValue({ data: [rawRow], error: null });
      const select = vi.fn().mockReturnValue({ order });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const [result] = await invoiceRepository.getAll();

      expect(result.entityType).toBe('affiliate');
      expect(result.totalAmount).toBe(1210);
    });

    it('createBulk() writes snake_case columns, not the camelCase Invoice shape, to Supabase', async () => {
      const select = vi.fn().mockResolvedValue({ data: [rawRow], error: null });
      const insert = vi.fn().mockReturnValue({ select });
      vi.mocked(supabase.from).mockReturnValue({ insert } as any);

      await invoiceRepository.createBulk([
        { entityId: 'aff-1', entityType: 'affiliate', period: '2026-08', netAmount: 1000, taxAmount: 210, totalAmount: 1210, status: 'issued' },
      ]);

      expect(insert).toHaveBeenCalledWith([
        expect.objectContaining({
          entity_id: 'aff-1',
          entity_type: 'affiliate',
          period: '2026-08',
          net_amount: 1000,
          tax_amount: 210,
          total_amount: 1210,
          status: 'issued',
        }),
      ]);
      // Never the camelCase keys — PostgREST rejects unknown columns.
      const insertedRow = insert.mock.calls[0][0][0];
      expect(insertedRow.entityId).toBeUndefined();
      expect(insertedRow.totalAmount).toBeUndefined();
    });
  });
});
