import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PharmacyCatalog } from '../PharmacyCatalog';
import { pharmacyRepository } from '../../../repositories/PharmacyRepository';
import { pharmacyOrderRepository } from '../../../repositories/PharmacyOrderRepository';
import { prescriptionRepository } from '../../../repositories/PrescriptionRepository';

vi.mock('../../../repositories/PharmacyRepository', () => ({
  pharmacyRepository: {
    getProducts: vi.fn(),
  },
}));

vi.mock('../../../repositories/PharmacyOrderRepository', () => ({
  pharmacyOrderRepository: {
    createOrder: vi.fn(),
  },
}));

vi.mock('../../../repositories/PrescriptionRepository', () => ({
  prescriptionRepository: {
    getPrescriptionsByPatientId: vi.fn(),
  },
}));

const REAL_PRODUCT = {
  id: 'prod-real-1',
  name: 'Ibuprofeno 400mg',
  activeIngredient: 'Ibuprofeno',
  presentation: 'Caja x 10',
  laboratory: 'Lab MEDINEX',
  price: 1500,
  requiresPrescription: false,
  category: 'venta_libre',
};

function makePrescription(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'rx-1',
    patientId: 'patient-1',
    doctorId: 'doc-1',
    doctorName: 'Pérez',
    medications: [
      { name: 'Ibuprofeno 400mg', instructions: 'Cada 8hs', quantity: 2 },
      { name: 'Rivotril 2mg', instructions: 'Cada 12hs', quantity: 1 },
    ],
    date: '2026-09-01',
    status: 'active' as const,
    digitalSignature: 'sig',
    expirationDate: '2026-10-01',
    ...overrides,
  };
}

describe('PharmacyCatalog — prescription dispensing never fabricates synthetic products (F4)', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(pharmacyRepository.getProducts).mockResolvedValue([REAL_PRODUCT] as any);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('does not add a synthetic non-catalog item to the cart when a prescribed medication has no catalog match, and warns the patient by name', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([makePrescription()] as any);

    render(<PharmacyCatalog patientId="patient-1" />);

    const dispenseButton = await screen.findByText(/Comprar Medicamentos de la Receta/i);
    fireEvent.click(dispenseButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Rivotril 2mg'));
    });

    // The matched real product is in the cart summary (as a cart line item h4)...
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 4, name: 'Ibuprofeno 400mg' })).toBeDefined();
    });
    // ...but the unmatched medication never appears as a cart line item.
    expect(screen.queryByRole('heading', { level: 4, name: 'Rivotril 2mg' })).toBeNull();

    // Inline notice surfaces the unmatched medication name too (also still listed
    // read-only in the prescription card above, hence at least one match).
    expect(screen.getAllByText(/Rivotril 2mg/).length).toBeGreaterThan(0);
  });

  it('never sends a synthetic rx-prod- id to createOrder — only real catalog product ids reach checkout', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([makePrescription()] as any);
    vi.mocked(pharmacyOrderRepository.createOrder).mockResolvedValue({
      id: 'order-1',
      patientId: 'patient-1',
      status: 'paid',
      subtotal: 3000,
      coverageDiscount: 1200,
      total: 1800,
      deliveryAddress: 'Av. Siempreviva 742',
      createdAt: '2026-09-13T00:00:00.000Z',
    } as any);

    render(<PharmacyCatalog patientId="patient-1" />);

    const dispenseButton = await screen.findByText(/Comprar Medicamentos de la Receta/i);
    fireEvent.click(dispenseButton);

    const confirmButton = await screen.findByText('Confirmar Pedido y Enviar Cadete');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(pharmacyOrderRepository.createOrder).toHaveBeenCalled();
    });

    const callArgs = vi.mocked(pharmacyOrderRepository.createOrder).mock.calls[0][0] as any;
    expect(callArgs.items).toEqual([{ productId: 'prod-real-1', quantity: 2 }]);
    callArgs.items.forEach((item: any) => {
      expect(item.productId.startsWith('rx-prod-')).toBe(false);
    });
  });
});
