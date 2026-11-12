import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommissionsAdmin } from '../CommissionsAdmin';
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

const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).replace(/\s/g, ' ');

const summary = (advisorId: string, advisorName: string): CommissionSummary => ({
  advisorId, advisorName,
  generatedAmount: 0, generatedCount: 0, retainedAmount: 0, retainedCount: 0,
  toCollectAmount: 0, toCollectCount: 0, collectedAmount: 0, collectedCount: 0,
});

const liquidation = (over: Partial<CommissionLiquidation> = {}): CommissionLiquidation => ({
  id: 'liq-1', advisorId: 'adv-1', month: '2026-10-01', status: 'draft', totalAmount: 1300,
  retainedAmount: 800, retainedCount: 1, approvedAt: null, paidAt: null, paymentMethod: null, paymentReference: null,
  ...over,
});

const line = (over: Partial<CommissionLine> = {}): CommissionLine => ({
  id: 'c-1', advisorId: 'adv-1', advisorName: 'Pedro Gómez', affiliateName: 'Ana Paz', planName: 'Plan A',
  amount: 500, confirmedAt: '2026-10-10T12:00:00Z', status: 'generated', exclusionReason: null, retainedReason: null,
  liquidationId: 'liq-1',
  ...over,
});

const NOW = new Date('2026-11-12T15:00:00Z');

