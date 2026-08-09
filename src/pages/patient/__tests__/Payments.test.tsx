import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Payments from '../Payments';
import { MOCK_PATIENT } from '../../../constants';
import { accountMovementRepository } from '../../../repositories/AccountMovementRepository';
import { invoiceRepository } from '../../../repositories/InvoiceRepository';
import { supabase } from '../../../services/supabase';

vi.mock('../../../repositories/AccountMovementRepository', () => ({
  accountMovementRepository: {
    getBalance: vi.fn(),
    getMovements: vi.fn(),
  },
}));

vi.mock('../../../repositories/InvoiceRepository', () => ({
  invoiceRepository: {
    getByEntity: vi.fn(),
  },
}));

vi.mock('../../../repositories/NotificationRepository', () => ({
  notificationRepository: {
    subscribeToNotifications: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  },
}));

vi.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

const mockToast = vi.fn();
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const originalLocation = window.location;
const originalFetch = global.fetch;

function makeInvoice(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'inv-1',
    entityType: 'affiliate' as const,
    entityId: MOCK_PATIENT.id,
    period: 'Julio 2026',
    netAmount: 50000,
    taxAmount: 0,
    totalAmount: 50000,
    status: 'issued' as const,
    pdfUrl: undefined,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMovement(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'mov-1',
    entityType: 'affiliate' as const,
    entityId: MOCK_PATIENT.id,
    type: 'charge' as const,
    amount: 50000,
    externalRef: 'charge:manual:inv-1',
    invoiceId: 'inv-1',
    source: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Patient Payments Screen (de-mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    } as any);
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
      configurable: true,
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    global.fetch = originalFetch;
  });

  it('scopes every read to the authenticated patient\'s own profile id (titular-only)', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(0);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([]);

    render(<Payments user={MOCK_PATIENT} />);

    await waitFor(() => {
      expect(accountMovementRepository.getBalance).toHaveBeenCalledWith(MOCK_PATIENT.id);
      expect(accountMovementRepository.getMovements).toHaveBeenCalledWith(MOCK_PATIENT.id);
      expect(invoiceRepository.getByEntity).toHaveBeenCalledWith('affiliate', MOCK_PATIENT.id);
    });
  });

  it('shows the "al día" state and never a fabricated pending amount when the computed balance is zero', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(0);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([makeMovement({ type: 'payment', id: 'mov-paid' })]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([makeInvoice({ status: 'paid' })]);

    render(<Payments user={MOCK_PATIENT} />);

    await waitFor(() => {
      expect(screen.getByText(/Tus pagos están al día/i)).toBeDefined();
    });
    expect(screen.queryByText('Regularizar Ahora')).toBeNull();
  });

  it('shows the pending banner with the real computed balance (not the invoice total) when balance > 0', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(35000);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([makeMovement()]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([makeInvoice({ totalAmount: 50000, status: 'issued' })]);

    render(<Payments user={MOCK_PATIENT} />);

    await waitFor(() => {
      expect(screen.getByText('Pago Pendiente Detectado')).toBeDefined();
    });
    expect(screen.getByText(`$${(35000).toLocaleString()}`)).toBeDefined();
    expect(screen.getByText(/Período correspondiente a Julio 2026/)).toBeDefined();
  });

  it('picks the OLDEST issued invoice for "Regularizar Ahora", not merely the most recently issued one', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(100000);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([
      makeInvoice({ id: 'inv-newer', period: 'Julio 2026', createdAt: '2026-07-01T00:00:00.000Z', status: 'issued' }),
      makeInvoice({ id: 'inv-older', period: 'Junio 2026', createdAt: '2026-06-01T00:00:00.000Z', status: 'issued' }),
    ]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ initPoint: 'https://mp.example/checkout/inv-older' }),
    } as any);

    render(<Payments user={MOCK_PATIENT} />);

    const payButton = await screen.findByText('Regularizar Ahora');
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/payments/checkout-preference', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ invoiceId: 'inv-older' }),
      }));
    });
    await waitFor(() => {
      expect(window.location.href).toBe('https://mp.example/checkout/inv-older');
    });
  });

  it('redirects to the real MP Checkout Pro link on successful "Regularizar Ahora"', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(50000);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([makeInvoice({ status: 'issued' })]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ initPoint: 'https://mp.example/checkout/xyz' }),
    } as any);

    render(<Payments user={MOCK_PATIENT} />);

    const payButton = await screen.findByText('Regularizar Ahora');
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(window.location.href).toBe('https://mp.example/checkout/xyz');
    });
  });

  it('shows an error toast and does not redirect when checkout-preference fails', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(50000);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([makeInvoice({ status: 'issued' })]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'La factura no está en estado pagable.' }),
    } as any);

    render(<Payments user={MOCK_PATIENT} />);

    const payButton = await screen.findByText('Regularizar Ahora');
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('La factura no está en estado pagable.', 'error');
    });
    expect(window.location.href).toBe('');
  });

  it('never fabricates a "Regularizar Ahora" call when there is a balance but no issued invoice to pay', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(50000);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([]);

    render(<Payments user={MOCK_PATIENT} />);

    const payButton = await screen.findByText('Regularizar Ahora');
    expect((payButton.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders real ledger movements as the transaction history, distinguishing charges from payments', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(0);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([
      makeMovement({ id: 'mov-charge', type: 'charge', amount: 50000, invoiceId: 'inv-1' }),
      makeMovement({ id: 'mov-payment', type: 'payment', amount: 50000, invoiceId: 'inv-1' }),
    ]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([makeInvoice({ status: 'paid' })]);

    render(<Payments user={MOCK_PATIENT} />);

    await waitFor(() => {
      expect(screen.getByText('2 Registros')).toBeDefined();
    });
    expect(screen.getByText(/Cargo · Julio 2026/)).toBeDefined();
    expect(screen.getByText(/Pago · Julio 2026/)).toBeDefined();
  });

  it('shows the receipt download disabled — honest "no receipt available" state — since Real Receipt From Invoice Records is deferred', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(0);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([
      makeMovement({ id: 'mov-payment', type: 'payment', amount: 50000, invoiceId: 'inv-1' }),
    ]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([makeInvoice({ status: 'paid', pdfUrl: undefined })]);

    render(<Payments user={MOCK_PATIENT} />);

    const downloadButton = await screen.findByTitle('Comprobante no disponible');
    expect((downloadButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders an empty-state message when there are no ledger movements yet', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockResolvedValue(0);
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([]);

    render(<Payments user={MOCK_PATIENT} />);

    await waitFor(() => {
      expect(screen.getByText('Sin movimientos registrados todavía')).toBeDefined();
    });
  });

  it('shows a distinct error state — not the "al día" or pending-balance banners — when a fetch fails', async () => {
    vi.mocked(accountMovementRepository.getBalance).mockRejectedValue(new Error('network down'));
    vi.mocked(accountMovementRepository.getMovements).mockResolvedValue([]);
    vi.mocked(invoiceRepository.getByEntity).mockResolvedValue([]);

    render(<Payments user={MOCK_PATIENT} />);

    await waitFor(() => {
      expect(screen.getByText(/No pudimos cargar tu información de pagos/i)).toBeDefined();
    });
    expect(screen.queryByText(/Tus pagos están al día/i)).toBeNull();
    expect(screen.queryByText('Pago Pendiente Detectado')).toBeNull();
    expect(screen.queryAllByText('Al día')).toHaveLength(0);
    expect(screen.queryByText('Sin movimientos registrados todavía')).toBeNull();
    expect(screen.getByText(/No pudimos cargar tu historial de transacciones/i)).toBeDefined();
  });
});
