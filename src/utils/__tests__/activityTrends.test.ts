import { describe, it, expect } from 'vitest';
import { buildDailySeries, summarizeActivity } from '../activityTrends';
import { AdvisorDayActivity } from '../../types';

const activity = (over: Partial<AdvisorDayActivity>): AdvisorDayActivity => ({
  advisorId: 'adv-1',
  day: '2026-11-03',
  prospectsLoaded: 0,
  prospectsAffiliated: 0,
  collectionActions: 0,
  affiliatesSold: 0,
  linksSent: 0,
  linksPaid: 0,
  ...over,
});

const rows = [
  activity({ day: '2026-11-03', prospectsLoaded: 2, collectionActions: 2, linksSent: 2, linksPaid: 1 }),
  activity({ advisorId: 'adv-2', day: '2026-11-03', prospectsLoaded: 1, affiliatesSold: 1 }),
  activity({ day: '2026-11-05', prospectsAffiliated: 1, affiliatesSold: 2 }),
];

describe('buildDailySeries', () => {
  it('returns one point per day of the month, with zeros on days without activity', () => {
    const series = buildDailySeries(rows, '2026-11-01');

    expect(series).toHaveLength(30);
    expect(series[0]).toMatchObject({ day: 1, label: '01/11', prospectsLoaded: 0, collectionActions: 0, affiliatesSold: 0 });
    expect(series[2]).toMatchObject({ day: 3, prospectsLoaded: 3, collectionActions: 2, affiliatesSold: 1, linksSent: 2, linksPaid: 1 });
    expect(series[4]).toMatchObject({ day: 5, prospectsAffiliated: 1, affiliatesSold: 2 });
  });

  it('accumulates sales day by day', () => {
    const series = buildDailySeries(rows, '2026-11-01');

    expect(series.map((p) => p.cumulativeSold).slice(0, 6)).toEqual([0, 0, 1, 1, 3, 3]);
    expect(series[29].cumulativeSold).toBe(3);
  });

  it('keeps only the advisors in scope when a set is given', () => {
    const series = buildDailySeries(rows, '2026-11-01', { advisorIds: new Set(['adv-2']) });

    expect(series[2]).toMatchObject({ prospectsLoaded: 1, collectionActions: 0, affiliatesSold: 1 });
    expect(series[29].cumulativeSold).toBe(1);
  });

  it('draws the pace line toward the monthly goal: goal x day / days in month', () => {
    const series = buildDailySeries(rows, '2026-11-01', { goal: 30 });

    expect(series[0].pace).toBe(1);
    expect(series[14].pace).toBe(15);
    expect(series[29].pace).toBe(30);
  });

  it('has no pace line without a goal', () => {
    const series = buildDailySeries(rows, '2026-11-01');
    expect(series.every((p) => p.pace === undefined)).toBe(true);
  });

  it('stops the cumulative line at today in the current month', () => {
    const series = buildDailySeries(rows, '2026-11-01', { today: '2026-11-10' });

    expect(series[9].cumulativeSold).toBe(3);
    expect(series[10].cumulativeSold).toBeUndefined();
  });

  it('handles months of different length', () => {
    expect(buildDailySeries([], '2026-02-01')).toHaveLength(28);
    expect(buildDailySeries([], '2026-12-01')).toHaveLength(31);
  });
});

describe('summarizeActivity', () => {
  it('totals each KPI and the paid share of the links sent', () => {
    expect(summarizeActivity(buildDailySeries(rows, '2026-11-01'))).toEqual({
      prospectsLoaded: 3,
      prospectsAffiliated: 1,
      collectionActions: 2,
      affiliatesSold: 3,
      linksSent: 2,
      linksPaid: 1,
      linksPaidRate: 50,
    });
  });

  it('has no paid share when no link was sent', () => {
    expect(summarizeActivity(buildDailySeries([], '2026-11-01')).linksPaidRate).toBeNull();
  });
});
