import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamPerformance } from '../TeamPerformance';
import { advisorPerformanceRepository } from '../../../repositories/AdvisorPerformanceRepository';
import { AdvisorMonthMetrics } from '../../../types';
import { monthStart, shiftMonth } from '../../../utils/month';

vi.mock('../../../repositories/AdvisorPerformanceRepository', () => ({
  advisorPerformanceRepository: {
    getMonthlyMetrics: vi.fn(),
    saveGoal: vi.fn(),
    deleteGoal: vi.fn(),
  },
}));

const thisMonth = monthStart(new Date());

const build = (over: Partial<AdvisorMonthMetrics>): AdvisorMonthMetrics => ({
  advisorId: 'adv-1',
  advisorName: 'Pedro Gómez',
  month: thisMonth,
  affiliatesSold: 4,
  revenue: 3500,
  prospectsLoaded: 4,
  prospectsContacted: 3,
  prospectsAffiliated: 1,
  prospectsStale: 2,
  linksShared: 7,
  goalAffiliates: 6,
  goalRevenue: 4000,
  ...over,
});

const rows = [
  build({}),
  build({
    advisorId: 'adv-2', advisorName: 'Luis Paz', affiliatesSold: 1, revenue: 1000, prospectsLoaded: 0,
    prospectsContacted: 0, prospectsAffiliated: 0, prospectsStale: 0, linksShared: 0, goalAffiliates: undefined, goalRevenue: undefined,
  }),
];

describe('TeamPerformance (supervisor / admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue(rows);
    vi.mocked(advisorPerformanceRepository.saveGoal).mockResolvedValue(undefined);
    vi.mocked(advisorPerformanceRepository.deleteGoal).mockResolvedValue(undefined);
  });

  it('asks for the current month and lists every advisor with sales and revenue against their goals', async () => {
    render(<TeamPerformance />);

    const pedro = await screen.findByTestId('perf-adv-1');
    expect(advisorPerformanceRepository.getMonthlyMetrics).toHaveBeenCalledWith(thisMonth);
    expect(pedro).toHaveTextContent('Pedro Gómez');
    expect(within(pedro).getByTestId('sold-adv-1')).toHaveTextContent(/4 de 6/);
    expect(within(pedro).getByTestId('revenue-adv-1')).toHaveTextContent(/3\.500.*4\.000/);

    const luis = screen.getByTestId('perf-adv-2');
    expect(within(luis).getByTestId('sold-adv-2')).toHaveTextContent(/^1/);
    expect(within(luis).getByTestId('sold-adv-2')).toHaveTextContent(/sin meta/i);
  });

  it('shows conversion, stale prospects and links per advisor', async () => {
    render(<TeamPerformance />);
    const pedro = await screen.findByTestId('perf-adv-1');

    expect(within(pedro).getByTestId('conversion-adv-1')).toHaveTextContent('25%');
    expect(within(pedro).getByTestId('stale-adv-1')).toHaveTextContent('2');
    expect(within(pedro).getByTestId('links-adv-1')).toHaveTextContent('7');
    expect(within(screen.getByTestId('perf-adv-2')).getByTestId('conversion-adv-2')).toHaveTextContent('—');
  });

  it('adds up a team total', async () => {
    render(<TeamPerformance />);
    await screen.findByTestId('perf-adv-1');

    const total = screen.getByTestId('perf-total');
    expect(total).toHaveTextContent(/5 de 6/);
    expect(total).toHaveTextContent(/4\.500.*4\.000/);
  });

  it('moves between months and reloads', async () => {
    render(<TeamPerformance />);
    await screen.findByTestId('perf-adv-1');

    fireEvent.click(screen.getByRole('button', { name: /mes anterior/i }));
    await waitFor(() => expect(advisorPerformanceRepository.getMonthlyMetrics).toHaveBeenLastCalledWith(shiftMonth(thisMonth, -1)));

    fireEvent.click(screen.getByRole('button', { name: /mes siguiente/i }));
    await waitFor(() => expect(advisorPerformanceRepository.getMonthlyMetrics).toHaveBeenLastCalledWith(thisMonth));
  });

  it('sets a goal for an advisor without one and shows the new progress', async () => {
    render(<TeamPerformance />);
    const luis = await screen.findByTestId('perf-adv-2');

    fireEvent.click(within(luis).getByRole('button', { name: /editar meta/i }));
    fireEvent.change(screen.getByLabelText('Meta de afiliados'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar meta/i }));

    await waitFor(() => expect(advisorPerformanceRepository.saveGoal).toHaveBeenCalledWith('adv-2', thisMonth, {
      targetAffiliates: 3,
      targetRevenue: null,
    }));
    await waitFor(() => expect(within(screen.getByTestId('perf-adv-2')).getByTestId('sold-adv-2')).toHaveTextContent(/1 de 3/));
    expect(screen.queryByLabelText('Meta de afiliados')).not.toBeInTheDocument();
  });

  it('prefills the current goal and lets the user remove it', async () => {
    render(<TeamPerformance />);
    const pedro = await screen.findByTestId('perf-adv-1');

    fireEvent.click(within(pedro).getByRole('button', { name: /editar meta/i }));
    expect(screen.getByLabelText('Meta de afiliados')).toHaveValue(6);
    expect(screen.getByLabelText('Meta de ingresos')).toHaveValue(4000);

    fireEvent.click(screen.getByRole('button', { name: /quitar meta/i }));

    await waitFor(() => expect(advisorPerformanceRepository.deleteGoal).toHaveBeenCalledWith('adv-1', thisMonth));
    await waitFor(() => expect(within(screen.getByTestId('perf-adv-1')).getByTestId('sold-adv-1')).toHaveTextContent(/sin meta/i));
  });

  it('does not offer to remove a goal that does not exist', async () => {
    render(<TeamPerformance />);
    const luis = await screen.findByTestId('perf-adv-2');

    fireEvent.click(within(luis).getByRole('button', { name: /editar meta/i }));

    expect(screen.queryByRole('button', { name: /quitar meta/i })).not.toBeInTheDocument();
  });

  it('shows the validation message when the goal is rejected and keeps the form open', async () => {
    vi.mocked(advisorPerformanceRepository.saveGoal).mockRejectedValue(new Error('Definí al menos una meta (afiliados o ingresos).'));
    render(<TeamPerformance />);
    const luis = await screen.findByTestId('perf-adv-2');

    fireEvent.click(within(luis).getByRole('button', { name: /editar meta/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar meta/i }));

    expect(await screen.findByText(/definí al menos una meta/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Meta de afiliados')).toBeInTheDocument();
  });

  it('closes the form without saving when cancelled', async () => {
    render(<TeamPerformance />);
    const luis = await screen.findByTestId('perf-adv-2');

    fireEvent.click(within(luis).getByRole('button', { name: /editar meta/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.queryByLabelText('Meta de afiliados')).not.toBeInTheDocument();
    expect(advisorPerformanceRepository.saveGoal).not.toHaveBeenCalled();
  });

  it('uses the given title', async () => {
    render(<TeamPerformance title="Metas y métricas del equipo" />);
    expect(await screen.findByRole('heading', { name: 'Metas y métricas del equipo' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no advisors', async () => {
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue([]);
    render(<TeamPerformance />);
    expect(await screen.findByText(/no hay asesores para mostrar/i)).toBeInTheDocument();
  });

  it('shows a message when loading fails', async () => {
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockRejectedValue(new Error('boom'));
    render(<TeamPerformance />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i);
  });
});
