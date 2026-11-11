import { describe, it, expect } from 'vitest';
import { progressPercent, conversionRate, formatCurrency } from '../performance';

describe('performance helpers', () => {
  it('computes goal progress as a rounded percentage capped at 100', () => {
    expect(progressPercent(4, 6)).toBe(67);
    expect(progressPercent(3500, 4000)).toBe(88);
    expect(progressPercent(0, 5)).toBe(0);
    expect(progressPercent(9, 6)).toBe(100);
  });

  it('has no progress without a usable goal', () => {
    expect(progressPercent(4, undefined)).toBe(0);
    expect(progressPercent(4, 0)).toBe(0);
  });

  it('computes the conversion rate as a rounded percentage, or null with no prospects', () => {
    expect(conversionRate(1, 4)).toBe(25);
    expect(conversionRate(1, 3)).toBe(33);
    expect(conversionRate(0, 4)).toBe(0);
    expect(conversionRate(0, 0)).toBeNull();
  });

  it('formats money as whole Argentine pesos', () => {
    expect(formatCurrency(3500)).toMatch(/3\.500/);
    expect(formatCurrency(3500)).toContain('$');
    expect(formatCurrency(0)).toMatch(/0/);
  });
});
