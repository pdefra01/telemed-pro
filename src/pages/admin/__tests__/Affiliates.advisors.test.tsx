import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import Affiliates from '../Affiliates';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { Patient } from '../../../types';

vi.mock('../../../repositories/AffiliateRepository', () => ({
  affiliateRepository: {
    getAllAffiliates: vi.fn(),
    getConsultationQuotaStatus: vi.fn(),
    getDebitRejections: vi.fn(),
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

const patient = (over: Partial<Patient>): Patient => ({
  id: 'p1',
  name: 'Hebe Trillo',
  email: 'hebe@test.com',
  role: 'patient',
  isActive: true,
  planStatus: 'active',
  paymentStatus: 'current',
  currentPeriodQuotaUsed: 0,
  ...over,
});

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('Padrón de Afiliados: advisors with a plan (S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(affiliateRepository.getDebitRejections).mockResolvedValue({});
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([
      patient({}),
      patient({ id: 'a1', name: 'Ana Asesora', email: 'ana@test.com', isAdvisor: true, planId: 'plan-1' }),
    ]);
  });

  it('asks the repository for the advisors too', async () => {
    render(<Affiliates />);
    await waitFor(() => expect(affiliateRepository.getAllAffiliates).toHaveBeenCalledWith({ includeAdvisors: true }));
  });

  it('marks an active advisor as free of charge', async () => {
    render(<Affiliates />);
    await screen.findByText('Ana Asesora');
    expect(within(row('Ana Asesora')).getByText('Asesor · sin cargo')).toBeInTheDocument();
  });

  it('keeps the payment, activation and suspension actions away from an advisor (managed from the advisors screen)', async () => {
    render(<Affiliates />);
    await screen.findByText('Ana Asesora');
    const advisorRow = within(row('Ana Asesora'));
    expect(advisorRow.queryByTitle('Suspender')).not.toBeInTheDocument();
    expect(advisorRow.queryByTitle('Reenviar link de pago')).not.toBeInTheDocument();
    expect(advisorRow.queryByTitle('Reenviar mail de activación')).not.toBeInTheDocument();
    expect(advisorRow.getByTitle('Grupo familiar')).toBeInTheDocument();
    expect(advisorRow.getByTitle('Editar Perfil')).toBeInTheDocument();
  });

  it('still offers those actions for a regular affiliate', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');
    const affiliateRow = within(row('Hebe Trillo'));
    expect(affiliateRow.getByTitle('Suspender')).toBeInTheDocument();
    expect(affiliateRow.getByTitle('Reenviar link de pago')).toBeInTheDocument();
    expect(affiliateRow.getByTitle('Reenviar mail de activación')).toBeInTheDocument();
  });

  it('does not mark a regular affiliate', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');
    expect(within(row('Hebe Trillo')).queryByText('Asesor · sin cargo')).not.toBeInTheDocument();
  });
});
