import { describe, it, expect } from 'vitest';
import { resolveBonifiedConsultations, isValidPaidMonths, isValidBonusMonths } from '../PlanFormModal';

describe('resolveBonifiedConsultations', () => {
  it('forces 0 when the plan is unlimited, regardless of the raw field value', () => {
    expect(resolveBonifiedConsultations(true, 10)).toBe(0);
    expect(resolveBonifiedConsultations(true, 0)).toBe(0);
    expect(resolveBonifiedConsultations(true, -5)).toBe(0);
  });

  it('keeps the finite value when the plan is not unlimited', () => {
    expect(resolveBonifiedConsultations(false, 6)).toBe(6);
  });

  it('keeps 0 as a distinct, valid finite value (never conflated with unlimited)', () => {
    expect(resolveBonifiedConsultations(false, 0)).toBe(0);
  });

  it('falls back to 0 for negative or non-finite raw values on a finite plan', () => {
    expect(resolveBonifiedConsultations(false, -1)).toBe(0);
    expect(resolveBonifiedConsultations(false, NaN)).toBe(0);
  });

  it('truncates fractional input to a whole number', () => {
    expect(resolveBonifiedConsultations(false, 6.9)).toBe(6);
  });
});

describe('isValidPaidMonths', () => {
  it('accepts 1 and any greater whole number, matching the DB CHECK(paid_months >= 1)', () => {
    expect(isValidPaidMonths(1)).toBe(true);
    expect(isValidPaidMonths(12)).toBe(true);
  });

  it('rejects 0, negative values, and non-finite values', () => {
    expect(isValidPaidMonths(0)).toBe(false);
    expect(isValidPaidMonths(-1)).toBe(false);
    expect(isValidPaidMonths(NaN)).toBe(false);
  });
});

describe('isValidBonusMonths', () => {
  it('accepts 0 and any greater whole number, matching the DB CHECK(bonus_months >= 0)', () => {
    expect(isValidBonusMonths(0)).toBe(true);
    expect(isValidBonusMonths(2)).toBe(true);
  });

  it('rejects negative values and non-finite values', () => {
    expect(isValidBonusMonths(-1)).toBe(false);
    expect(isValidBonusMonths(NaN)).toBe(false);
  });
});
