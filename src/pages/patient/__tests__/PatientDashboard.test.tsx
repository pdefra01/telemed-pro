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
          super(args[0]);
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

describe('PatientDashboard obra social prescription link', () => {
  const baseRx = {
    id: 'rx-1',
    patientId: 'p1',
    doctorName: 'Dr. House',
    medications: [],
    date: '2026-06-01',
    status: 'active',
    digitalSignature: 'SIG',
    expirationDate: '2026-07-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(doctorRepository.getSpecialties).mockResolvedValue([]);
    vi.mocked(appointmentRepository.getPatientAppointments).mockResolvedValue([]);
    vi.mocked(medicalRecordRepository.getRecordsByPatientId).mockResolvedValue([]);
  });

  it('shows a link to the obra social prescription when there is no PDF', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([
      { ...baseRx, externalPrescriptionUrl: 'https://obrasocial.example/receta/abc' },
    ] as any);

    renderWithRouter(<PatientDashboard user={MOCK_PATIENT} />);

    const link = await screen.findByRole('link', { name: /Ver receta de obra social/i });
    expect(link.getAttribute('href')).toBe('https://obrasocial.example/receta/abc');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByText('N/A')).toBeNull();
  });

  it('keeps N/A when there is neither a PDF nor an obra social link', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([baseRx] as any);

    renderWithRouter(<PatientDashboard user={MOCK_PATIENT} />);

    expect(await screen.findByText('N/A')).toBeDefined();
    expect(screen.queryByRole('link', { name: /Ver receta de obra social/i })).toBeNull();
  });

  it('shows only the PDF link when both a PDF and an obra social link exist', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([
      { ...baseRx, pdfUrl: 'https://files.example/rx.pdf', externalPrescriptionUrl: 'https://obrasocial.example/receta/abc' },
    ] as any);

    renderWithRouter(<PatientDashboard user={MOCK_PATIENT} />);

    const pdf = await screen.findByRole('link', { name: /PDF/i });
    expect(pdf.getAttribute('href')).toBe('https://files.example/rx.pdf');
    expect(screen.queryByRole('link', { name: /Ver receta de obra social/i })).toBeNull();
  });

  it('renders no link and keeps N/A when the obra social URL is not https', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValue([
      { ...baseRx, externalPrescriptionUrl: 'javascript:alert(1)' },
    ] as any);

    renderWithRouter(<PatientDashboard user={MOCK_PATIENT} />);

    expect(await screen.findByText('N/A')).toBeDefined();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /Ver receta de obra social/i })).toBeNull();
  });
});
