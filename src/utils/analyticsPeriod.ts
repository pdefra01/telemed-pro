export type AnalyticsTimeframe = 'daily' | 'weekly' | 'monthly';

export interface AnalyticsPeriod {
  /** Inclusive start of the selected period (local time). */
  start: Date;
  /** Exclusive end of the selected period. */
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  label: string;
  compareLabel: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('es-AR', opts);

/** The day, Monday-first week or calendar month containing `anchor`, plus the one right before it. */
export function getAnalyticsPeriod(timeframe: AnalyticsTimeframe, anchor: Date): AnalyticsPeriod {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();

  if (timeframe === 'daily') {
    const start = new Date(y, m, d);
    return {
      start,
      end: new Date(y, m, d + 1),
      prevStart: new Date(y, m, d - 1),
      prevEnd: start,
      label: capitalize(fmt(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      compareLabel: 'Día anterior',
    };
  }

  if (timeframe === 'weekly') {
    const mondayOffset = (anchor.getDay() + 6) % 7;
    const start = new Date(y, m, d - mondayOffset);
    const end = new Date(y, m, d - mondayOffset + 7);
    const lastDay = new Date(y, m, d - mondayOffset + 6);
    return {
      start,
      end,
      prevStart: new Date(y, m, d - mondayOffset - 7),
      prevEnd: start,
      label: `Semana del ${fmt(start, { day: 'numeric', month: 'short' })} al ${fmt(lastDay, { day: 'numeric', month: 'short', year: 'numeric' })}`,
      compareLabel: 'Semana anterior',
    };
  }

  const start = new Date(y, m, 1);
  return {
    start,
    end: new Date(y, m + 1, 1),
    prevStart: new Date(y, m - 1, 1),
    prevEnd: start,
    label: capitalize(fmt(start, { month: 'long', year: 'numeric' })),
    compareLabel: 'Mes anterior',
  };
}

/** Moves the anchor one period back (-1) or forward (+1). Months land on day 1 so short months never overflow. */
export function shiftAnchor(timeframe: AnalyticsTimeframe, anchor: Date, direction: -1 | 1): Date {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();
  if (timeframe === 'monthly') return new Date(y, m + direction, 1);
  const step = timeframe === 'weekly' ? 7 : 1;
  return new Date(y, m, d + direction * step, anchor.getHours(), anchor.getMinutes());
}

export function formatTrend(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '0%' : 'Nuevo';
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
