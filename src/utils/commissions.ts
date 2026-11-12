import { CommissionStatus, LiquidationStatus } from '../types';
import { shiftMonth } from './month';

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  generated: 'Generada',
  retained: 'Retenida',
  approved: 'A cobrar',
  excluded: 'Excluida',
  paid: 'Cobrada',
};

export const LIQUIDATION_STATUS_LABELS: Record<LiquidationStatus, string> = {
  draft: 'Borrador',
  approved: 'Aprobada',
  paid: 'Pagada',
};

export const LIQUIDATION_STATUS_BADGE: Record<LiquidationStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  approved: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
};

/** First day (YYYY-MM-01) of the month `date` falls in, in Argentina time (as the database closes months). */
export const argentinaMonth = (date: Date = new Date()): string => {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `${day.slice(0, 7)}-01`;
};

/** The last `count` closed months (the only ones that can be liquidated), newest first. */
export const closedMonths = (now: Date = new Date(), count = 12): string[] => {
  const current = argentinaMonth(now);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, -(i + 1)));
};
