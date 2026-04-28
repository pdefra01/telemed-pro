import { describe, it, expect } from 'vitest';
import { subscriptionService } from '../SubscriptionService';
import { Patient, SystemSettings } from '../../types';

describe('SubscriptionService - Policy Propagation', () => {
  const mockPatient: Patient = {
    id: 'p1',
    name: 'Juan Perez',
    planStatus: 'active',
    paymentStatus: 'overdue', // El paciente tiene deuda
    currentPeriodQuotaUsed: 0,
    type: 'affiliate',
    email: 'juan@example.com'
  } as any;

  it('should ALLOW access when policy is grace_period', () => {
    const settings: SystemSettings[] = [
      { key: 'delinquency_policy', value: 'grace_period' }
    ];

    const result = subscriptionService.canAccessConsultation(mockPatient, settings);
    expect(result).toBe(true);
  });

  it('should BLOCK access when policy is block', () => {
    const settings: SystemSettings[] = [
      { key: 'delinquency_policy', value: 'block' }
    ];

    const result = subscriptionService.canAccessConsultation(mockPatient, settings);
    expect(result).toBe(false);
  });

  it('should BLOCK access when patient is suspended regardless of policy', () => {
    const suspendedPatient = { ...mockPatient, planStatus: 'suspended' } as Patient;
    const settings: SystemSettings[] = [
      { key: 'delinquency_policy', value: 'grace_period' }
    ];

    const result = subscriptionService.canAccessConsultation(suspendedPatient, settings);
    expect(result).toBe(false);
  });

  it('should ALLOW access when patient is paid regardless of policy', () => {
    const paidPatient = { ...mockPatient, paymentStatus: 'paid' } as Patient;
    const settings: SystemSettings[] = [
      { key: 'delinquency_policy', value: 'block' }
    ];

    const result = subscriptionService.canAccessConsultation(paidPatient, settings);
    expect(result).toBe(true);
  });
});
