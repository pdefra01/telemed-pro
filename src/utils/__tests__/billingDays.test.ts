import { describe, it, expect } from 'vitest';
import { billingDayLabel, DEFAULT_BILLING_DAYS, RECOMMENDED_BILLING_DAY } from '../billingDays';

describe('billingDayLabel', () => {
  it('describes day 10 as the 1-to-10 range for active employees', () => {
    expect(billingDayLabel(10)).toBe('Del 1 al 10 (empleados en actividad) · se cobra el día 10');
  });

  it('describes day 20 as the 10-to-20 range for retirees', () => {
    expect(billingDayLabel(20)).toBe('Del 10 al 20 (jubilados) · se cobra el día 20');
  });

  it('falls back to a plain label for any other configured day', () => {
    expect(billingDayLabel(5)).toBe('Día 5 de cada mes');
  });

  it('offers the two ranges by default and recommends day 10', () => {
    expect(DEFAULT_BILLING_DAYS).toEqual([10, 20]);
    expect(RECOMMENDED_BILLING_DAY).toBe(10);
  });
});
