import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionService } from '../SubscriptionService';
import { Patient, Plan, SystemSettings } from '../../types';

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    service = new SubscriptionService();
  });

  describe('canAccessConsultation', () => {
    it('should allow access if status is paid', () => {
      const patient: Partial<Patient> = {
        paymentStatus: 'paid',
        planStatus: 'active'
      };
      const settings: SystemSettings[] = []; // Default behavior
      
      expect(service.canAccessConsultation(patient as Patient, settings)).toBe(true);
    });

    it('should block access if status is overdue and policy is "block"', () => {
      const patient: Partial<Patient> = {
        paymentStatus: 'overdue',
        planStatus: 'active'
      };
      const settings: SystemSettings[] = [
        { key: 'delinquency_policy', value: 'block' }
      ];
      
      expect(service.canAccessConsultation(patient as Patient, settings)).toBe(false);
    });

    it('should allow access if status is overdue but policy is "grace_period"', () => {
      const patient: Partial<Patient> = {
        paymentStatus: 'overdue',
        planStatus: 'active'
      };
      const settings: SystemSettings[] = [
        { key: 'delinquency_policy', value: 'grace_period' }
      ];
      
      expect(service.canAccessConsultation(patient as Patient, settings)).toBe(true);
    });

    it('should block access if planStatus is suspended regardless of payment', () => {
      const patient: Partial<Patient> = {
        paymentStatus: 'paid',
        planStatus: 'suspended'
      };
      
      expect(service.canAccessConsultation(patient as Patient, [])).toBe(false);
    });
  });

  describe('isQuotaAvailable', () => {
    it('should return true if currentPeriodQuotaUsed < bonifiedConsultations', () => {
      const patient: Partial<Patient> = {
        currentPeriodQuotaUsed: 2
      };
      const plan: Partial<Plan> = {
        bonifiedConsultations: 5
      };
      
      expect(service.isQuotaAvailable(patient as Patient, plan as Plan)).toBe(true);
    });

    it('should return false if quota is exhausted', () => {
      const patient: Partial<Patient> = {
        currentPeriodQuotaUsed: 5
      };
      const plan: Partial<Plan> = {
        bonifiedConsultations: 5
      };
      
      expect(service.isQuotaAvailable(patient as Patient, plan as Plan)).toBe(false);
    });
  });
});
