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

import {
  validateCatalogFields,
  mapPlanSaveError,
  buildNewVersionDraft,
  PAYMENT_OPTION_LABELS,
  PLAN_KIND_LABELS,
} from '../PlanFormModal';

describe('validateCatalogFields', () => {
  const ok = { isOffered: true, planKind: 'familiar', paymentOption: 'standard', commission: 25000 } as const;

  it('accepts a valid offered Familiar plan', () => {
    expect(validateCatalogFields(ok)).toBeNull();
  });

  it('requires kind and option when offered', () => {
    expect(validateCatalogFields({ ...ok, planKind: '' })).toMatch(/tipo/i);
    expect(validateCatalogFields({ ...ok, paymentOption: '' })).toMatch(/opci/i);
  });

  it('lets a withdrawn plan have no kind or option', () => {
    expect(validateCatalogFields({ ...ok, isOffered: false, planKind: '', paymentOption: '' })).toBeNull();
  });

  it('allows only the standard option for Individual', () => {
    expect(validateCatalogFields({ ...ok, planKind: 'individual', paymentOption: 'prepaid_6' })).toMatch(/individual/i);
    expect(validateCatalogFields({ ...ok, planKind: 'individual', paymentOption: 'standard' })).toBeNull();
  });

  it('rejects negative or non-finite commission', () => {
    expect(validateCatalogFields({ ...ok, commission: -1 })).toMatch(/comisi/i);
    expect(validateCatalogFields({ ...ok, commission: NaN })).toMatch(/comisi/i);
    expect(validateCatalogFields({ ...ok, commission: 0 })).toBeNull();
  });
});

describe('mapPlanSaveError', () => {
  it('explains the unique offered plan per kind+option violation', () => {
    expect(mapPlanSaveError({ code: '23505', message: 'duplicate key value violates unique constraint "plans_one_offered_per_option_idx"' }))
      .toMatch(/ya hay un plan ofrecido/i);
  });

  it('explains the in-use trigger', () => {
    expect(mapPlanSaveError({ message: 'El plan "X" esta en uso: no se pueden modificar su precio' }))
      .toMatch(/en uso/i);
  });

  it('falls back to the raw message, then a generic one', () => {
    expect(mapPlanSaveError({ message: 'algo' })).toBe('algo');
    expect(mapPlanSaveError(null)).toBe('Error al guardar el plan.');
  });
});

describe('buildNewVersionDraft', () => {
  it('prefills from the plan, is not offered and has a new name', () => {
    const draft = buildNewVersionDraft({
      id: 'a', name: 'Plan Familiar', monthlyCost: 49999, bonifiedConsultations: 0, isUnlimited: true,
      maxFamilyMembers: 4, isDefault: true, paidMonths: 1, bonusMonths: 0,
      planKind: 'familiar', paymentOption: 'standard', isOffered: true, advisorCommissionAmount: 25000,
    });
    expect(draft.name).toBe('Plan Familiar (nueva versión)');
    expect(draft.isOffered).toBe(false);
    expect(draft.isDefault).toBe(false);
    expect(draft.monthlyCost).toBe(49999);
    expect(draft.planKind).toBe('familiar');
    expect(draft.advisorCommissionAmount).toBe(25000);
    expect('id' in draft).toBe(false);
  });
});

describe('labels', () => {
  it('names kinds and options in Spanish', () => {
    expect(PLAN_KIND_LABELS.individual).toBe('Individual');
    expect(PAYMENT_OPTION_LABELS.card_debit).toBe('Débito tarjeta');
    expect(PAYMENT_OPTION_LABELS.prepaid_12).toBe('Anual');
  });
});
