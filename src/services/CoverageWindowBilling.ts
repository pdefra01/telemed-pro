/**
 * Pure helpers for classifying a billed period against a coverage window's
 * FROZEN snapshot terms (`paid_months_snapshot`/`bonus_months_snapshot`,
 * populated by `assign_plan`/`renew_coverage_window` — see
 * `sdd/cuenta-corriente-billing/design` D6). Never read the live plan: a
 * later admin plan edit must not retroactively reclassify already-elapsed
 * months of an open window.
 */

export type BillingPeriodClassification = 'paid' | 'bonus' | 'expired';

/**
 * Whole calendar months elapsed between the coverage window's `periodStart`
 * and the billed `period` (format `YYYY-MM`), counting the window's own
 * opening month as `0`. A negative result means `period` predates the
 * window's opening.
 */
export function calculateElapsedMonths(periodStart: string, period: string): number {
  const start = new Date(periodStart);
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth(); // 0-indexed

  const [pYearStr, pMonthStr] = period.split('-');
  const pYear = Number(pYearStr);
  const pMonth = Number(pMonthStr) - 1; // 0-indexed to match startMonth

  return (pYear - startYear) * 12 + (pMonth - startMonth);
}

/**
 * Classifies a billed period against the window's frozen paid/bonus terms.
 * Front-loads paid months, then bonus months, then anything beyond is
 * `expired` (requires an explicit admin renewal — billing never fabricates
 * a charge for an expired window). A negative `elapsedMonths` (period before
 * the window opened) is also `expired` for the same reason.
 */
export function classifyBillingPeriod(
  elapsedMonths: number,
  paidMonthsSnapshot: number,
  bonusMonthsSnapshot: number
): BillingPeriodClassification {
  if (elapsedMonths < 0) return 'expired';
  if (elapsedMonths < paidMonthsSnapshot) return 'paid';
  if (elapsedMonths < paidMonthsSnapshot + bonusMonthsSnapshot) return 'bonus';
  return 'expired';
}
