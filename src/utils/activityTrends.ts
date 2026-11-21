import { AdvisorDayActivity } from '../types';

/** One day of the month for the trend charts, summed over the advisors in scope. */
export interface DailyPoint {
  /** Day of the month, 1-based. */
  day: number;
  /** `DD/MM`, the axis label. */
  label: string;
  prospectsLoaded: number;
  prospectsAffiliated: number;
  collectionActions: number;
  affiliatesSold: number;
  linksSent: number;
  linksPaid: number;
  /** Sales so far this month; undefined after `today`, so the line stops there. */
  cumulativeSold?: number;
  /** Where cumulative sales should be to reach the goal: goal × day / days in month. */
  pace?: number;
}

export interface ActivitySummary {
  prospectsLoaded: number;
  prospectsAffiliated: number;
  collectionActions: number;
  affiliatesSold: number;
  linksSent: number;
  linksPaid: number;
  /** Whole percent of the links sent that were paid; null when no link was sent. */
  linksPaidRate: number | null;
}

interface SeriesOptions {
  /** Only these advisors; all rows when omitted. */
  advisorIds?: Set<string>;
  /** Monthly affiliates goal for the pace line. */
  goal?: number;
  /** `YYYY-MM-DD`; days after it have no cumulative value. */
  today?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

type Kpi = 'prospectsLoaded' | 'prospectsAffiliated' | 'collectionActions' | 'affiliatesSold' | 'linksSent' | 'linksPaid';
const KPIS: Kpi[] = ['prospectsLoaded', 'prospectsAffiliated', 'collectionActions', 'affiliatesSold', 'linksSent', 'linksPaid'];

/** Turns the sparse per-advisor rows of a month (`YYYY-MM-01`) into one point per day. */
export const buildDailySeries = (rows: AdvisorDayActivity[], month: string, options: SeriesOptions = {}): DailyPoint[] => {
  const [year, m] = month.split('-').map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();

  const points: DailyPoint[] = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    label: `${pad(i + 1)}/${pad(m)}`,
    prospectsLoaded: 0,
    prospectsAffiliated: 0,
    collectionActions: 0,
    affiliatesSold: 0,
    linksSent: 0,
    linksPaid: 0,
  }));

  const prefix = `${year}-${pad(m)}-`;
  for (const row of rows) {
    if (options.advisorIds && !options.advisorIds.has(row.advisorId)) continue;
    if (!row.day.startsWith(prefix)) continue;
    const point = points[Number(row.day.slice(8, 10)) - 1];
    if (!point) continue;
    for (const kpi of KPIS) point[kpi] += row[kpi];
  }

  let cumulative = 0;
  for (const point of points) {
    cumulative += point.affiliatesSold;
    const date = `${prefix}${pad(point.day)}`;
    if (!options.today || date <= options.today) point.cumulativeSold = cumulative;
    if (options.goal !== undefined) point.pace = Math.round(((options.goal * point.day) / daysInMonth) * 10) / 10;
  }

  return points;
};

export const summarizeActivity = (series: DailyPoint[]): ActivitySummary => {
  const total = (kpi: Kpi) => series.reduce((sum, p) => sum + p[kpi], 0);
  const linksSent = total('linksSent');
  const linksPaid = total('linksPaid');
  return {
    prospectsLoaded: total('prospectsLoaded'),
    prospectsAffiliated: total('prospectsAffiliated'),
    collectionActions: total('collectionActions'),
    affiliatesSold: total('affiliatesSold'),
    linksSent,
    linksPaid,
    linksPaidRate: linksSent === 0 ? null : Math.round((linksPaid / linksSent) * 100),
  };
};
