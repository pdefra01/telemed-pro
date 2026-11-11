import { describe, it, expect } from 'vitest';
import { monthStart, shiftMonth, formatMonthLabel } from '../month';

describe('month helpers', () => {
  it('returns the first day of the month of a date', () => {
    expect(monthStart(new Date(2026, 9, 17))).toBe('2026-10-01');
    expect(monthStart(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(monthStart(new Date(2026, 11, 31))).toBe('2026-12-01');
  });

  it('moves a month start forward and backward across year boundaries', () => {
    expect(shiftMonth('2026-10-01', 1)).toBe('2026-11-01');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-03-01', 0)).toBe('2026-03-01');
  });

  it('formats a month start as a Spanish label', () => {
    expect(formatMonthLabel('2026-10-01').toLowerCase()).toContain('octubre');
    expect(formatMonthLabel('2026-10-01')).toContain('2026');
  });
});
