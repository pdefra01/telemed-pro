import { describe, it, expect } from 'vitest';
import { calculateElapsedMonths, classifyBillingPeriod } from '../CoverageWindowBilling';

describe('calculateElapsedMonths', () => {
  it('returns 0 when the billed period is the same calendar month the window opened', () => {
    expect(calculateElapsedMonths('2026-07-15T00:00:00.000Z', '2026-07')).toBe(0);
  });

  it('counts whole calendar months forward from the window opening month', () => {
    expect(calculateElapsedMonths('2026-07-15T00:00:00.000Z', '2026-09')).toBe(2);
  });

  it('rolls over correctly across a year boundary', () => {
    expect(calculateElapsedMonths('2026-12-01T00:00:00.000Z', '2027-01')).toBe(1);
  });

  it('returns a negative number for a period that predates the window opening', () => {
    expect(calculateElapsedMonths('2026-07-15T00:00:00.000Z', '2026-05')).toBe(-2);
  });
});

describe('classifyBillingPeriod', () => {
  it('classifies an elapsed month within the paid portion as "paid"', () => {
    expect(classifyBillingPeriod(0, 12, 2)).toBe('paid');
    expect(classifyBillingPeriod(11, 12, 2)).toBe('paid');
  });

  it('classifies an elapsed month within the bonus portion as "bonus"', () => {
    expect(classifyBillingPeriod(12, 12, 2)).toBe('bonus');
    expect(classifyBillingPeriod(13, 12, 2)).toBe('bonus');
  });

  it('classifies an elapsed month beyond paid+bonus as "expired"', () => {
    expect(classifyBillingPeriod(14, 12, 2)).toBe('expired');
  });

  it('classifies a negative elapsed (period before window opened) as "expired" — never fabricates a charge', () => {
    expect(classifyBillingPeriod(-1, 12, 2)).toBe('expired');
  });

  it('handles a plan with zero bonus months (paid-only plan)', () => {
    expect(classifyBillingPeriod(0, 1, 0)).toBe('paid');
    expect(classifyBillingPeriod(1, 1, 0)).toBe('expired');
  });
});
