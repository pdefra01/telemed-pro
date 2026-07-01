import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PatientDashboard from '../PatientDashboard';
import { MOCK_PATIENT } from '../../../constants';
import { doctorRepository } from '../../../repositories/DoctorRepository';
import { appointmentRepository } from '../../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../../repositories/MedicalRecordRepository';
import { prescriptionRepository } from '../../../repositories/PrescriptionRepository';
import { medicalDocumentRepository } from '../../../repositories/MedicalDocumentRepository';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock repositories
vi.mock('../../../repositories/DoctorRepository', () => ({
  doctorRepository: {
    getSpecialties: vi.fn(),
    getDoctorsBySpecialty: vi.fn(),
  },
}));

vi.mock('../../../repositories/AppointmentRepository', () => ({
  appointmentRepository: {
    getPatientAppointments: vi.fn(),
    createAppointment: vi.fn(),
    createDemoAppointment: vi.fn(),
  },
}));

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
    uploadDocument: vi.fn(),
  },
}));

vi.mock('../../../repositories/FamilyMemberRepository', () => ({
  familyMemberRepository: {
    ensureFamilyGroup: vi.fn().mockResolvedValue('mock-family-group-id'),
    getByFamilyGroup: vi.fn().mockResolvedValue([
      { id: '1', name: 'Hijo Mock', relation: 'hijo/a', age: 8 }
    ]),
  },
}));

// Mock Contexts
const mockToast = vi.fn();
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};

describe('PatientDashboard Scheduler', () => {
  let OriginalDate: typeof Date;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockDate = new Date('2026-06-30T09:00:00');
    OriginalDate = global.Date;
    
    class MockDate extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockDate.getTime());
        } else {
          super(...(args as [any, ...any[]]));
        }
      }
    }

    vi.spyOn(global, 'Date').mockImplementation(function(this: any, ...args: any[]) {
      if (new.target) {
        return new MockDate(...args);
      }
      return mockDate.toString();
    } as any);
    
    vi.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow booking an appointment through the flow', async () => {
    // 1. Setup Mocks
    vi.mocked(doctorRepository.getSpecialties).mockResolvedValue(['Cardiología', 'Pediatría']);
    vi.mocked(doctorRepository.getDoctorsBySpecialty).mockResolvedValue([
      { id: 'doc1', name: 'Dr. Smith', specialty: 'Cardiología', rating: 4.8, availability: ['10:00', '11:00'] }
    ] as any);
    vi.mocked(appointmentRepository.getPatientAppointments).mockResolvedValue([]);
    vi.mocked(medicalRecordRepository.getRecordsByPatientId).mockResolvedValue([]);
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([]);

    renderWithRouter(<PatientDashboard user={MOCK_PATIENT} />);

    // 2. Open Modal
    const bookButton = screen.getByText(/Nuevo Turno/i);
    fireEvent.click(bookButton);

    expect(screen.getByText(/Agendar Turno/i)).toBeDefined();

    // 3. Select Specialty
    await waitFor(() => {
      expect(screen.getByText('CARDIOLOGÍA')).toBeDefined();
    });
    fireEvent.click(screen.getByText('CARDIOLOGÍA'));

    // 4. Select Doctor
    await waitFor(() => {
      expect(screen.getByText('DR. SMITH')).toBeDefined();
    });
    fireEvent.click(screen.getByText('DR. SMITH'));

    // 5. Select Slot
    await waitFor(() => {
      expect(screen.getByText('10:00')).toBeDefined();
    });
    fireEvent.click(screen.getByText('10:00'));

    // 6. Confirm Booking
    const confirmButton = screen.getByText(/CONFIRMAR TURNO/i);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(appointmentRepository.createAppointment).toHaveBeenCalledWith(expect.objectContaining({
        doctor_id: 'doc1',
        specialty: 'Cardiología'
      }));
    });

    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('éxito'), 'success');
  });

  it('should filter doctors when specialty changes', async () => {
    vi.mocked(doctorRepository.getSpecialties).mockResolvedValue(['Cardiología', 'Pediatría']);
    vi.mocked(doctorRepository.getDoctorsBySpecialty)
      .mockResolvedValueOnce([
        { id: 'doc1', name: 'Dr. Smith', specialty: 'Cardiología', rating: 4.8, availability: ['10:00'] }
      ] as any)
      .mockResolvedValueOnce([
        { id: 'doc2', name: 'Dra. Garcia', specialty: 'Pediatría', rating: 4.9, availability: ['14:00'] }
      ] as any);

    renderWithRouter(<PatientDashboard user={MOCK_PATIENT} />);
    
    fireEvent.click(screen.getByText(/Nuevo Turno/i));

    // Initially Cardiología is selected (first in list)
    await waitFor(() => {
      expect(screen.getByText('DR. SMITH')).toBeDefined();
    });

    // Change to Pediatría
    fireEvent.click(screen.getByText('PEDIATRÍA'));

    await waitFor(() => {
      expect(screen.queryByText('DR. SMITH')).toBeNull();
      expect(screen.getByText('DRA. GARCIA')).toBeDefined();
    });
  });
});
