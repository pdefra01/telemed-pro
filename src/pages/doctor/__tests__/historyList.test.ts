import { describe, it, expect } from 'vitest';
import { newestFirst, filterHistory } from '../historyList';
import type { Appointment } from '../../../types';

const appt = (id: string, patientName: string, scheduledAt: string, date: string): Appointment => ({
  id,
  patientId: `p-${id}`,
  patientName,
  doctorId: 'd1',
  doctorName: 'Dr. X',
  date,
  time: '10:00',
  scheduledAt,
  status: 'completed',
  type: 'video',
});

const a = appt('a', 'Ana Pérez', '2026-10-28T13:00:00.000Z', '2026-10-28');
const b = appt('b', 'Luis Gómez', '2026-11-02T14:00:00.000Z', '2026-11-02');
const c = appt('c', 'Ana Pérez', '2026-11-02T09:00:00.000Z', '2026-11-02');

describe('newestFirst', () => {
  it('orders by date and time, most recent first', () => {
    expect(newestFirst([a, c, b]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input', () => {
    const input = [a, b];
    newestFirst(input);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('filterHistory', () => {
  it('matches the patient name ignoring case and accents', () => {
    expect(filterHistory([a, b, c], { name: 'ana perez' }).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('matches a partial name', () => {
    expect(filterHistory([a, b, c], { name: 'gom' }).map((x) => x.id)).toEqual(['b']);
  });

  it('filters by exact date', () => {
    expect(filterHistory([a, b, c], { date: '2026-11-02' }).map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('combines name and date', () => {
    expect(filterHistory([a, b, c], { name: 'ana', date: '2026-11-02' }).map((x) => x.id)).toEqual(['c']);
  });

  it('returns everything when no filter is set', () => {
    expect(filterHistory([a, b, c], {})).toHaveLength(3);
  });
});
