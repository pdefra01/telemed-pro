import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChartPrescriptionsPanel from '../ChartPrescriptionsPanel';
import { sendPrescriptionWhatsapp } from '../../../utils/prescriptionWhatsapp';
import type { Prescription } from '../../../types';

vi.mock('../../../utils/prescriptionWhatsapp', () => ({
  sendPrescriptionWhatsapp: vi.fn(),
}));

const rx = (overrides: Partial<Prescription>): Prescription => ({
  id: 'rx-1',
  patientId: 'p1',
  doctorId: 'doc-me',
  doctorName: 'Ana Ruiz',
  date: '2026-11-20T15:00:00.000Z',
  status: 'active',
  digitalSignature: 'sig',
  expirationDate: '2026-12-20',
  medications: [{ name: 'Ibuprofeno 400', instructions: 'Cada 8 horas', quantity: 1 }],
  ...overrides,
} as Prescription);

describe('ChartPrescriptionsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists each prescription with its medications and who it is for', () => {
    render(
      <ChartPrescriptionsPanel
        currentDoctorId="doc-me"
        prescriptions={[
          rx({ id: 'rx-2', appointmentId: undefined, familyMemberName: 'Lucía Pérez', familyMemberRelation: 'hijo/a' }),
          rx({ id: 'rx-1', appointmentId: 'app-1', medications: [{ name: 'Amoxicilina 500', instructions: 'Cada 12 horas', quantity: 1 }] }),
        ]}
      />
    );

    expect(screen.getByText('Ibuprofeno 400')).toBeInTheDocument();
    expect(screen.getByText('Amoxicilina 500')).toBeInTheDocument();
    expect(screen.getByText('Para: Lucía Pérez (hijo/a)')).toBeInTheDocument();
    expect(screen.getByText('Sin consulta')).toBeInTheDocument();
  });

  it('links an obra social prescription to its external page', () => {
    render(
      <ChartPrescriptionsPanel
        currentDoctorId="doc-me"
        prescriptions={[rx({ medications: [], externalPrescriptionUrl: 'https://recetas.example.com/abc' })]}
      />
    );

    expect(screen.getByRole('link', { name: /receta de obra social/i })).toHaveAttribute('href', 'https://recetas.example.com/abc');
  });

  it('resends the doctor own prescription by WhatsApp and reports the result', async () => {
    vi.mocked(sendPrescriptionWhatsapp).mockResolvedValue({ ok: true } as any);
    render(<ChartPrescriptionsPanel currentDoctorId="doc-me" prescriptions={[rx({})]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar por WhatsApp' }));

    await waitFor(() => expect(screen.getByText('Receta enviada por WhatsApp.')).toBeInTheDocument());
    expect(sendPrescriptionWhatsapp).toHaveBeenCalledWith('rx-1');
  });

  it('shows the error when the resend fails', async () => {
    vi.mocked(sendPrescriptionWhatsapp).mockResolvedValue({ ok: false, message: 'Sesión de WhatsApp no disponible.' } as any);
    render(<ChartPrescriptionsPanel currentDoctorId="doc-me" prescriptions={[rx({})]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar por WhatsApp' }));

    await waitFor(() => expect(screen.getByText('Sesión de WhatsApp no disponible.')).toBeInTheDocument());
  });

  it('does not offer the resend for another doctor prescription', () => {
    render(<ChartPrescriptionsPanel currentDoctorId="doc-me" prescriptions={[rx({ doctorId: 'doc-other' })]} />);

    expect(screen.queryByRole('button', { name: 'Reenviar por WhatsApp' })).not.toBeInTheDocument();
  });

  it('says when the patient has no prescriptions', () => {
    render(<ChartPrescriptionsPanel currentDoctorId="doc-me" prescriptions={[]} />);

    expect(screen.getByText('Este paciente todavía no tiene recetas.')).toBeInTheDocument();
  });
});
