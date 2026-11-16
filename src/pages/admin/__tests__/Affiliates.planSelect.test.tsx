import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Affiliates from '../Affiliates';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { planRepository } from '../../../repositories/PlanRepository';
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
  planRepository: { getAll: vi.fn() },
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const plan = (id: string, name: string, isOffered: boolean) => ({
  id, name, isOffered, monthlyCost: 14999, isUnlimited: true, bonifiedConsultations: 0, maxFamilyMembers: 0,
});

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

const planOptions = () =>
  within(screen.getByDisplayValue(/Sin plan asignado|Plan /).closest('select') as HTMLElement)
    .getAllByRole('option')
    .map((o) => o.textContent);

describe('Padrón de Afiliados: plan selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planRepository.getAll).mockResolvedValue([
      plan('new', 'Plan Individual', true),
      plan('old', 'Plan individual', false),
    ] as never);
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([
      patient({}),
      patient({ id: 'p2', name: 'Ramón Paz', email: 'ramon@test.com', planId: 'old' }),
    ]);
    vi.mocked(affiliateRepository.getDebitRejections).mockResolvedValue({});
  });

  it('hides retired plans when assigning a plan', async () => {
    render(<Affiliates />);
    const row = (await screen.findByText('Hebe Trillo')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByTitle('Editar Perfil'));

    const options = await screen.findAllByText(/Plan Individual \(/);
    expect(options).toHaveLength(1);
    expect(planOptions()).not.toContain('Plan individual (∞)');
  });

  it('keeps the retired plan an affiliate already has', async () => {
    render(<Affiliates />);
    const row = (await screen.findByText('Ramón Paz')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByTitle('Editar Perfil'));

    await screen.findByText('Plan Individual (∞)');
    expect(planOptions()).toEqual(['Sin plan asignado', 'Plan Individual (∞)', 'Plan individual (∞)']);
  });
});
