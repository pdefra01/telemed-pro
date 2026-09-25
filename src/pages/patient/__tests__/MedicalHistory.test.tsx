import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MedicalHistory from '../MedicalHistory';
import { MOCK_PATIENT } from '../../../constants';
import { medicalRecordRepository } from '../../../repositories/MedicalRecordRepository';
import { prescriptionRepository } from '../../../repositories/PrescriptionRepository';
import { medicalDocumentRepository } from '../../../repositories/MedicalDocumentRepository';
import React from 'react';

// Mock repositories
vi.mock('../../../repositories/MedicalRecordRepository', () => ({
  medicalRecordRepository: {
    getRecordsByPatientId: vi.fn(),
  },
}));

vi.mock('../../../repositories/PrescriptionRepository', () => ({
  prescriptionRepository: {
    getPrescriptionsByPatientId: vi.fn(),
  },
}));

vi.mock('../../../repositories/MedicalDocumentRepository', () => ({
  medicalDocumentRepository: {
    getDocumentsByPatientId: vi.fn(),
  },
}));

vi.mock('../../../repositories/FamilyMemberRepository', () => ({
  familyMemberRepository: {
    ensureFamilyGroup: vi.fn().mockResolvedValue('group-1'),
    getByFamilyGroup: vi.fn().mockResolvedValue([]),
  },
}));

// Mock Contexts
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('MedicalHistory Component', () => {
  it('should render the component and load data', async () => {
    const mockRecords = [
      { id: '1', diagnosis: 'Gripe Fuerte', doctorName: 'Dr. Gregory House', date: '2024-01-01', notes: 'Descanso total', type: 'consultation' }
    ];
    
    vi.mocked(medicalRecordRepository.getRecordsByPatientId).mockResolvedValue(mockRecords as any);
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([]);
    vi.mocked(medicalDocumentRepository.getDocumentsByPatientId).mockResolvedValue([]);

    render(<MedicalHistory user={MOCK_PATIENT} />);

    // El título ahora es "Expediente Médico"
    expect(screen.getByText(/Expediente Médico/i)).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('Gripe Fuerte')).toBeDefined();
    });
    
    expect(screen.getByText('Dr. Gregory House')).toBeDefined();
  });

  it('should switch tabs and show empty state for prescriptions', async () => {
    vi.mocked(medicalRecordRepository.getRecordsByPatientId).mockResolvedValue([]);
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([]);
    vi.mocked(medicalDocumentRepository.getDocumentsByPatientId).mockResolvedValue([]);

    render(<MedicalHistory user={MOCK_PATIENT} />);

    const prescriptionsTab = screen.getByText('Recetas');
    prescriptionsTab.click();

    await waitFor(() => {
      expect(screen.getByText(/No hay recetas registradas/i)).toBeDefined();
    });

  });

  it('shows a link to the obra social prescription when there is no PDF', async () => {
    vi.mocked(medicalRecordRepository.getRecordsByPatientId).mockResolvedValue([]);
    vi.mocked(medicalDocumentRepository.getDocumentsByPatientId).mockResolvedValue([]);
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([
      {
        id: 'rx-12345678', patientId: 'p1', doctorName: 'Dr. House', medications: [],
        date: '2024-01-01', status: 'active', digitalSignature: 'SIG', expirationDate: '2024-02-01',
        externalPrescriptionUrl: 'https://obrasocial.example/receta/abc',
      },
    ] as any);

    render(<MedicalHistory user={MOCK_PATIENT} />);
    screen.getByText('Recetas').click();

    const link = await screen.findByRole('link', { name: /Ver receta de obra social/i });
    expect(link.getAttribute('href')).toBe('https://obrasocial.example/receta/abc');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
