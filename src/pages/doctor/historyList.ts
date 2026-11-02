import type { Appointment } from '../../types';

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Most recent consultation first; `scheduledAt` is the exact ISO instant. */
export function newestFirst(appointments: Appointment[]): Appointment[] {
  return [...appointments].sort(
    (x, y) => new Date(y.scheduledAt ?? 0).getTime() - new Date(x.scheduledAt ?? 0).getTime()
  );
}

export interface HistoryFilter {
  /** Part of the patient name, accents and case ignored. */
  name?: string;
  /** Local day, YYYY-MM-DD (same shape as Appointment.date). */
  date?: string;
}

export function filterHistory(appointments: Appointment[], { name, date }: HistoryFilter): Appointment[] {
  const needle = name ? normalize(name) : '';
  return appointments.filter(
    (apt) => (!needle || normalize(apt.patientName).includes(needle)) && (!date || apt.date === date)
  );
}
