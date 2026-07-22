import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Affiliates, { shouldShowRenewCoverage } from '../Affiliates';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { Patient } from '../../../types';

const basePatient: Patient = {
  id: 'p1',
  name: 'Juan Pérez',
  email: 'juan@test.com',
  role: 'patient',
  planStatus: 'active',
  paymentStatus: 'paid',
  currentPeriodQuotaUsed: 0,
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

const mockToast = vi.fn();
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('shouldShowRenewCoverage', () => {
  it('shows the action when the affiliate has a plan and its coverage is known to be expired', () => {
    const patient = { ...basePatient, planId: 'plan-1' };
    expect(shouldShowRenewCoverage(patient, { p1: false })).toBe(true);
  });

  it('hides the action when coverage is active', () => {
    const patient = { ...basePatient, planId: 'plan-1' };
    expect(shouldShowRenewCoverage(patient, { p1: true })).toBe(false);
  });

  it('hides the action when the affiliate has no plan assigned at all', () => {
    const patient = { ...basePatient, planId: undefined };
    expect(shouldShowRenewCoverage(patient, { p1: false })).toBe(false);
  });

  it('hides the action when coverage status has not been fetched yet (never assume expired)', () => {
    const patient = { ...basePatient, planId: 'plan-1' };
    expect(shouldShowRenewCoverage(patient, {})).toBe(false);
  });
});

describe('Renovar Cobertura — full click flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const expiredPatient: Patient = { ...basePatient, planId: 'plan-1' };

  it('clicking the button calls renewCoverageWindow, shows a success toast and reloads the list', async () => {
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([expiredPatient]);
    vi.mocked(affiliateRepository.getConsultationQuotaStatus).mockResolvedValue({
      quotaUsed: 0, totalBonified: null, remaining: null, isUnlimited: false,
      hasPlan: true, isOverQuota: false, planName: 'Plan Familiar Medinex',
      coverageActive: false, paidThrough: null, periodStart: null,
    } as any);
    vi.mocked(affiliateRepository.renewCoverageWindow).mockResolvedValue({
      paidThrough: '2027-01-01T00:00:00.000Z', periodStart: '2026-07-01T00:00:00.000Z',
      grantedQuota: 6, isUnlimited: false,
    });

    render(React.createElement(Affiliates));

    const renewButton = await screen.findByTitle('Renovar Cobertura');
    fireEvent.click(renewButton);

    await waitFor(() => {
      expect(affiliateRepository.renewCoverageWindow).toHaveBeenCalledWith('p1');
    });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('renovada con éxito'), 'success');
    // Reloads the affiliate list (and with it, coverage status) after renewing.
    await waitFor(() => {
      expect(affiliateRepository.getAllAffiliates).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the RPC error message in a toast when renewal fails, without crashing', async () => {
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([expiredPatient]);
    vi.mocked(affiliateRepository.getConsultationQuotaStatus).mockResolvedValue({
      quotaUsed: 0, totalBonified: null, remaining: null, isUnlimited: false,
      hasPlan: true, isOverQuota: false, planName: 'Plan Familiar Medinex',
      coverageActive: false, paidThrough: null, periodStart: null,
    } as any);
    vi.mocked(affiliateRepository.renewCoverageWindow).mockRejectedValue(
      new Error('La ventana de cobertura todavía no expiró')
    );

    render(React.createElement(Affiliates));

    const renewButton = await screen.findByTitle('Renovar Cobertura');
    fireEvent.click(renewButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('La ventana de cobertura todavía no expiró', 'error');
    });
  });

  it('does not render the renew button when coverage status has not resolved yet, even with a plan assigned', async () => {
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([expiredPatient]);
    // Never resolves within the test — simulates a still-pending coverage check.
    vi.mocked(affiliateRepository.getConsultationQuotaStatus).mockReturnValue(new Promise(() => {}));

    render(React.createElement(Affiliates));

    await screen.findByText('Juan Pérez');
    expect(screen.queryByTitle('Renovar Cobertura')).not.toBeInTheDocument();
  });
});
