import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pharmacyRepository } from '../PharmacyRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('PharmacyRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('purchase_price <-> purchasePrice mapping', () => {
    const rawRow = {
      id: 'prod-1',
      name: 'Amoxicilina 500',
      active_ingredient: 'Amoxicilina',
      presentation: '16 comprimidos',
      laboratory: 'Roemmers',
      price: '1500.00',
      purchase_price: '900.00',
      requires_prescription: false,
      category: 'farmacia',
      image_url: null,
      min_stock_threshold: 20,
      reorder_quantity: 100,
    };

    it('getProducts() maps purchase_price to purchasePrice', async () => {
      const order = vi.fn().mockResolvedValue({ data: [rawRow], error: null });
      const select = vi.fn().mockReturnValue({ order });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const [result] = await pharmacyRepository.getProducts();

      expect(result.purchasePrice).toBe(900);
    });

    it('getProductById() maps purchase_price to purchasePrice', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: rawRow, error: null });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await pharmacyRepository.getProductById('prod-1');

      expect(result?.purchasePrice).toBe(900);
    });

    it('createProduct() sends purchase_price to Supabase', async () => {
      const single = vi.fn().mockResolvedValue({ data: rawRow, error: null });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });
      vi.mocked(supabase.from).mockReturnValue({ insert } as any);

      await pharmacyRepository.createProduct({
        name: 'Amoxicilina 500',
        activeIngredient: 'Amoxicilina',
        presentation: '16 comprimidos',
        laboratory: 'Roemmers',
        price: 1500,
        purchasePrice: 900,
        requiresPrescription: false,
        category: 'farmacia',
      });

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ purchase_price: 900 })
      );
    });

    it('createProduct() sends purchase_price null when omitted', async () => {
      const single = vi.fn().mockResolvedValue({ data: rawRow, error: null });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });
      vi.mocked(supabase.from).mockReturnValue({ insert } as any);

      await pharmacyRepository.createProduct({
        name: 'Amoxicilina 500',
        activeIngredient: 'Amoxicilina',
        presentation: '16 comprimidos',
        laboratory: 'Roemmers',
        price: 1500,
        requiresPrescription: false,
        category: 'farmacia',
      });

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ purchase_price: null })
      );
    });

    it('updateProduct() includes purchase_price in the payload when provided', async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ update } as any);

      await pharmacyRepository.updateProduct('prod-1', { purchasePrice: 900 });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ purchase_price: 900 })
      );
    });

    it('updateProduct() omits purchase_price from the payload when not provided', async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ update } as any);

      await pharmacyRepository.updateProduct('prod-1', { name: 'Nuevo nombre' });

      const payload = update.mock.calls[0][0];
      expect(payload).not.toHaveProperty('purchase_price');
    });
  });
});
