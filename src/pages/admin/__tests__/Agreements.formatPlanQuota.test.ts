import { describe, it, expect } from 'vitest';
import { formatPlanQuota } from '../Agreements';

describe('formatPlanQuota', () => {
  it('renders the infinity symbol for unlimited plans', () => {
    expect(formatPlanQuota({ isUnlimited: true, bonifiedConsultations: 6 })).toBe('∞');
  });

  it('renders the finite number for non-unlimited plans', () => {
    expect(formatPlanQuota({ isUnlimited: false, bonifiedConsultations: 6 })).toBe('6');
  });

  it('renders 0 as a distinct finite value, never conflated with unlimited', () => {
    expect(formatPlanQuota({ isUnlimited: false, bonifiedConsultations: 0 })).toBe('0');
  });
});
