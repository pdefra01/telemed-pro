/** Share of a goal reached, as a rounded percentage capped at 100 (0 when there is no usable goal). */
export const progressPercent = (value: number, goal?: number): number => {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, Math.round((value / goal) * 100));
};

/** Affiliated prospects over loaded prospects, as a rounded percentage; null when none were loaded. */
export const conversionRate = (affiliated: number, loaded: number): number | null =>
  loaded > 0 ? Math.round((affiliated / loaded) * 100) : null;

export const formatCurrency = (amount: number): string =>
  amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
