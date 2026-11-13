import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import Affiliates from '../Affiliates';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { Patient } from '../../../types';

const toastMock = vi.fn();

vi.mock('../../../repositories/AffiliateRepository', () => ({
  affiliateRepository: {
    getAllAffiliates: vi.fn(),
    getConsultationQuotaStatus: vi.fn(),
    getDebitRejections: vi.fn(),
    getAffiliateCancellations: vi.fn(),
    cancelAffiliate: vi.fn(),
    activateAffiliate: vi.fn(),
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
  useToast: () => ({ toast: toastMock }),
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

describe('Padrón de Afiliados: dar de baja (affiliate-cancellation S1, S3, S4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(affiliateRepository.getDebitRejections).mockResolvedValue({});
    vi.mocked(affiliateRepository.getAffiliateCancellations).mockResolvedValue(new Map([
      ['p2', { effectiveAt: '2026-12-10T12:00:00Z', appliedAt: null }],
      ['p3', { effectiveAt: '2026-11-01T12:00:00Z', appliedAt: '2026-11-01T13:00:00Z' }],
    ]));
    vi.mocked(affiliateRepository.getAllAffiliates).mockResolvedValue([
      patient({}),
      patient({ id: 'p2', name: 'Pablo Programado', email: 'pablo@test.com' }),
      patient({ id: 'p3', name: 'Beatriz Baja', email: 'bea@test.com', isActive: false, planStatus: 'cancelled' }),
      patient({ id: 'p4', name: 'Sergio Suspendido', email: 'sergio@test.com', isActive: false, planStatus: 'suspended' }),
      patient({ id: 'a1', name: 'Ana Asesora', email: 'ana@test.com', isAdvisor: true, planId: 'plan-1' }),
      patient({ id: 'c1', name: 'Carla Convenio', email: 'carla@test.com', agreementId: 'agr-1' }),
    ]);
  });

  it('dar de baja: explains the debit and the coverage, calls the server and reports the date', async () => {
    vi.mocked(affiliateRepository.cancelAffiliate).mockResolvedValue({
      effectiveAt: '2026-12-20T12:00:00Z', immediate: false, profilesCancelled: 1, debitsCancelled: 1,
    });
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    fireEvent.click(within(row('Hebe Trillo')).getByTitle('Dar de baja'));
    expect(screen.getByText('¿Dar de baja a Hebe Trillo?')).toBeInTheDocument();
    expect(screen.getByText(/Se cancela su débito automático en MercadoPago/)).toBeInTheDocument();
    expect(screen.getByText(/Mantiene la cobertura hasta el fin del período pagado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));

    await waitFor(() => expect(affiliateRepository.cancelAffiliate).toHaveBeenCalledWith('p1'));
    expect(toastMock).toHaveBeenCalledWith('Baja programada para el 20/12/2026. El débito automático quedó cancelado.', 'success');
  });

  it('reports an immediate cancellation', async () => {
    vi.mocked(affiliateRepository.cancelAffiliate).mockResolvedValue({
      effectiveAt: '2026-11-13T12:00:00Z', immediate: true, profilesCancelled: 1, debitsCancelled: 0,
    });
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    fireEvent.click(within(row('Hebe Trillo')).getByTitle('Dar de baja'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Afiliado dado de baja.', 'success'));
  });

  it('shows the server error when the cancellation fails', async () => {
    vi.mocked(affiliateRepository.cancelAffiliate).mockRejectedValue(
      new Error('No se pudo cancelar el débito automático en MercadoPago. El afiliado no fue dado de baja; volvé a intentar.'),
    );
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');

    fireEvent.click(within(row('Hebe Trillo')).getByTitle('Dar de baja'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(
      'No se pudo cancelar el débito automático en MercadoPago. El afiliado no fue dado de baja; volvé a intentar.', 'error'));
  });

  it('shows a scheduled cancellation with its date and no second "Dar de baja"', async () => {
    render(<Affiliates />);
    await screen.findByText('Pablo Programado');
    const scheduled = within(row('Pablo Programado'));
    expect(scheduled.getByText('Baja programada: 10/12/2026')).toBeInTheDocument();
    expect(scheduled.getByText('Activo')).toBeInTheDocument();
    expect(scheduled.queryByTitle('Dar de baja')).not.toBeInTheDocument();
  });

  it('shows an effective cancellation as "Dado de baja", never as pending', async () => {
    render(<Affiliates />);
    fireEvent.change(await screen.findByLabelText('Filtrar por estado'), { target: { value: 'all' } });
    const cancelled = within(row('Beatriz Baja'));
    expect(cancelled.getByText('Dado de baja')).toBeInTheDocument();
    expect(cancelled.queryByTitle('Aprobar Afiliado')).not.toBeInTheDocument();
    expect(cancelled.queryByTitle('Reactivar')).not.toBeInTheDocument();
  });

  it('the "Bajas" filter lists scheduled and effective cancellations only', async () => {
    render(<Affiliates />);
    fireEvent.change(await screen.findByLabelText('Filtrar por estado'), { target: { value: 'cancelled' } });
    expect(screen.getByText('Pablo Programado')).toBeInTheDocument();
    expect(screen.getByText('Beatriz Baja')).toBeInTheDocument();
    expect(screen.queryByText('Hebe Trillo')).not.toBeInTheDocument();
    expect(screen.queryByText('Sergio Suspendido')).not.toBeInTheDocument();
  });

  it('the "Pendientes" filter no longer lists cancelled affiliates', async () => {
    render(<Affiliates />);
    fireEvent.change(await screen.findByLabelText('Filtrar por estado'), { target: { value: 'pending' } });
    expect(screen.queryByText('Beatriz Baja')).not.toBeInTheDocument();
  });

  it('reactivates a suspended affiliate', async () => {
    vi.mocked(affiliateRepository.activateAffiliate).mockResolvedValue(undefined);
    render(<Affiliates />);
    fireEvent.change(await screen.findByLabelText('Filtrar por estado'), { target: { value: 'suspended' } });

    fireEvent.click(within(row('Sergio Suspendido')).getByTitle('Reactivar'));

    await waitFor(() => expect(affiliateRepository.activateAffiliate).toHaveBeenCalledWith('p4'));
    expect(toastMock).toHaveBeenCalledWith('Afiliado reactivado.', 'success');
  });

  it('offers no "Dar de baja" for an advisor or an agreement affiliate', async () => {
    render(<Affiliates />);
    await screen.findByText('Ana Asesora');
    expect(within(row('Ana Asesora')).queryByTitle('Dar de baja')).not.toBeInTheDocument();
    expect(within(row('Carla Convenio')).queryByTitle('Dar de baja')).not.toBeInTheDocument();
  });

  it('still offers "Suspender" for a regular active affiliate (unchanged)', async () => {
    render(<Affiliates />);
    await screen.findByText('Hebe Trillo');
    expect(within(row('Hebe Trillo')).getByTitle('Suspender')).toBeInTheDocument();
  });
});
