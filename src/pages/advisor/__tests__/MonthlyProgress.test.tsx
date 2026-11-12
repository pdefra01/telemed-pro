import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonthlyProgress } from '../MonthlyProgress';
import { advisorPerformanceRepository } from '../../../repositories/AdvisorPerformanceRepository';
import { AdvisorMonthMetrics } from '../../../types';
import { monthStart, shiftMonth } from '../../../utils/month';

vi.mock('../../../repositories/AdvisorPerformanceRepository', () => ({
  advisorPerformanceRepository: { getMonthlyMetrics: vi.fn() },
}));

const thisMonth = monthStart(new Date());

const metrics = (over: Partial<AdvisorMonthMetrics> = {}): AdvisorMonthMetrics => ({
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
  affiliatesUnconfirmed: 2,
  ...over,
});

describe('MonthlyProgress (advisor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue([metrics()]);
  });

  it('asks for the current month and shows affiliates progress against the goal', async () => {
    render(<MonthlyProgress />);

    const card = await screen.findByTestId('goal-affiliates');
    expect(advisorPerformanceRepository.getMonthlyMetrics).toHaveBeenCalledWith(thisMonth);
    expect(card).toHaveTextContent(/4 de 6/);
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
  });

  it('shows revenue progress against the goal', async () => {
    render(<MonthlyProgress />);

    const card = await screen.findByTestId('goal-revenue');
    expect(card).toHaveTextContent(/3\.500.*4\.000/);
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '88');
  });

  it('shows the figure without a bar when no goal was set for that target', async () => {
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue([
      metrics({ goalAffiliates: undefined, goalRevenue: undefined }),
    ]);
    render(<MonthlyProgress />);

    const card = await screen.findByTestId('goal-affiliates');
    expect(card).toHaveTextContent(/4/);
    expect(card).toHaveTextContent(/sin meta/i);
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('goal-revenue')).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the prospect funnel, the conversion rate, the stale prospects and the links shared', async () => {
    render(<MonthlyProgress />);
    await screen.findByTestId('goal-affiliates');

    expect(screen.getByTestId('funnel-loaded')).toHaveTextContent('4');
    expect(screen.getByTestId('funnel-contacted')).toHaveTextContent('3');
    expect(screen.getByTestId('funnel-affiliated')).toHaveTextContent('1');
    expect(screen.getByTestId('funnel-conversion')).toHaveTextContent('25%');
    expect(screen.getByTestId('stale-prospects')).toHaveTextContent('2');
    expect(screen.getByTestId('links-shared')).toHaveTextContent('7');
  });

  it('warns about approved sales that still wait for their first payment', async () => {
    render(<MonthlyProgress />);
    await screen.findByTestId('goal-affiliates');

    const notice = screen.getByTestId('unconfirmed-sales');
    expect(notice).toHaveTextContent('2');
    expect(notice).toHaveTextContent(/pendientes de pago/i);
  });

  it('does not warn when every approved sale is paid', async () => {
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue([metrics({ affiliatesUnconfirmed: 0 })]);
    render(<MonthlyProgress />);
    await screen.findByTestId('goal-affiliates');

    expect(screen.queryByTestId('unconfirmed-sales')).not.toBeInTheDocument();
  });

  it('shows a dash for the conversion rate when no prospects were loaded', async () => {
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue([metrics({ prospectsLoaded: 0, prospectsContacted: 0, prospectsAffiliated: 0 })]);
    render(<MonthlyProgress />);
    await screen.findByTestId('goal-affiliates');

    expect(screen.getByTestId('funnel-conversion')).toHaveTextContent('—');
  });

  it('moves between months and cannot go past the current one', async () => {
    render(<MonthlyProgress />);
    await screen.findByTestId('goal-affiliates');

    expect(screen.getByRole('button', { name: /mes siguiente/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /mes anterior/i }));
    await screen.findByTestId('goal-affiliates');
    expect(advisorPerformanceRepository.getMonthlyMetrics).toHaveBeenLastCalledWith(shiftMonth(thisMonth, -1));
    expect(screen.getByRole('button', { name: /mes siguiente/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /mes siguiente/i }));
    await screen.findByTestId('goal-affiliates');
    expect(advisorPerformanceRepository.getMonthlyMetrics).toHaveBeenLastCalledWith(thisMonth);
  });

  it('shows an empty message when the database returns no row', async () => {
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockResolvedValue([]);
    render(<MonthlyProgress />);

    expect(await screen.findByText(/sin datos para este mes/i)).toBeInTheDocument();
  });

  it('shows a message when loading fails', async () => {
    vi.mocked(advisorPerformanceRepository.getMonthlyMetrics).mockRejectedValue(new Error('boom'));
    render(<MonthlyProgress />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar/i);
  });
});
