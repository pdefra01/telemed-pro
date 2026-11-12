import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Commissions } from '../Commissions';
import { commissionRepository } from '../../../repositories/CommissionRepository';
import { CommissionLine, CommissionLiquidation, CommissionSummary } from '../../../types';

vi.mock('../../../repositories/CommissionRepository', () => ({
  commissionRepository: {
    getSummary: vi.fn(),
    listLiquidations: vi.fn(),
    listCommissions: vi.fn(),
    generate: vi.fn(),
    exclude: vi.fn(),
    include: vi.fn(),
    approve: vi.fn(),
    pay: vi.fn(),
  },
}));

const summary = (over: Partial<CommissionSummary> = {}): CommissionSummary => ({
  advisorId: 'adv-1', advisorName: 'Pedro Gómez',
  generatedAmount: 1500, generatedCount: 2,
  retainedAmount: 800, retainedCount: 1,
  toCollectAmount: 500, toCollectCount: 1,
  collectedAmount: 2000, collectedCount: 3,
  ...over,
});

const liquidation = (over: Partial<CommissionLiquidation> = {}): CommissionLiquidation => ({
  id: 'liq-1', advisorId: 'adv-1', month: '2026-09-01', status: 'paid', totalAmount: 2000,
  retainedAmount: 0, retainedCount: 0, approvedAt: '2026-10-02T12:00:00Z',
  paidAt: '2026-10-05', paymentMethod: 'Transferencia', paymentReference: 'OP-1',
  ...over,
});

const line = (over: Partial<CommissionLine> = {}): CommissionLine => ({
  id: 'c-1', advisorId: 'adv-1', advisorName: 'Pedro Gómez', affiliateName: 'Ana Paz', planName: 'Plan A',
  amount: 500, confirmedAt: '2026-09-10T12:00:00Z', status: 'paid', exclusionReason: null, retainedReason: null,
  liquidationId: 'liq-1',
  ...over,
});

// toHaveTextContent collapses the non-breaking space of the currency format into a plain one
const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).replace(/\s/g, ' ');

describe('Commissions — advisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commissionRepository.getSummary).mockResolvedValue([summary()]);
    vi.mocked(commissionRepository.listLiquidations).mockResolvedValue([
      liquidation({ id: 'liq-2', month: '2026-10-01', status: 'approved', totalAmount: 500, paidAt: null, paymentMethod: null, paymentReference: null }),
      liquidation(),
    ]);
  });

  it('shows the four numbers first', async () => {
    render(<Commissions />);

    expect(await screen.findByTestId('total-generated')).toHaveTextContent(`Generada ${money(1500)}`);
    expect(screen.getByTestId('total-retained')).toHaveTextContent(`Retenida ${money(800)}`);
    expect(screen.getByTestId('total-to-collect')).toHaveTextContent(`A cobrar ${money(500)}`);
    expect(screen.getByTestId('total-collected')).toHaveTextContent(`Cobrada ${money(2000)}`);
  });

  it('lists the liquidations with month, total, status and the payment', async () => {
    render(<Commissions />);

    const paid = await screen.findByTestId('liquidation-liq-1');
    expect(paid).toHaveTextContent(/septiembre de 2026/i);
    expect(paid).toHaveTextContent(money(2000));
    expect(paid).toHaveTextContent('Pagada');
    expect(paid).toHaveTextContent('Pagada el 5/10/2026 · Transferencia');
    expect(screen.getByTestId('liquidation-liq-2')).toHaveTextContent('Aprobada');
  });

  it('shows the lines of a liquidation on demand, with the reason of an excluded line', async () => {
    vi.mocked(commissionRepository.listCommissions).mockResolvedValue([
      line(),
      line({ id: 'c-2', affiliateName: 'Luis Díaz', status: 'excluded', amount: 0, exclusionReason: 'Venta duplicada' }),
    ]);
    render(<Commissions />);

    const row = await screen.findByTestId('liquidation-liq-1');
    expect(commissionRepository.listCommissions).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: /detalle/i }));

    expect(await within(row).findByText('Ana Paz')).toBeInTheDocument();
    expect(commissionRepository.listCommissions).toHaveBeenCalledWith('liq-1');
    expect(within(row).getByTestId('line-c-2')).toHaveTextContent('Excluida');
    expect(within(row).getByTestId('line-c-2')).toHaveTextContent('Venta duplicada');
  });

  it('shows the commissions not liquidated yet, with the retained reason', async () => {
    vi.mocked(commissionRepository.listCommissions).mockResolvedValue([
      line({ id: 'c-3', status: 'retained', liquidationId: null, retainedReason: 'Débito rechazado', affiliateName: 'Eva Sosa' }),
      line(),
    ]);
    render(<Commissions />);

    const row = await screen.findByTestId('liquidation-pending');
    fireEvent.click(within(row).getByRole('button', { name: /detalle/i }));

    expect(await within(row).findByTestId('line-c-3')).toHaveTextContent('Débito rechazado');
    expect(commissionRepository.listCommissions).toHaveBeenCalledWith(undefined);
    expect(within(row).queryByTestId('line-c-1')).not.toBeInTheDocument();
  });

  it('offers no admin action', async () => {
    render(<Commissions />);
    await screen.findByTestId('liquidation-liq-1');

    expect(screen.queryByRole('button', { name: /aprobar|registrar pago|generar|excluir|incluir/i })).not.toBeInTheDocument();
  });

  it('shows the load error', async () => {
    vi.mocked(commissionRepository.getSummary).mockRejectedValue(new Error('Sin conexión'));
    render(<Commissions />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  });

  it('shows the error of the lines', async () => {
    vi.mocked(commissionRepository.listCommissions).mockRejectedValue(new Error('No autorizado'));
    render(<Commissions />);

    const row = await screen.findByTestId('liquidation-liq-1');
    fireEvent.click(within(row).getByRole('button', { name: /detalle/i }));

    expect(await within(row).findByRole('alert')).toHaveTextContent('No autorizado');
  });
});

