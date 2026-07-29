import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DoctorDashboard from '../DoctorDashboard';
import { appointmentRepository } from '../../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../../repositories/MedicalRecordRepository';
import { prescriptionRepository } from '../../../repositories/PrescriptionRepository';
import { dashboardRepository } from '../../../repositories/DashboardRepository';
import { notificationRepository } from '../../../repositories/NotificationRepository';
import { medicalDocumentRepository } from '../../../repositories/MedicalDocumentRepository';
import { doctorShiftRepository } from '../../../repositories/DoctorShiftRepository';
import { Doctor, Appointment, MedicalRecord, Prescription } from '../../../types';

// Mock dependencies
vi.mock('../../../repositories/AppointmentRepository', () => ({
  appointmentRepository: {
    getDoctorAppointments: vi.fn(),
  },
}));

vi.mock('../../../repositories/MedicalRecordRepository', () => ({
  medicalRecordRepository: {
    getRecordByAppointmentId: vi.fn(),
    getRecordsByPatientId: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../repositories/PrescriptionRepository', () => ({
  prescriptionRepository: {
    getPrescriptionByAppointmentId: vi.fn(),
  },
}));

vi.mock('../../../repositories/DashboardRepository', () => ({
  dashboardRepository: {
    getDoctorQueue: vi.fn().mockResolvedValue([]),
    getDoctorKPIs: vi.fn().mockResolvedValue({
      pendingConsultations: 0,
      effectiveConsultations: 0,
      avgSessionMinutes: 0
    }),
  },
}));

vi.mock('../../../repositories/NotificationRepository', () => ({
  notificationRepository: {
    subscribeToNotifications: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  },
}));

vi.mock('../../../repositories/MedicalDocumentRepository', () => ({
  medicalDocumentRepository: {
    getDocumentsByPatientId: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../repositories/DoctorShiftRepository', () => ({
  doctorShiftRepository: {
    getActiveShift: vi.fn().mockResolvedValue(null),
    clockIn: vi.fn(),
    clockOut: vi.fn(),
  },
}));

const mockDoctor: Doctor = { 
  id: 'doc1', 
  name: 'Dr. Gregory House', 
  email: 'house@princeton.com', 
  role: 'doctor', 
  specialty: 'Diagnóstico', 
  reviewCount: 150, 
  rating: 4.8, 
  isVerified: true, 
  availability: [],
  metrics: {
    starRating: 4.8,
    rankingScore: 92,
    showRate: 98,
    avgConsultationTime: '15 min',
    totalConsultations: 320,
    prescriptionsIssued: 180,
    qualityAlert: false
  }
};

const mockAppointments: Appointment[] = [
  {
    id: 'appt1',
    patientId: 'pat1',
    patientName: 'John Wilson',
    doctorId: 'doc1',
    doctorName: 'Dr. Gregory House',
    date: '2024-05-10',
    time: '10:00',
    status: 'completed',
    type: 'video',
  },
  {
    id: 'appt2',
    patientId: 'pat2',
    patientName: 'Jane Doe',
    doctorId: 'doc1',
    doctorName: 'Dr. Gregory House',
    date: '2024-05-11',
    time: '11:00',
    status: 'pending',
    type: 'video',
  }
];

const mockRecord: MedicalRecord = {
  id: 'rec1',
  appointmentId: 'appt1',
  patientId: 'pat1',
  doctorId: 'doc1',
  doctorName: 'Dr. Gregory House',
  diagnosis: 'Lupus (Never is lupus)',
  notes: 'El paciente presenta síntomas raros pero definitivamente no es lupus.',
  date: '2024-05-10',
  type: 'consultation'
};

const mockPrescription: Prescription = {
  id: 'pres1',
  appointmentId: 'appt1',
  patientId: 'pat1',
  doctorId: 'doc1',
  doctorName: 'Dr. Gregory House',
  medications: [
    { name: 'Vicodin', quantity: 1, instructions: 'Tomar según sea necesario' }
  ],
  date: '2024-05-10',
  status: 'active',
  expirationDate: '2024-06-10',
  digitalSignature: 'SIG-12345'
};

describe('DoctorDashboard - Consultation History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    render(
      <MemoryRouter>
        <DoctorDashboard user={mockDoctor} />
      </MemoryRouter>
    );
  };

  it('renders history appointments when "Historial de Atención" tab is clicked', async () => {
    vi.mocked(appointmentRepository.getDoctorAppointments).mockResolvedValue(mockAppointments);

    renderComponent();

    // Switch to history tab
    const historyTab = await screen.findByRole('button', { name: /Historial/i });
    fireEvent.click(historyTab);

    // Verify appt1 (completed) is shown
    expect(await screen.findByText('John Wilson')).toBeInTheDocument();
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument(); // Appt2 is pending
  });

  it('opens details modal and fetches record/prescription when "Detalles" is clicked', async () => {
    vi.mocked(appointmentRepository.getDoctorAppointments).mockResolvedValue(mockAppointments);
    vi.mocked(medicalRecordRepository.getRecordByAppointmentId).mockResolvedValue(mockRecord);
    vi.mocked(prescriptionRepository.getPrescriptionByAppointmentId).mockResolvedValue(mockPrescription);

    renderComponent();

    // Go to history
    const historyTab = await screen.findByRole('button', { name: /Historial/i });
    fireEvent.click(historyTab);

    // Click "Detalles"
    const detailsButton = await screen.findByRole('button', { name: /Ver Resumen/i });
    fireEvent.click(detailsButton);

    // Verify modal title
    expect(await screen.findByRole('heading', { name: /Resumen/i })).toBeInTheDocument();
    expect(await screen.findByText(/Paciente:.*John Wilson/i)).toBeInTheDocument();

    // Verify data fetching calls
    expect(medicalRecordRepository.getRecordByAppointmentId).toHaveBeenCalledWith('appt1');
    expect(prescriptionRepository.getPrescriptionByAppointmentId).toHaveBeenCalledWith('appt1');

    // Verify content
    expect(await screen.findByText('Lupus (Never is lupus)')).toBeInTheDocument();
    expect(screen.getByText('Vicodin')).toBeInTheDocument();
  });

  it('shows empty messages when record or prescription are missing', async () => {
    vi.mocked(appointmentRepository.getDoctorAppointments).mockResolvedValue(mockAppointments);
    vi.mocked(medicalRecordRepository.getRecordByAppointmentId).mockResolvedValue(null);
    vi.mocked(prescriptionRepository.getPrescriptionByAppointmentId).mockResolvedValue(null);

    renderComponent();

    fireEvent.click(await screen.findByRole('button', { name: /Historial/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Ver Resumen/i }));

    // Wait for fetch to finish
    await waitFor(() => {
      expect(screen.queryByText(/Sincronizando con nodo de datos/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Sin diagnóstico registrado en este nodo/i)).toBeInTheDocument();
    expect(screen.getByText(/Sin prescripciones en este registro/i)).toBeInTheDocument();
  });

  it('never fabricates "Plan Global" in the queue when patient_plan is null (same fallback bug fixed elsewhere in AuthRepository)', async () => {
    vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValue([
      {
        appointment_id: 'appt-queue-1',
        patient_id: 'pat-noplan',
        patient_name: 'Sin Plan Queue',
        patient_avatar: null,
        patient_plan: null,
        doctor_id: 'doc1',
        scheduled_at: '2024-05-10T10:00:00Z',
        status: 'confirmed',
        consultation_metadata: {},
      },
    ] as any);

    renderComponent();

    expect(await screen.findByText('Sin Plan Queue')).toBeInTheDocument();
    expect(screen.getByText('Sin plan asignado')).toBeInTheDocument();
    expect(screen.queryByText('Plan Global')).not.toBeInTheDocument();
  });
});
