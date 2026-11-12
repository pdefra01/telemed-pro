import { describe, it, expect } from 'vitest';
import { argentinaMonth, closedMonths } from '../commissions';

describe('commission months (Argentina time)', () => {
  it('takes the current month in Argentina, not in UTC', () => {
    // 2026-12-01 02:00 UTC is still November 30 in Argentina (UTC-3)
    expect(argentinaMonth(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11-01');
    expect(argentinaMonth(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12-01');
  });

  it('lists only closed months, newest first', () => {
    expect(closedMonths(new Date('2026-11-12T15:00:00Z'), 3)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01']);
  });

  it('crosses the year boundary', () => {
    expect(closedMonths(new Date('2027-01-10T15:00:00Z'), 2)).toEqual(['2026-12-01', '2026-11-01']);
  });
});
