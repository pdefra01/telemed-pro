import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pharmacyOrderRepository } from '../PharmacyOrderRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe('PharmacyOrderRepository.createOrder (atomic server-side RPC)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const rawOrderRow = {
    id: 'order-1',
    patient_id: 'patient-1',
    prescription_id: null,
    status: 'paid',
    subtotal: '1000.00',
    coverage_discount: '0.00',
    total: '1000.00',
    delivery_address: 'Av. Siempreviva 742',
    created_at: '2026-09-13T00:00:00.000Z',
    items: [],
  };

  it('calls the atomic create_pharmacy_order RPC with server-recomputed item shape (product_id/quantity only), never trusting client subtotal/total/price', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'order-1', error: null } as any);

    const maybeSingle = vi.fn().mockResolvedValue({ data: rawOrderRow, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as any);

    await pharmacyOrderRepository.createOrder({
      patientId: 'patient-1',
      prescriptionId: 'rx-1',
      deliveryAddress: '  Av. Siempreviva 742  ',
      items: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1 },
      ],
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_pharmacy_order', {
      p_patient_id: 'patient-1',
      p_items: [
        { product_id: 'prod-1', quantity: 2 },
        { product_id: 'prod-2', quantity: 1 },
      ],
      p_prescription_id: 'rx-1',
      p_delivery_address: 'Av. Siempreviva 742',
    });

    // Proves the old client-computed subtotal/coverageDiscount/total/unitPrice fields,
    // as well as any discount-rate override, are never part of the RPC call payload
    // (the server recomputes amounts and hardcodes the discount rate itself — a
    // client-supplied discount rate can no longer influence the order total).
    const rpcArgs = vi.mocked(supabase.rpc).mock.calls[0][1] as any;
    expect(rpcArgs.subtotal).toBeUndefined();
    expect(rpcArgs.total).toBeUndefined();
    expect(rpcArgs.coverage_discount).toBeUndefined();
    expect(rpcArgs.p_discount_rate).toBeUndefined();
    expect(Object.keys(rpcArgs)).not.toContain('p_discount_rate');
  });

  it('returns the persisted order fetched by id after a successful RPC call', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'order-1', error: null } as any);

    const maybeSingle = vi.fn().mockResolvedValue({ data: rawOrderRow, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as any);

    const result = await pharmacyOrderRepository.createOrder({
      patientId: 'patient-1',
      deliveryAddress: 'Av. Siempreviva 742',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    expect(result.id).toBe('order-1');
    expect(result.status).toBe('paid');
    expect(result.total).toBe(1000);
  });

  it('throws and never reports success when the RPC returns an error (e.g. insufficient stock) — no partial/orphaned order', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'Stock insuficiente para el producto prod-1.' },
    } as any);

    await expect(
      pharmacyOrderRepository.createOrder({
        patientId: 'patient-1',
        deliveryAddress: 'Av. Siempreviva 742',
        items: [{ productId: 'prod-1', quantity: 99 }],
      })
    ).rejects.toBeTruthy();

    // Never falls back to reading/creating anything else after an RPC error.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws when the RPC reports no error but also returns no order id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);

    await expect(
      pharmacyOrderRepository.createOrder({
        patientId: 'patient-1',
        deliveryAddress: 'Av. Siempreviva 742',
        items: [{ productId: 'prod-1', quantity: 1 }],
      })
    ).rejects.toBeTruthy();
  });
});
