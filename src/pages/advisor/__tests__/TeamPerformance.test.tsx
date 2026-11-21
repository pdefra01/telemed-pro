import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamPerformance } from '../TeamPerformance';
import { advisorPerformanceRepository } from '../../../repositories/AdvisorPerformanceRepository';
import { supervisorRepository } from '../../../repositories/SupervisorRepository';
import { AdvisorMonthMetrics } from '../../../types';
import { monthStart, shiftMonth } from '../../../utils/month';

vi.mock('../../../repositories/AdvisorPerformanceRepository', () => ({
  advisorPerformanceRepository: {
    getMonthlyMetrics: vi.fn(),
    getDailyActivity: vi.fn(),
    saveGoal: vi.fn(),
    deleteGoal: vi.fn(),
  },
}));

vi.mock('../../../repositories/SupervisorRepository', () => ({
  supervisorRepository: {
    listSupervisors: vi.fn(),
  },
}));

// jsdom has no layout: give the trend charts a fixed size instead of a ResizeObserver.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div style={{ width: 600, height: 240 }}>{React.cloneElement(children, { width: 600, height: 240 } as any)}</div>
    ),
  };
});

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
  affiliatesUnconfirmed: 3,
  ...over,
});

const rows = [
  build({ supervisorId: 'sup-1' }),
  build({
    advisorId: 'adv-2', advisorName: 'Luis Paz', affiliatesSold: 1, revenue: 1000, prospectsLoaded: 0,
    prospectsContacted: 0, prospectsAffiliated: 0, prospectsStale: 0, linksShared: 0, goalAffiliates: undefined, goalRevenue: undefined, affiliatesUnconfirmed: 0,
  }),
];

describe('TeamPerformance (supervisor / admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue(rows);
    vi.mocked(advisorPerformanceRepository.getDailyActivity).mockResolvedValue([]);
    vi.mocked(advisorPerformanceRepository.saveGoal).mockResolvedValue(undefined);
    vi.mocked(advisorPerformanceRepository.deleteGoal).mockResolvedValue(undefined);
    vi.mocked(supervisorRepository.listSupervisors).mockResolvedValue([
      { id: 'sup-1', name: 'Carolina Fuentes', email: 'carolina@example.com' },
      { id: 'sup-2', name: 'Marta Ruiz', email: 'marta@example.com' },
    ]);
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

  it('shows the approved sales still waiting for their first payment, per advisor and in total', async () => {
    render(<TeamPerformance />);
    const pedro = await screen.findByTestId('perf-adv-1');

    expect(within(pedro).getByTestId('unconfirmed-adv-1')).toHaveTextContent('3');
    expect(within(screen.getByTestId('perf-adv-2')).getByTestId('unconfirmed-adv-2')).toHaveTextContent('0');
    expect(screen.getByTestId('perf-total')).toHaveTextContent('3');
  });

  it('adds up a team total', async () => {
    render(<TeamPerformance />);
    await screen.findByTestId('perf-adv-1');

    const total = screen.getByTestId('perf-total');
    expect(total).toHaveTextContent(/5 de 6/);
    expect(total).toHaveTextContent(/4\.500.*4\.000/);
  });

  it('summarizes the month in cards', async () => {
    render(<TeamPerformance />);
    await screen.findByTestId('perf-adv-1');

    expect(screen.getByTestId('card-advisors')).toHaveTextContent('2');
    expect(screen.getByTestId('card-affiliates')).toHaveTextContent(/5 de 6/);
    expect(screen.getByTestId('card-revenue')).toHaveTextContent(/4\.500.*4\.000/);
    expect(screen.getByTestId('card-unconfirmed')).toHaveTextContent('3');
    expect(screen.getByTestId('card-prospects')).toHaveTextContent('4');
    expect(screen.getByTestId('card-conversion')).toHaveTextContent('25%');
    expect(screen.getByTestId('card-stale')).toHaveTextContent('2');
    expect(screen.getByTestId('card-links')).toHaveTextContent('7');
  });

  it('does not offer the supervisor picker unless asked to', async () => {
    render(<TeamPerformance />);
    await screen.findByTestId('perf-adv-1');

    expect(screen.queryByLabelText('Supervisor')).not.toBeInTheDocument();
    expect(supervisorRepository.listSupervisors).not.toHaveBeenCalled();
  });

  it('starts with every supervisor and narrows cards and table to the chosen team', async () => {
    render(<TeamPerformance showSupervisorFilter />);
    await screen.findByTestId('perf-adv-1');
    const picker = await screen.findByLabelText('Supervisor');
    await screen.findByRole('option', { name: 'Carolina Fuentes' });

    expect(picker).toHaveValue('all');
    expect(screen.getByRole('option', { name: 'Todos los supervisores' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sin supervisor' })).toBeInTheDocument();

    fireEvent.change(picker, { target: { value: 'sup-1' } });
    expect(screen.getByTestId('perf-adv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('perf-adv-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-advisors')).toHaveTextContent('1');
    expect(screen.getByTestId('card-affiliates')).toHaveTextContent(/4 de 6/);
    expect(screen.getByTestId('perf-total')).toHaveTextContent(/4 de 6/);

    fireEvent.change(picker, { target: { value: 'none' } });
    expect(screen.getByTestId('perf-adv-2')).toBeInTheDocument();
    expect(screen.queryByTestId('perf-adv-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-affiliates')).toHaveTextContent(/^Afiliados1/);

    fireEvent.change(picker, { target: { value: 'all' } });
    expect(screen.getByTestId('card-advisors')).toHaveTextContent('2');
  });

  it('shows the day-by-day activity of the advisors in the chosen team', async () => {
    render(<TeamPerformance showSupervisorFilter />);
    await screen.findByTestId('perf-adv-1');

    expect(await screen.findByRole('heading', { name: 'Actividad día a día' })).toBeInTheDocument();
    expect(advisorPerformanceRepository.getDailyActivity).toHaveBeenCalledWith(thisMonth);
    const advisorPicker = screen.getByLabelText('Asesor');
    expect(within(advisorPicker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos los asesores', 'Pedro Gómez', 'Luis Paz']);

    fireEvent.change(await screen.findByLabelText('Supervisor'), { target: { value: 'sup-1' } });
    expect(within(screen.getByLabelText('Asesor')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos los asesores', 'Pedro Gómez']);
  });

  it('says so when the chosen supervisor has no advisors', async () => {
    render(<TeamPerformance showSupervisorFilter />);
    await screen.findByTestId('perf-adv-1');
    await screen.findByRole('option', { name: 'Marta Ruiz' });

    fireEvent.change(screen.getByLabelText('Supervisor'), { target: { value: 'sup-2' } });

    expect(screen.getByText(/este supervisor no tiene asesores asignados/i)).toBeInTheDocument();
    expect(screen.queryByTestId('perf-total')).not.toBeInTheDocument();
  });

  it('keeps the metrics when the supervisors cannot be loaded', async () => {
    vi.mocked(supervisorRepository.listSupervisors).mockRejectedValue(new Error('boom'));
    render(<TeamPerformance showSupervisorFilter />);

    expect(await screen.findByText(/no se pudieron cargar los supervisores/i)).toBeInTheDocument();
    expect(screen.getByTestId('perf-adv-1')).toBeInTheDocument();
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
