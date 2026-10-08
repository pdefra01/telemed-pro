import { describe, it, expect } from 'vitest';
import { formatHistoryDate, formatHistoryDateTime, visitTypeLabel } from '../clinicalHistoryFormat';

// Tests run in America/Argentina/Buenos_Aires (UTC-3), pinned in vite.config.ts.

describe('formatHistoryDate', () => {
  it('formats a date-only value on the same calendar day (no UTC shift)', () => {
    // new Date('2026-08-26') is UTC midnight, i.e. 25/08 21:00 in Argentina.
    expect(formatHistoryDate('2026-08-26')).toBe('26/08/2026');
  });

  it('formats a timestamp on its local calendar day', () => {
    expect(formatHistoryDate('2026-08-26T19:30:00+00:00')).toBe('26/08/2026');
  });

  it('uses the local day when the UTC day is already the next one', () => {
    // 01:30Z on 27/08 is 22:30 on 26/08 in Argentina.
    expect(formatHistoryDate('2026-08-27T01:30:00Z')).toBe('26/08/2026');
  });

  it('zero-pads day and month', () => {
    expect(formatHistoryDate('2026-01-05')).toBe('05/01/2026');
  });

  it('returns an empty string for missing values and the raw value when unparseable', () => {
    expect(formatHistoryDate(null)).toBe('');
    expect(formatHistoryDate(undefined)).toBe('');
    expect(formatHistoryDate('')).toBe('');
    expect(formatHistoryDate('not a date')).toBe('not a date');
  });
});

describe('formatHistoryDateTime', () => {
  it('formats a timestamp as local dd/mm/yyyy HH:mm (24h)', () => {
    expect(formatHistoryDateTime('2026-08-26T19:30:00+00:00')).toBe('26/08/2026 16:30');
  });

  it('shows only the day for a date-only value (it has no time)', () => {
    expect(formatHistoryDateTime('2026-08-26')).toBe('26/08/2026');
  });

  it('never crashes on missing values', () => {
    expect(formatHistoryDateTime(null)).toBe('');
  });
});

describe('visitTypeLabel', () => {
  it('translates the visit types allowed by medical_records.type', () => {
    expect(visitTypeLabel('consultation')).toBe('Consulta Médica');
    expect(visitTypeLabel('checkup')).toBe('Chequeo General');
    expect(visitTypeLabel('emergency')).toBe('Atención Urgente');
  });

  it('is case-insensitive', () => {
    expect(visitTypeLabel('CHECKUP')).toBe('Chequeo General');
  });

  it('falls back to a readable label for unknown values', () => {
    expect(visitTypeLabel('follow_up')).toBe('Follow up');
  });

  it('returns an empty string for missing values', () => {
    expect(visitTypeLabel(null)).toBe('');
    expect(visitTypeLabel(undefined)).toBe('');
    expect(visitTypeLabel('')).toBe('');
  });
});
