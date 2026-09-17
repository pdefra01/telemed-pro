import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pharmacyRepository } from '../PharmacyRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
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

  describe('Stock Adjustments (Audit Trail)', () => {
    const rawAdjustmentRow = {
      id: 'adj-1',
      inventory_id: 'inv-1',
      product_id: 'prod-1',
      batch_number: 'LOT-2026-A',
      user_id: 'user-admin-1',
      reason: 'breakage',
      previous_quantity: '50',
      new_quantity: '42',
      quantity_delta: '-8',
      notes: 'Frascos rotos durante traslado',
      created_at: '2026-09-17T10:00:00.000Z',
    };

    describe('adjustStock()', () => {
      it('invokes adjust_pharmacy_batch_stock RPC and maps response to camelCase PharmacyStockAdjustment', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: rawAdjustmentRow,
          error: null,
        } as any);

        const result = await pharmacyRepository.adjustStock({
          inventoryId: 'inv-1',
          newQuantity: 42,
          reason: 'breakage',
          notes: 'Frascos rotos durante traslado',
          userId: 'user-admin-1',
        });

        expect(supabase.rpc).toHaveBeenCalledWith('adjust_pharmacy_batch_stock', {
          p_inventory_id: 'inv-1',
          p_new_quantity: 42,
          p_reason: 'breakage',
          p_notes: 'Frascos rotos durante traslado',
          p_user_id: 'user-admin-1',
        });

        expect(result).toEqual({
          id: 'adj-1',
          inventoryId: 'inv-1',
          productId: 'prod-1',
          batchNumber: 'LOT-2026-A',
          userId: 'user-admin-1',
          reason: 'breakage',
          previousQuantity: 50,
          newQuantity: 42,
          quantityDelta: -8,
          notes: 'Frascos rotos durante traslado',
          createdAt: '2026-09-17T10:00:00.000Z',
        });
      });

      it('passes null for optional notes and userId when omitted', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: {
            ...rawAdjustmentRow,
            notes: null,
            user_id: null,
          },
          error: null,
        } as any);

        await pharmacyRepository.adjustStock({
          inventoryId: 'inv-1',
          newQuantity: 60,
          reason: 'physical_count',
        });

        expect(supabase.rpc).toHaveBeenCalledWith('adjust_pharmacy_batch_stock', {
          p_inventory_id: 'inv-1',
          p_new_quantity: 60,
          p_reason: 'physical_count',
          p_notes: null,
          p_user_id: null,
        });
      });

      it('throws an error when RPC fails', async () => {
        const rpcError = new Error('Acceso denegado: Solo los administradores pueden realizar ajustes.');
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: null,
          error: rpcError,
        } as any);

        await expect(
          pharmacyRepository.adjustStock({
            inventoryId: 'inv-1',
            newQuantity: 10,
            reason: 'other',
          })
        ).rejects.toThrow(rpcError);
      });
    });

    describe('getStockAdjustments()', () => {
      it('fetches adjustment history ordered by created_at DESC with no filters', async () => {
        const order = vi.fn().mockResolvedValue({
          data: [rawAdjustmentRow],
          error: null,
        });
        const select = vi.fn().mockReturnValue({ order });
        vi.mocked(supabase.from).mockReturnValue({ select } as any);

        const result = await pharmacyRepository.getStockAdjustments();

        expect(supabase.from).toHaveBeenCalledWith('pharmacy_stock_adjustments');
        expect(select).toHaveBeenCalledWith('*');
        expect(order).toHaveBeenCalledWith('created_at', { ascending: false });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: 'adj-1',
          inventoryId: 'inv-1',
          productId: 'prod-1',
          batchNumber: 'LOT-2026-A',
          userId: 'user-admin-1',
          reason: 'breakage',
          previousQuantity: 50,
          newQuantity: 42,
          quantityDelta: -8,
          notes: 'Frascos rotos durante traslado',
          createdAt: '2026-09-17T10:00:00.000Z',
        });
      });

      it('applies inventoryId filter when provided', async () => {
        const queryChain: any = {
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn(),
        };
        // Mock query resolution
        const order = vi.fn().mockImplementation(() => queryChain);
        const select = vi.fn().mockReturnValue({ order });
        queryChain.eq = vi.fn().mockResolvedValue({
          data: [rawAdjustmentRow],
          error: null,
        });

        vi.mocked(supabase.from).mockReturnValue({ select } as any);

        const result = await pharmacyRepository.getStockAdjustments({ inventoryId: 'inv-1' });

        expect(queryChain.eq).toHaveBeenCalledWith('inventory_id', 'inv-1');
        expect(result).toHaveLength(1);
        expect(result[0].inventoryId).toBe('inv-1');
      });

      it('applies productId filter when provided', async () => {
        const queryChain: any = {
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        const order = vi.fn().mockImplementation(() => queryChain);
        const select = vi.fn().mockReturnValue({ order });
        queryChain.eq = vi.fn().mockResolvedValue({
          data: [rawAdjustmentRow],
          error: null,
        });

        vi.mocked(supabase.from).mockReturnValue({ select } as any);

        const result = await pharmacyRepository.getStockAdjustments({ productId: 'prod-1' });

        expect(queryChain.eq).toHaveBeenCalledWith('product_id', 'prod-1');
        expect(result).toHaveLength(1);
        expect(result[0].productId).toBe('prod-1');
      });

      it('propagates error when query fails', async () => {
        const queryError = new Error('Database connection failed');
        const order = vi.fn().mockResolvedValue({
          data: null,
          error: queryError,
        });
        const select = vi.fn().mockReturnValue({ order });
        vi.mocked(supabase.from).mockReturnValue({ select } as any);

        await expect(pharmacyRepository.getStockAdjustments()).rejects.toThrow(queryError);
      });
    });
  });
});