describe('Commissions — supervisor (team, read-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commissionRepository.getSummary).mockResolvedValue([
      summary(),
      summary({ advisorId: 'adv-2', advisorName: 'Luis Paz', generatedAmount: 0, retainedAmount: 0, toCollectAmount: 800, collectedAmount: 0 }),
    ]);
    vi.mocked(commissionRepository.listLiquidations).mockResolvedValue([
      liquidation(),
      liquidation({ id: 'liq-3', advisorId: 'adv-2', month: '2026-10-01', status: 'approved', totalAmount: 800, paidAt: null, paymentMethod: null }),
    ]);
  });

  it('shows one compact row per advisor with the four numbers, and the team totals', async () => {
    render(<Commissions team title="Comisiones del equipo" />);

    expect(await screen.findByRole('heading', { name: 'Comisiones del equipo' })).toBeInTheDocument();
    const pedro = await screen.findByTestId('advisor-adv-1');
    expect(pedro).toHaveTextContent('Pedro Gómez');
    expect(pedro).toHaveTextContent(`Generada ${money(1500)}`);
    expect(pedro).toHaveTextContent(`Retenida ${money(800)}`);
    expect(pedro).toHaveTextContent(`A cobrar ${money(500)}`);
    expect(pedro).toHaveTextContent(`Cobrada ${money(2000)}`);
    expect(screen.getByTestId('total-to-collect')).toHaveTextContent(money(1300));
  });

  it('drills down into an advisor\'s liquidations and their lines', async () => {
    vi.mocked(commissionRepository.listCommissions).mockResolvedValue([line({ id: 'c-9', advisorId: 'adv-2', liquidationId: 'liq-3', affiliateName: 'Rita Gil', status: 'approved' })]);
    render(<Commissions team title="Comisiones del equipo" />);

    const luis = await screen.findByTestId('advisor-adv-2');
    expect(within(luis).queryByTestId('liquidation-liq-3')).not.toBeInTheDocument();
    fireEvent.click(within(luis).getByRole('button', { name: /liquidaciones/i }));

    const liq = within(luis).getByTestId('liquidation-liq-3');
    expect(within(luis).queryByTestId('liquidation-liq-1')).not.toBeInTheDocument();
    fireEvent.click(within(liq).getByRole('button', { name: /detalle/i }));
    expect(await within(liq).findByText('Rita Gil')).toBeInTheDocument();
    expect(within(liq).getByTestId('line-c-9')).toHaveTextContent('A cobrar');
  });

  it('is read-only: no admin action anywhere', async () => {
    vi.mocked(commissionRepository.listCommissions).mockResolvedValue([line({ status: 'generated', liquidationId: 'liq-1' })]);
    render(<Commissions team title="Comisiones del equipo" />);

    const pedro = await screen.findByTestId('advisor-adv-1');
    fireEvent.click(within(pedro).getByRole('button', { name: /liquidaciones/i }));
    fireEvent.click(within(within(pedro).getByTestId('liquidation-liq-1')).getByRole('button', { name: /detalle/i }));
    await waitFor(() => expect(commissionRepository.listCommissions).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /aprobar|registrar pago|generar|excluir|incluir/i })).not.toBeInTheDocument();
  });
});
