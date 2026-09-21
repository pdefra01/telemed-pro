/**
 * Monthly debit days offered at sign-up. Each option is a range of the month in
 * which the affiliate is paid, and the charge falls on the last day of that range:
 *   - 1 to 10  (active employees) -> charged on day 10
 *   - 10 to 20 (retirees)         -> charged on day 20
 * The list itself lives in system_settings ('debit_billing_days') so an admin can change it.
 */
export const DEFAULT_BILLING_DAYS = [10, 20];
export const RECOMMENDED_BILLING_DAY = 10;

const RANGE_LABELS: Record<number, string> = {
  10: 'Del 1 al 10 (empleados en actividad) · se cobra el día 10',
  20: 'Del 10 al 20 (jubilados) · se cobra el día 20',
};

export function billingDayLabel(day: number): string {
  return RANGE_LABELS[day] ?? `Día ${day} de cada mes`;
}
