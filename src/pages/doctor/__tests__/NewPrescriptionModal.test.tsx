import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewPrescriptionModal from '../NewPrescriptionModal';
import { issueStandalonePrescription } from '../../../utils/issuePrescription';
import { sendPrescriptionWhatsapp } from '../../../utils/prescriptionWhatsapp';
import { familyMemberRepository } from '../../../repositories/FamilyMemberRepository';

vi.mock('../../../utils/issuePrescription', () => ({ issueStandalonePrescription: vi.fn() }));
vi.mock('../../../utils/prescriptionWhatsapp', () => ({ sendPrescriptionWhatsapp: vi.fn() }));
vi.mock('../../../repositories/FamilyMemberRepository', () => ({
  familyMemberRepository: { findFamilyGroupId: vi.fn(), getByFamilyGroup: vi.fn() },
}));
vi.mock('../../../repositories/PharmacyRepository', () => ({
  pharmacyRepository: { searchProductsWithStock: vi.fn().mockResolvedValue([]) },
}));

const issue = issueStandalonePrescription as unknown as ReturnType<typeof vi.fn>;
const sendWhatsapp = sendPrescriptionWhatsapp as unknown as ReturnType<typeof vi.fn>;
const family = familyMemberRepository as unknown as { findFamilyGroupId: ReturnType<typeof vi.fn>; getByFamilyGroup: ReturnType<typeof vi.fn> };

function renderModal(onClose = vi.fn()) {
  render(<NewPrescriptionModal patientId="p-1" patientName="Juan Gómez" onClose={onClose} />);
  return { onClose };
}

async function fillFirstMedication(name: string, instructions: string) {
  fireEvent.change(screen.getByPlaceholderText('Ej. Amoxicilina 500mg'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText('Cada 8hs por 7 días...'), { target: { value: instructions } });
}

describe('NewPrescriptionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    family.findFamilyGroupId.mockResolvedValue('group-1');
    family.getByFamilyGroup.mockResolvedValue([{ id: 'fm-1', name: 'Lucía Gómez', relation: 'Hija', age: 10 }]);
    issue.mockResolvedValue({ ok: true, prescriptionId: 'rx-1' });
    sendWhatsapp.mockResolvedValue({ ok: true });
  });

  it('issues a receta for the titular and sends it by WhatsApp', async () => {
    renderModal();
    await fillFirstMedication(' Amoxicilina 500mg ', 'Cada 8hs');
    fireEvent.change(screen.getByLabelText('Indicaciones'), { target: { value: 'Reposo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));

    await screen.findByText('Receta emitida');
    expect(issue).toHaveBeenCalledWith({
      patientId: 'p-1',
      familyMemberId: null,
      medications: [{ name: 'Amoxicilina 500mg', instructions: 'Cada 8hs' }],
      indications: 'Reposo',
    });
    expect(sendWhatsapp).toHaveBeenCalledWith('rx-1');
    expect(await screen.findByText('Receta enviada por WhatsApp.')).toBeInTheDocument();
  });

  it('issues the receta for the chosen family member', async () => {
    renderModal();
    await screen.findByRole('option', { name: 'Lucía Gómez (Hija)' });
    fireEvent.change(screen.getByLabelText('Para'), { target: { value: 'fm-1' } });
    fireEvent.change(screen.getByLabelText('Indicaciones'), { target: { value: 'Dieta blanda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));

    await screen.findByText('Receta emitida');
    expect(issue).toHaveBeenCalledWith({ patientId: 'p-1', familyMemberId: 'fm-1', medications: [], indications: 'Dieta blanda' });
  });

  it('does not issue an empty receta', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));
    expect(await screen.findByText('Cargá al menos un medicamento o indicaciones.')).toBeInTheDocument();
    expect(issue).not.toHaveBeenCalled();
  });

  it('asks for the name of a medication that only has instructions', async () => {
    renderModal();
    await fillFirstMedication('', 'Cada 8hs');
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));
    expect(await screen.findByText('Cada medicamento necesita un nombre.')).toBeInTheDocument();
    expect(issue).not.toHaveBeenCalled();
  });

  it('sends the obra social link instead of medications', async () => {
    renderModal();
    await fillFirstMedication('Amoxicilina', 'Cada 8hs');
    fireEvent.click(screen.getByRole('button', { name: 'Receta de obra social' }));
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://os.example/r/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));

    await screen.findByText('Receta emitida');
    expect(issue).toHaveBeenCalledWith({
      patientId: 'p-1',
      familyMemberId: null,
      medications: [],
      indications: '',
      externalPrescriptionUrl: 'https://os.example/r/1',
    });
  });

  it('shows the server error and does not send anything', async () => {
    issue.mockResolvedValue({ ok: false, message: 'Solo un médico puede emitir recetas.' });
    renderModal();
    fireEvent.change(screen.getByLabelText('Indicaciones'), { target: { value: 'Reposo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));

    expect(await screen.findByText('Solo un médico puede emitir recetas.')).toBeInTheDocument();
    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeEnabled();
  });

  it('explains a failed WhatsApp send and retries it', async () => {
    sendWhatsapp.mockResolvedValueOnce({ ok: false, message: 'El WhatsApp de la empresa no está conectado.' });
    renderModal();
    fireEvent.change(screen.getByLabelText('Indicaciones'), { target: { value: 'Reposo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));

    expect(await screen.findByText('El WhatsApp de la empresa no está conectado.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar por WhatsApp' }));
    expect(await screen.findByText('Receta enviada por WhatsApp.')).toBeInTheDocument();
    expect(sendWhatsapp).toHaveBeenCalledTimes(2);
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it('still lets the doctor prescribe for the titular when the family group cannot be loaded', async () => {
    family.findFamilyGroupId.mockRejectedValue(new Error('down'));
    renderModal();
    fireEvent.change(screen.getByLabelText('Indicaciones'), { target: { value: 'Reposo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));
    await screen.findByText('Receta emitida');
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({ familyMemberId: null }));
  });
});
