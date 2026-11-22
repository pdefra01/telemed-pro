import type { Appointment } from '../../types';

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Most recent consultation first; `scheduledAt` is the exact ISO instant. */
export function newestFirst(appointments: Appointment[]): Appointment[] {
  return [...appointments].sort(
    (x, y) => new Date(y.scheduledAt ?? 0).getTime() - new Date(x.scheduledAt ?? 0).getTime()
  );
}

const digits = (value: string) => value.replace(/\D/g, '');

export interface HistoryFilter {
  /**
   * Part of the titular's or attended member's name (accents and case ignored)
   * or of their DNI (dots and spaces ignored).
   */
  name?: string;
  /** Local day, YYYY-MM-DD (same shape as Appointment.date). */
  date?: string;
}

function matchesPerson(apt: Appointment, search: string): boolean {
  const needle = normalize(search);
  const names = [apt.patientName, apt.familyMemberName].filter(Boolean) as string[];
  if (names.some((n) => normalize(n).includes(needle))) return true;
  // Only a search made of digits, dots and spaces is a DNI search.
  if (!/^[\d.\s]+$/.test(search)) return false;
  const dniNeedle = digits(search);
  if (!dniNeedle) return false;
  const dnis = [apt.patientDni, apt.familyMemberDni].filter(Boolean) as string[];
  return dnis.some((dni) => digits(dni).includes(dniNeedle));
}

export function filterHistory(appointments: Appointment[], { name, date }: HistoryFilter): Appointment[] {
  const search = name?.trim() ?? '';
  return appointments.filter(
    (apt) => (!search || matchesPerson(apt, search)) && (!date || apt.date === date)
  );
}