describe('CommissionsAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.mocked(commissionRepository.getSummary).mockResolvedValue([summary('adv-1', 'Pedro Gómez'), summary('adv-2', 'Luis Paz')]);
    vi.mocked(commissionRepository.listLiquidations).mockResolvedValue([
      liquidation(),
      liquidation({ id: 'liq-2', advisorId: 'adv-2', status: 'approved', totalAmount: 800, retainedAmount: 0, retainedCount: 0, approvedAt: '2026-11-02T12:00:00Z' }),
    ]);
    vi.mocked(commissionRepository.listCommissions).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers only closed months, the last one first', async () => {
    render(<CommissionsAdmin />);

    const select = await screen.findByLabelText('Mes');
    const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values[0]).toBe('2026-10-01');
    expect(values).not.toContain('2026-11-01');
    await waitFor(() => expect(commissionRepository.listLiquidations).toHaveBeenCalledWith({ month: '2026-10-01' }));
  });

  it('shows one row per advisor liquidation: advisor, total, retained and status', async () => {
    render(<CommissionsAdmin />);

    const row = await screen.findByTestId('liquidation-liq-1');
    expect(row).toHaveTextContent('Pedro Gómez');
    expect(row).toHaveTextContent(money(1300));
    expect(row).toHaveTextContent(`Retenida ${money(800)} (1)`);
    expect(row).toHaveTextContent('Borrador');
    expect(screen.getByTestId('liquidation-liq-2')).toHaveTextContent('Luis Paz');
  });

  it('generates the month and shows the summary in one line', async () => {
    vi.mocked(commissionRepository.generate).mockResolvedValue({ advisors: 2, commissionsAttached: 5, retainedCount: 1, totalAmount: 2100 });
    render(<CommissionsAdmin />);
    await screen.findByTestId('liquidation-liq-1');

    fireEvent.click(screen.getByRole('button', { name: 'Generar liquidación' }));

    expect(await screen.findByTestId('generation-result')).toHaveTextContent(`2 asesores · 5 comisiones · 1 retenida · Total ${money(2100)}`);
    expect(commissionRepository.generate).toHaveBeenCalledWith('2026-10-01');
    expect(commissionRepository.listLiquidations).toHaveBeenCalledTimes(2);
  });

  it('shows the database message when the generation fails', async () => {
    vi.mocked(commissionRepository.generate).mockRejectedValue(new Error('Solo se liquidan meses cerrados: 11/2026 todavía no cerró'));
    render(<CommissionsAdmin />);
    await screen.findByTestId('liquidation-liq-1');

    fireEvent.click(screen.getByRole('button', { name: 'Generar liquidación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Solo se liquidan meses cerrados: 11/2026 todavía no cerró');
  });

  it('offers Aprobar only on a draft and Registrar pago only on an approved one', async () => {
    render(<CommissionsAdmin />);

    const draft = await screen.findByTestId('liquidation-liq-1');
    const approved = screen.getByTestId('liquidation-liq-2');
    expect(within(draft).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(within(draft).queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(within(approved).getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument();
    expect(within(approved).queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before approving, and approves only when confirmed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(commissionRepository.approve).mockResolvedValue();
    render(<CommissionsAdmin />);
    const draft = await screen.findByTestId('liquidation-liq-1');

    fireEvent.click(within(draft).getByRole('button', { name: 'Aprobar' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(commissionRepository.approve).not.toHaveBeenCalled();

    fireEvent.click(within(draft).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(commissionRepository.approve).toHaveBeenCalledWith('liq-1'));
    expect(confirm.mock.calls[1][0]).toMatch(/Pedro Gómez/);
    await waitFor(() => expect(commissionRepository.listLiquidations).toHaveBeenCalledTimes(2));
  });

  it('shows the database message when the approval fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(commissionRepository.approve).mockRejectedValue(new Error('Solo se aprueba una liquidación en borrador (estado actual: approved)'));
    render(<CommissionsAdmin />);
    const draft = await screen.findByTestId('liquidation-liq-1');

    fireEvent.click(within(draft).getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Solo se aprueba una liquidación en borrador (estado actual: approved)');
  });

  it('records the payment with date, method and reference after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(commissionRepository.pay).mockResolvedValue();
    render(<CommissionsAdmin />);
    const approved = await screen.findByTestId('liquidation-liq-2');

    fireEvent.click(within(approved).getByRole('button', { name: 'Registrar pago' }));
    fireEvent.change(within(approved).getByLabelText('Fecha de pago'), { target: { value: '2026-11-05' } });
    fireEvent.change(within(approved).getByLabelText('Medio de pago'), { target: { value: 'Transferencia' } });
    fireEvent.change(within(approved).getByLabelText('Referencia'), { target: { value: 'OP-77' } });
    fireEvent.click(within(approved).getByRole('button', { name: 'Confirmar pago' }));

    await waitFor(() => expect(commissionRepository.pay).toHaveBeenCalledWith('liq-2', { paidAt: '2026-11-05', method: 'Transferencia', reference: 'OP-77' }));
    expect(confirm.mock.calls[0][0]).toMatch(/Luis Paz/);
  });

  it('does not pay when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CommissionsAdmin />);
    const approved = await screen.findByTestId('liquidation-liq-2');

    fireEvent.click(within(approved).getByRole('button', { name: 'Registrar pago' }));
    fireEvent.change(within(approved).getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } });
    fireEvent.click(within(approved).getByRole('button', { name: 'Confirmar pago' }));

    expect(commissionRepository.pay).not.toHaveBeenCalled();
  });

  it('shows the lines of a draft, with the advisor\'s retained ones, and excludes with a required reason', async () => {
    vi.mocked(commissionRepository.listCommissions).mockImplementation(async (id?: string) =>
      id === 'liq-1'
        ? [line()]
        : [line({ id: 'c-r', liquidationId: null, status: 'retained', retainedReason: 'Débito rechazado', affiliateName: 'Eva Sosa', amount: 800 }),
           line({ id: 'c-other', advisorId: 'adv-2', liquidationId: null, status: 'retained', retainedReason: 'Débito rechazado' })]
    );
    vi.mocked(commissionRepository.exclude).mockResolvedValue();
    render(<CommissionsAdmin />);
    const draft = await screen.findByTestId('liquidation-liq-1');

    fireEvent.click(within(draft).getByRole('button', { name: /detalle/i }));
    const generated = await within(draft).findByTestId('line-c-1');
    expect(within(draft).getByTestId('line-c-r')).toHaveTextContent('Débito rechazado');
    expect(within(draft).queryByTestId('line-c-other')).not.toBeInTheDocument();

    fireEvent.click(within(generated).getByRole('button', { name: 'Excluir' }));
    const confirmButton = within(draft).getByRole('button', { name: 'Confirmar exclusión' });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(within(draft).getByLabelText('Motivo de la exclusión'), { target: { value: 'Venta duplicada' } });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(commissionRepository.exclude).toHaveBeenCalledWith('c-1', 'Venta duplicada'));
  });

  it('includes an excluded line back', async () => {
    vi.mocked(commissionRepository.listCommissions).mockResolvedValue([line({ status: 'excluded', exclusionReason: 'Duplicada' })]);
    vi.mocked(commissionRepository.include).mockResolvedValue();
    render(<CommissionsAdmin />);
    const draft = await screen.findByTestId('liquidation-liq-1');

    fireEvent.click(within(draft).getByRole('button', { name: /detalle/i }));
    const excluded = await within(draft).findByTestId('line-c-1');
    expect(excluded).toHaveTextContent('Duplicada');
    fireEvent.click(within(excluded).getByRole('button', { name: 'Incluir' }));

    await waitFor(() => expect(commissionRepository.include).toHaveBeenCalledWith('c-1'));
  });

  it('offers no exclusion once the liquidation is approved', async () => {
    vi.mocked(commissionRepository.listCommissions).mockResolvedValue([line({ liquidationId: 'liq-2', status: 'approved' })]);
    render(<CommissionsAdmin />);
    const approved = await screen.findByTestId('liquidation-liq-2');

    fireEvent.click(within(approved).getByRole('button', { name: /detalle/i }));
    await within(approved).findByTestId('line-c-1');

    expect(within(approved).queryByRole('button', { name: /excluir|incluir/i })).not.toBeInTheDocument();
  });
});
