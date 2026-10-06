import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Affiliates from '../Affiliates';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { adhesionRepository, AdhesionRequest } from '../../../repositories/AdhesionRepository';

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
    getPendingApplications: vi.fn(),
    resendActivationEmail: vi.fn(),
    approveApplication: vi.fn(),
    releaseStuckActivation: vi.fn(),
  },
}));

vi.mock('../../../repositories/PlanRepository', () => ({
  planRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));

const mockToast = vi.fn();
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

const request = (overrides: Partial<AdhesionRequest> = {}): AdhesionRequest => ({
  id: 'req-1',
  titular_name: 'Ana Gómez',
  titular_first_name: 'Ana',
  titular_last_name: 'Gómez',
  titular_dni: '30111222',
  titular_birth_date: '1990-01-01',
  titular_address: 'Calle 1',
  titular_locality: 'Centro',
  titular_neighborhood: 'Centro',
  titular_email: 'ana@test.com',
  titular_phone: '3510000000',
  titular_civil_status: 'Soltera',
  payment_method: 'mercadopago',
  plan_type: 'Plan Familiar',
  family_members: [],
  medical_history: [],
  consent_data_treatment: true,
  consent_promotions: false,
  signature_base64: '',
  status: 'pending',
  email_verified: true,
  created_at: minutesAgo(60),
  ...overrides,
});

async function openRequestsTab() {
  render(React.createElement(Affiliates));
  fireEvent.click(await screen.findByText('Solicitudes de Adhesión (QR)'));
}

async function openRequestModal() {
  await openRequestsTab();
  fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
  await screen.findByText('Revisar Solicitud de Adhesión');
}

describe('Liberar activación trabada', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([]);
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('shows the stuck badge and the Liberar action for a stale claim, with Aprobar disabled', async () => {
    vi.mocked(adhesionRepository.getPendingApplications).mockResolvedValue([
      request({ activation_claimed_at: minutesAgo(30) }),
    ]);
    await openRequestsTab();
    expect(await screen.findByText('Activación trabada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(await screen.findByRole('button', { name: /Liberar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aprobar y Registrar/ })).toBeDisabled();
  });

  it('shows "Activando…" and keeps Aprobar disabled while the claim is fresh, without Liberar', async () => {
    vi.mocked(adhesionRepository.getPendingApplications).mockResolvedValue([
      request({ activation_claimed_at: minutesAgo(2) }),
    ]);
    await openRequestModal();

    const approve = screen.getByRole('button', { name: /Activando…/ });
    expect(approve).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Liberar/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Activación trabada')).not.toBeInTheDocument();
  });

  it('leaves an unclaimed request untouched (Aprobar enabled, no badge, no Liberar)', async () => {
    vi.mocked(adhesionRepository.getPendingApplications).mockResolvedValue([request()]);
    await openRequestModal();

    expect(screen.getByRole('button', { name: /Aprobar y Registrar/ })).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: /Liberar/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Activación trabada')).not.toBeInTheDocument();
  });

  it('asks for confirmation, releases, refreshes the list and shows a success message', async () => {
    vi.mocked(adhesionRepository.getPendingApplications)
      .mockResolvedValueOnce([request({ activation_claimed_at: minutesAgo(30) })])
      .mockResolvedValue([request()]);
    vi.mocked(adhesionRepository.releaseStuckActivation).mockResolvedValue({ deletedUserId: 'u-1' });
    await openRequestModal();

    fireEvent.click(screen.getByRole('button', { name: /Liberar/ }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/cuenta de acceso incompleta/i));
    await waitFor(() => expect(adhesionRepository.releaseStuckActivation).toHaveBeenCalledWith('req-1'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/liberada/i), 'success'));
    await waitFor(() => expect(adhesionRepository.getPendingApplications).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /Aprobar y Registrar/ })).not.toBeDisabled());
  });

  it('does nothing when the confirmation is cancelled', async () => {
    confirmSpy.mockReturnValue(false);
    vi.mocked(adhesionRepository.getPendingApplications).mockResolvedValue([
      request({ activation_claimed_at: minutesAgo(30) }),
    ]);
    await openRequestModal();

    fireEvent.click(screen.getByRole('button', { name: /Liberar/ }));
    expect(adhesionRepository.releaseStuckActivation).not.toHaveBeenCalled();
  });

  it('shows the server error when the release is refused', async () => {
    vi.mocked(adhesionRepository.getPendingApplications).mockResolvedValue([
      request({ activation_claimed_at: minutesAgo(30) }),
    ]);
    vi.mocked(adhesionRepository.releaseStuckActivation).mockRejectedValue(
      new Error('La cuenta no se puede borrar de forma segura.'),
    );
    await openRequestModal();

    fireEvent.click(screen.getByRole('button', { name: /Liberar/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('La cuenta no se puede borrar de forma segura.', 'error'));
  });
});
