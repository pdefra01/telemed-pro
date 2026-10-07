/**
 * Local calendar-day helpers.
 *
 * Calendar days are kept as `YYYY-MM-DD` strings in the user's local timezone.
 * Never derive them with `toISOString()`, which yields the UTC day (from 21:00
 * in Argentina, UTC-3, that is already tomorrow).
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar day of `d` as `YYYY-MM-DD`. */
export function toLocalDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of the `YYYY-MM-DD` day. */
export function parseLocalDate(s: string): Date {
  const [year, month, day] = s.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The `YYYY-MM-DD` day `n` calendar days after `s` (negative goes back). */
export function addDaysLocal(s: string, n: number): string {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}
