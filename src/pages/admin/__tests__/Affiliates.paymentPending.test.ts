import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import Affiliates, { shouldShowPaymentPending } from '../Affiliates';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { Patient } from '../../../types';

const basePatient: Patient = {
  id: 'p1',
  name: 'Hebe Trillo',
  email: 'hebe@test.com',
  role: 'patient',
  isActive: true,
  planStatus: 'active',
  paymentStatus: 'current',
  currentPeriodQuotaUsed: 0,
  planId: 'plan-1',
};

vi.mock('../../../repositories/AffiliateRepository', () => ({
  affiliateRepository: {
    getAllAffiliates: vi.fn(),
    getConsultationQuotaStatus: vi.fn(),
    renewCoverageWindow: vi.fn(),
  },
  PlanAssignmentFailedError: class extends Error {},
  ProfileFieldsUpdateFailedError: class extends Error {},
}));

vi.mock('../../../repositories/AdhesionRepository', () => ({
  adhesionRepository: { getPendingApplications: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../../repositories/PlanRepository', () => ({
  planRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const status = (overrides: Record<string, unknown>) =>
  ({
    quotaUsed: 0, totalBonified: null, remaining: null, isUnlimited: false,
    hasPlan: true, isOverQuota: false, planName: 'Plan Individual',
    coverageActive: false, paidThrough: null, periodStart: null,
    ...overrides,
  }) as any;

describe('shouldShowPaymentPending', () => {
  it('shows for an affiliate with a plan whose coverage was never opened', () => {
    expect(shouldShowPaymentPending(basePatient, { p1: true })).toBe(true);
  });

  it('hides when a coverage window exists, or when it has not been checked yet', () => {
    expect(shouldShowPaymentPending(basePatient, { p1: false })).toBe(false);
    expect(shouldShowPaymentPending(basePatient, {})).toBe(false);
  });

  it('hides for an affiliate with no plan', () => {
    expect(shouldShowPaymentPending({ ...basePatient, planId: undefined }, { p1: true })).toBe(false);
  });
});

describe('Affiliates — débito/pago aún no realizado', () => {
  beforeEach(() => vi.clearAllMocks());

  it('labels an affiliate whose coverage was never opened', async () => {
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([basePatient]);
    vi.mocked(affiliateRepository.getConsultationQuotaStatus).mockResolvedValue(status({}));

    render(React.createElement(Affiliates));

    expect(await screen.findByText('Débito/pago aún no realizado')).toBeInTheDocument();
  });

  it('does not label an affiliate whose coverage expired (window exists)', async () => {
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([basePatient]);
    vi.mocked(affiliateRepository.getConsultationQuotaStatus).mockResolvedValue(
      status({ paidThrough: '2026-01-01T00:00:00.000Z', periodStart: '2025-12-01T00:00:00.000Z' })
    );

    render(React.createElement(Affiliates));

    await screen.findByTitle('Renovar Cobertura');
    expect(screen.queryByText('Débito/pago aún no realizado')).not.toBeInTheDocument();
  });
});
