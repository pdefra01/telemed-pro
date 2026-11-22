import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChartEvolutionForm from '../ChartEvolutionForm';
import { medicalRecordRepository } from '../../../repositories/MedicalRecordRepository';
import { familyMemberRepository } from '../../../repositories/FamilyMemberRepository';

vi.mock('../../../repositories/MedicalRecordRepository', () => ({
  medicalRecordRepository: { createMedicalRecord: vi.fn() },
}));
vi.mock('../../../repositories/FamilyMemberRepository', () => ({
  familyMemberRepository: { findFamilyGroupId: vi.fn(), getByFamilyGroup: vi.fn() },
}));

const doctor = { id: 'doc-1', name: 'Ana Ruiz' };

const renderForm = (onSaved = vi.fn()) => {
  render(<ChartEvolutionForm patientId="p1" patientName="Juan Pérez" doctor={doctor} onSaved={onSaved} />);
  return onSaved;
};

const fill = (diagnosis: string, notes: string) => {
  fireEvent.change(screen.getByPlaceholderText('Diagnóstico'), { target: { value: diagnosis } });
  fireEvent.change(screen.getByPlaceholderText('Notas de evolución'), { target: { value: notes } });
};

describe('ChartEvolutionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(familyMemberRepository.findFamilyGroupId).mockResolvedValue('g1');
    vi.mocked(familyMemberRepository.getByFamilyGroup).mockResolvedValue([
      { id: 'fm1', name: 'Lucía Pérez', relation: 'hijo/a' } as any,
    ]);
    vi.mocked(medicalRecordRepository.createMedicalRecord).mockResolvedValue({ id: 'mr-1' } as any);
  });

  it('adds an evolution for the titular without an appointment', async () => {
    const onSaved = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar evolución/i }));
    fill('Control de presión', 'Paciente estable, sigue igual.');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar evolución' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(medicalRecordRepository.createMedicalRecord).toHaveBeenCalledWith({
      patientId: 'p1',
      familyMemberId: undefined,
      doctorId: 'doc-1',
      doctorName: 'Ana Ruiz',
      diagnosis: 'Control de presión',
      notes: 'Paciente estable, sigue igual.',
      type: 'consultation',
    });
    expect(screen.queryByPlaceholderText('Diagnóstico')).not.toBeInTheDocument();
  });

  it('adds the evolution for the chosen family member', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar evolución/i }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Lucía Pérez (hijo/a)' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Para'), { target: { value: 'fm1' } });
    fill('Faringitis', 'Reposo y control en 48 horas.');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar evolución' }));

    await waitFor(() => expect(medicalRecordRepository.createMedicalRecord).toHaveBeenCalledTimes(1));
    expect(vi.mocked(medicalRecordRepository.createMedicalRecord).mock.calls[0][0]).toMatchObject({ familyMemberId: 'fm1' });
  });

  it('keeps the form open and shows the error when saving fails', async () => {
    vi.mocked(medicalRecordRepository.createMedicalRecord).mockRejectedValue(new Error('Las notas de evolución son obligatorias para la historia clínica.'));
    const onSaved = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar evolución/i }));
    fill('Control', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar evolución' }));

    await waitFor(() => expect(screen.getByText('Las notas de evolución son obligatorias para la historia clínica.')).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Diagnóstico')).toBeInTheDocument();
  });

  it('still lets the doctor write for the titular when the family group cannot be loaded', async () => {
    vi.mocked(familyMemberRepository.findFamilyGroupId).mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar evolución/i }));

    expect(screen.getByRole('option', { name: 'Juan Pérez (titular)' })).toBeInTheDocument();
  });
});
