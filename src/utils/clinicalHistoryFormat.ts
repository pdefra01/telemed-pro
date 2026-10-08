/**
 * Display helpers for clinical history (medical records, prescriptions,
 * documents).
 *
 * History dates come in two shapes: `DATE` columns as `YYYY-MM-DD` and
 * `TIMESTAMPTZ` columns as ISO strings. `new Date('YYYY-MM-DD')` is UTC
 * midnight, which in Argentina (UTC-3) is the previous day, so date-only
 * values go through `parseLocalDate` instead.
 */
import { parseLocalDate } from './localDate';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number): string => String(n).padStart(2, '0');

function toLocalDate(value: string): Date | null {
  const d = DATE_ONLY.test(value) ? parseLocalDate(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar day as `dd/mm/yyyy`; '' when missing, the raw value when unparseable. */
export function formatHistoryDate(value?: string | null): string {
  if (!value) return '';
  const d = toLocalDate(value);
  if (!d) return value;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Like `formatHistoryDate`, adding local `HH:mm` (24h) for timestamps. Date-only values have no time. */
export function formatHistoryDateTime(value?: string | null): string {
  if (!value) return '';
  const day = formatHistoryDate(value);
  if (DATE_ONLY.test(value)) return day;
  const d = toLocalDate(value);
  if (!d) return value;
  return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Spanish labels for `medical_records.type` (CHECK: consultation, emergency, checkup). */
const VISIT_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consulta Médica',
  checkup: 'Chequeo General',
  emergency: 'Atención Urgente',
};

/** Spanish label for a visit type; unknown values become readable ("follow_up" → "Follow up"). */
export function visitTypeLabel(type?: string | null): string {
  if (!type) return '';
  const key = type.trim().toLowerCase();
  const known = VISIT_TYPE_LABELS[key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
