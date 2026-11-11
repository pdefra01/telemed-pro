import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
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

const patients = [
  patient({}),
  patient({ id: 'p2', name: 'Ramón Paz', email: 'ramon@test.com' }),
  patient({ id: 'p3', name: 'Inés Vera', email: 'ines@test.com', isActive: false, planStatus: 'pending' }),
];

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('Padrón de Afiliados: debit rejections (S5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue(patients);
    vi.mocked(affiliateRepository.getDebitRejections).mockResolvedValue({
      p1: { rejectedAt: '2026-10-10T12:00:00Z', failures: 2 },
      p3: { rejectedAt: '2026-11-10T12:00:00Z', failures: 1 },
    });
  });

  it('marks the account status of an affiliate whose debit was rejected, with the date as a hint', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    const mark = await within(row('Hebe Trillo')).findByText('Débito rechazado');
    expect(mark).toHaveAttribute('title', 'Rechazado el 10/10/2026 · 2 rechazos');
    expect(within(row('Ramón Paz')).queryByText('Débito rechazado')).not.toBeInTheDocument();
  });

  it('counts the pending rejections in the header and filters them, whatever the account status', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    expect(await screen.findByTestId('debit-rejections-count')).toHaveTextContent('2 débitos rechazados');

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'debit' } });
    expect(screen.getByText('Hebe Trillo')).toBeInTheDocument();
    expect(screen.getByText('Inés Vera')).toBeInTheDocument();
    expect(screen.queryByText('Ramón Paz')).not.toBeInTheDocument();
  });

  it('keeps the screen as is when the rejections cannot be read', async () => {
    vi.mocked(affiliateRepository.getDebitRejections).mockRejectedValue(new Error('denied'));
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    await waitFor(() => expect(affiliateRepository.getDebitRejections).toHaveBeenCalled());
    expect(screen.queryByTestId('debit-rejections-count')).not.toBeInTheDocument();
    expect(within(row('Hebe Trillo')).queryByText('Débito rechazado')).not.toBeInTheDocument();
  });
});
