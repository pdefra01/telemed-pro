import { describe, it, expect } from 'vitest';
import { isAffiliate } from '../affiliate';
import { Role, User } from '../../types';

const user = (role: Role, planId?: string): User => ({ id: 'u-1', name: 'Test', email: 't@test.local', role, planId });

describe('isAffiliate', () => {
  it('is true for a patient', () => {
    expect(isAffiliate(user('patient'))).toBe(true);
  });

  it('is true for an advisor that holds a plan', () => {
    expect(isAffiliate(user('advisor', 'plan-1'))).toBe(true);
  });

  it('is false for an advisor without a plan', () => {
    expect(isAffiliate(user('advisor'))).toBe(false);
  });

  it.each<Role>(['doctor', 'admin', 'supervisor'])('is false for a %s even with a plan', (role) => {
    expect(isAffiliate(user(role, 'plan-1'))).toBe(false);
  });

  it('is false without a user', () => {
    expect(isAffiliate(null)).toBe(false);
  });
});
