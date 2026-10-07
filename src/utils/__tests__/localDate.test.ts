import { describe, it, expect } from 'vitest';
import { toLocalDateStr, parseLocalDate, addDaysLocal } from '../localDate';

describe('test timezone', () => {
  it('runs in America/Argentina/Buenos_Aires (UTC-3)', () => {
    expect(new Date('2026-10-07T00:30:00Z').getDate()).toBe(6);
  });
});

describe('toLocalDateStr', () => {
  it('returns the local calendar day, not the UTC day, late in the evening', () => {
    // 21:30 local on 06/10 is already 00:30Z on 07/10.
    expect(toLocalDateStr(new Date(2026, 9, 6, 21, 30))).toBe('2026-10-06');
  });

  it('zero-pads month and day', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local midnight of that day', () => {
    const d = parseLocalDate('2026-10-06');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('round-trips with toLocalDateStr', () => {
    expect(toLocalDateStr(parseLocalDate('2026-02-28'))).toBe('2026-02-28');
  });
});

describe('addDaysLocal', () => {
  it('adds days within a month', () => {
    expect(addDaysLocal('2026-10-06', 1)).toBe('2026-10-07');
  });

  it('rolls over the end of a month', () => {
    expect(addDaysLocal('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysLocal('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('rolls over the end of a year', () => {
    expect(addDaysLocal('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('subtracts days with negative values', () => {
    expect(addDaysLocal('2027-01-01', -1)).toBe('2026-12-31');
  });
});
