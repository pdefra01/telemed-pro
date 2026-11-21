import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamActivityTrends } from '../TeamActivityTrends';
import { advisorPerformanceRepository } from '../../../repositories/AdvisorPerformanceRepository';
import { AdvisorDayActivity, AdvisorMonthMetrics } from '../../../types';

vi.mock('../../../repositories/AdvisorPerformanceRepository', () => ({
  advisorPerformanceRepository: { getDailyActivity: vi.fn() },
}));

// jsdom has no layout: give the charts a fixed size instead of a ResizeObserver.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div style={{ width: 600, height: 240 }}>{React.cloneElement(children, { width: 600, height: 240 } as any)}</div>
    ),
  };
});

const month = '2026-10-01';

const advisor = (over: Partial<AdvisorMonthMetrics>): AdvisorMonthMetrics => ({
  advisorId: 'adv-1',
  advisorName: 'Pedro Gómez',
  month,
  affiliatesSold: 0,
  revenue: 0,
  prospectsLoaded: 0,
  prospectsContacted: 0,
  prospectsAffiliated: 0,
  prospectsStale: 0,
  linksShared: 0,
  affiliatesUnconfirmed: 0,
  ...over,
});

const day = (over: Partial<AdvisorDayActivity>): AdvisorDayActivity => ({
  advisorId: 'adv-1',
  day: '2026-10-03',
  prospectsLoaded: 0,
  prospectsAffiliated: 0,
  collectionActions: 0,
  affiliatesSold: 0,
  linksSent: 0,
  linksPaid: 0,
  ...over,
});

const advisors = [
  advisor({ goalAffiliates: 6 }),
  advisor({ advisorId: 'adv-2', advisorName: 'Luis Paz', goalAffiliates: 4 }),
];

const activity = [
  day({ prospectsLoaded: 3, collectionActions: 2, linksSent: 4, linksPaid: 1, affiliatesSold: 2 }),
  day({ advisorId: 'adv-2', day: '2026-10-10', prospectsLoaded: 1, prospectsAffiliated: 1, collectionActions: 5, affiliatesSold: 3 }),
];

describe('TeamActivityTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(advisorPerformanceRepository.getDailyActivity).mockResolvedValue(activity);
  });

  it('loads the daily activity of the month and shows the totals of the team', async () => {
    render(<TeamActivityTrends month={month} advisors={advisors} />);

    expect(await screen.findByTestId('trend-prospects')).toHaveTextContent('4');
    expect(advisorPerformanceRepository.getDailyActivity).toHaveBeenCalledWith(month);
    expect(screen.getByTestId('trend-prospects')).toHaveTextContent('1 convertidos');
    expect(screen.getByTestId('trend-actions')).toHaveTextContent('7');
    expect(screen.getByTestId('trend-sales')).toHaveTextContent('5');
    expect(screen.getByTestId('trend-links')).toHaveTextContent('4');
    expect(screen.getByTestId('trend-links')).toHaveTextContent('25% pagados');
  });

  it('compares the sales with the pace the goal asks for (a past month is judged on its last day)', async () => {
    render(<TeamActivityTrends month={month} advisors={advisors} />);

    const status = await screen.findByTestId('pace-status');
    expect(status).toHaveTextContent('5 afiliados al día 31');
    expect(status).toHaveTextContent('el ritmo para la meta de 10 pide 10');
    expect(status).toHaveTextContent('Atrasado');
  });

  it('narrows the charts and the goal to one advisor', async () => {
    render(<TeamActivityTrends month={month} advisors={advisors} />);
    await screen.findByTestId('trend-prospects');

    fireEvent.change(screen.getByLabelText('Asesor'), { target: { value: 'adv-2' } });

    expect(screen.getByTestId('trend-prospects')).toHaveTextContent('1');
    expect(screen.getByTestId('trend-actions')).toHaveTextContent('5');
    expect(screen.getByTestId('pace-status')).toHaveTextContent('3 afiliados al día 31');
    expect(screen.getByTestId('pace-status')).toHaveTextContent('meta de 4 pide 4');
  });

  it('marks the pace as on track when sales reach it', async () => {
    // adv-1 sold 2 in October; a goal of 2 asks for 2 by the last day.
    render(<TeamActivityTrends month={month} advisors={[advisor({ goalAffiliates: 2 })]} />);
    expect(await screen.findByTestId('pace-status')).toHaveTextContent('Al día');
  });

  it('has no pace status without a goal', async () => {
    render(<TeamActivityTrends month={month} advisors={[advisor({})]} />);
    await screen.findByTestId('trend-prospects');
    expect(screen.queryByTestId('pace-status')).not.toBeInTheDocument();
  });

  it('reports a load failure', async () => {
    vi.mocked(advisorPerformanceRepository.getDailyActivity).mockRejectedValueOnce(new Error('boom'));
    render(<TeamActivityTrends month={month} advisors={advisors} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la actividad diaria.');
  });

  it('reloads when the month changes', async () => {
    const { rerender } = render(<TeamActivityTrends month={month} advisors={advisors} />);
    await screen.findByTestId('trend-prospects');

    rerender(<TeamActivityTrends month="2026-11-01" advisors={advisors} />);

    await waitFor(() => expect(advisorPerformanceRepository.getDailyActivity).toHaveBeenCalledWith('2026-11-01'));
  });
});
