import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  dni: '14709550',
  role: 'patient',
  isActive: true,
  planStatus: 'active',
  paymentStatus: 'current',
  currentPeriodQuotaUsed: 0,
  ...over,
});

const patients = [
  patient({}),
  patient({ id: 'p2', name: 'Ramón Paz', email: 'ramon@test.com', dni: '30111222' }),
  patient({ id: 'p3', name: 'Inés Vera', email: 'ines@test.com', dni: '28999000', isActive: false, planStatus: 'pending' }),
];

const search = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('Buscar por DNI o Nombre...'), { target: { value } });

describe('Padrón de Afiliados: search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue(patients);
    vi.mocked(affiliateRepository.getDebitRejections).mockResolvedValue({});
  });

  it('filters by name, ignoring case and accents', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    search('ramon');
    expect(screen.getByText('Ramón Paz')).toBeInTheDocument();
    expect(screen.queryByText('Hebe Trillo')).not.toBeInTheDocument();
  });

  it('filters by DNI and by email', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    search('1470');
    expect(screen.getByText('Hebe Trillo')).toBeInTheDocument();
    expect(screen.queryByText('Ramón Paz')).not.toBeInTheDocument();

    search('ramon@');
    expect(screen.getByText('Ramón Paz')).toBeInTheDocument();
    expect(screen.queryByText('Hebe Trillo')).not.toBeInTheDocument();
  });

  it('searches within the selected status and shows every row again when cleared', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    search('vera');
    expect(screen.queryByText('Inés Vera')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'all' } });
    expect(screen.getByText('Inés Vera')).toBeInTheDocument();

    search('');
    expect(screen.getByText('Hebe Trillo')).toBeInTheDocument();
    expect(screen.getByText('Ramón Paz')).toBeInTheDocument();
  });
});
