import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Affiliates from '../Affiliates';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { adhesionRepository } from '../../../repositories/AdhesionRepository';
import { Patient } from '../../../types';

const patient: Patient = {
  id: 'p1',
  name: 'Juan Pérez',
  email: 'juan@test.com',
  role: 'patient',
  planStatus: 'active',
  paymentStatus: 'current',
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
  adhesionRepository: {
    getPendingApplications: vi.fn().mockResolvedValue([]),
    resendActivationEmail: vi.fn(),
  },
}));

vi.mock('../../../repositories/PlanRepository', () => ({
  planRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));

const mockToast = vi.fn();
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('Reenviar mail de activación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([patient]);
    vi.mocked(affiliateRepository.getConsultationQuotaStatus).mockResolvedValue({ coverageActive: true } as any);
  });

  it('shows a success toast with the row email', async () => {
    vi.mocked(adhesionRepository.resendActivationEmail).mockResolvedValue(undefined);
    render(React.createElement(Affiliates));
    fireEvent.click(await screen.findByTitle('Reenviar mail de activación'));
    await waitFor(() => expect(adhesionRepository.resendActivationEmail).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Mail de activación enviado a juan@test.com', 'success'));
  });

  it('shows the server error as an error toast', async () => {
    vi.mocked(adhesionRepository.resendActivationEmail).mockRejectedValue(new Error('Esperá 40 segundos.'));
    render(React.createElement(Affiliates));
    fireEvent.click(await screen.findByTitle('Reenviar mail de activación'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Esperá 40 segundos.', 'error'));
  });

  it('disables the button while the request is in flight', async () => {
    let resolve!: () => void;
    vi.mocked(adhesionRepository.resendActivationEmail).mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(React.createElement(Affiliates));
    const button = await screen.findByTitle('Reenviar mail de activación');
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    resolve();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
