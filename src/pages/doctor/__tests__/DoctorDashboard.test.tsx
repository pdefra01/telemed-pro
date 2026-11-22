import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DoctorDashboard from '../DoctorDashboard';
import { appointmentRepository } from '../../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../../repositories/MedicalRecordRepository';
import { prescriptionRepository } from '../../../repositories/PrescriptionRepository';
import { familyMemberRepository } from '../../../repositories/FamilyMemberRepository';
import { dashboardRepository } from '../../../repositories/DashboardRepository';
import { notificationRepository } from '../../../repositories/NotificationRepository';
import { medicalDocumentRepository } from '../../../repositories/MedicalDocumentRepository';
import { doctorShiftRepository } from '../../../repositories/DoctorShiftRepository';
import { sendPrescriptionWhatsapp } from '../../../utils/prescriptionWhatsapp';
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
    createMedicalRecord: vi.fn(),
  },
}));

vi.mock('../../../utils/prescriptionWhatsapp', () => ({
  sendPrescriptionWhatsapp: vi.fn(),
  WHATSAPP_GENERIC_ERROR: 'No se pudo enviar el WhatsApp. Podés reintentar.',
}));

vi.mock('../../../repositories/PrescriptionRepository', () => ({
  prescriptionRepository: {
    getPrescriptionByAppointmentId: vi.fn(),
    getPrescriptionsByPatientId: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../repositories/FamilyMemberRepository', () => ({
  familyMemberRepository: {
    findFamilyGroupId: vi.fn().mockResolvedValue(null),
    getByFamilyGroup: vi.fn().mockResolvedValue([]),
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

vi.mock('../../../repositories/PatientChartRepository', () => ({
  patientChartRepository: {
    getChartData: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../NewPrescriptionModal', () => ({
  default: ({ patientId, patientName, onClose }: { patientId: string; patientName: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Nueva receta">
      {patientId} {patientName}
      <button onClick={onClose}>Cerrar nueva receta</button>
    </div>
  ),
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

describe('DoctorDashboard - history ordering, filters and follow-up actions', () => {
  const appt = (id: string, patientName: string, scheduledAt: string, date: string): Appointment => ({
    id, patientId: `pat-${id}`, patientName, doctorId: 'doc1', doctorName: 'Dr. Gregory House',
    date, time: '10:00', scheduledAt, status: 'completed', type: 'video',
  });
  const history = [
    appt('old', 'Ana Antigua', '2026-10-01T13:00:00.000Z', '2026-10-01'),
    appt('new', 'Beto Reciente', '2026-11-02T13:00:00.000Z', '2026-11-02'),
    appt('mid', 'Carla Media', '2026-10-15T13:00:00.000Z', '2026-10-15'),
  ];

  const openHistory = async () => {
    vi.mocked(appointmentRepository.getDoctorAppointments).mockResolvedValue(history);
    render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Historial/i }));
    await screen.findByText('Beto Reciente');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(medicalRecordRepository.getRecordByAppointmentId).mockResolvedValue(null);
    vi.mocked(prescriptionRepository.getPrescriptionByAppointmentId).mockResolvedValue(null);
  });

  it('opens a new receta for the patient of the clinical history, without a consultation', async () => {
    vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValueOnce([
      {
        appointment_id: 'appt-queue-rx',
        patient_id: 'pat-rx',
        patient_name: 'Rosa Receta',
        patient_avatar: null,
        patient_plan: null,
        doctor_id: 'doc1',
        scheduled_at: '2026-08-26T19:30:00Z',
        status: 'confirmed',
        consultation_metadata: {},
      },
    ] as any);
    render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Expediente/i }));
    expect(screen.queryByRole('dialog', { name: 'Nueva receta' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva receta' }));

    const dialog = await screen.findByRole('dialog', { name: 'Nueva receta' });
    expect(dialog).toHaveTextContent('pat-rx Rosa Receta');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar nueva receta' }));
    expect(screen.queryByRole('dialog', { name: 'Nueva receta' })).not.toBeInTheDocument();
  });

  describe('clinical history chart (doctor works outside the video call)', () => {
    const queueRow = {
      appointment_id: 'appt-queue-chart',
      patient_id: 'pat-chart',
      patient_name: 'Carla Ficha',
      patient_avatar: null,
      patient_plan: null,
      doctor_id: 'doc1',
      scheduled_at: '2026-08-26T19:30:00Z',
      status: 'confirmed',
      consultation_metadata: {},
    };

    it('lists the patient prescriptions, including the ones issued without a consultation', async () => {
      vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValueOnce([queueRow] as any);
      vi.mocked(prescriptionRepository.getPrescriptionsByPatientId).mockResolvedValueOnce([
        { id: 'rx-standalone', patientId: 'pat-chart', doctorId: 'doc1', doctorName: 'Doc', date: '2026-11-20T15:00:00Z', status: 'active', digitalSignature: 's', expirationDate: '2026-12-20', medications: [{ name: 'Paracetamol 1g', instructions: 'Cada 8 horas', quantity: 1 }] },
      ] as any);
      render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: /Expediente/i }));

      fireEvent.click(await screen.findByRole('button', { name: /Recetas/ }));

      expect(await screen.findByText('Paracetamol 1g')).toBeInTheDocument();
      expect(screen.getByText('Sin consulta')).toBeInTheDocument();
      expect(prescriptionRepository.getPrescriptionsByPatientId).toHaveBeenCalledWith('pat-chart');
    });

    it('filters the chart by person in the family group', async () => {
      vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValueOnce([queueRow] as any);
      vi.mocked(familyMemberRepository.findFamilyGroupId).mockResolvedValue('g1');
      vi.mocked(familyMemberRepository.getByFamilyGroup).mockResolvedValue([{ id: 'fm-lucia', name: 'Lucía Ficha', relation: 'hijo/a' }] as any);
      vi.mocked(medicalRecordRepository.getRecordsByPatientId).mockResolvedValueOnce([
        { id: 'r-titular', patientId: 'pat-chart', date: '2026-11-01T10:00:00Z', diagnosis: 'Diagnóstico del titular', notes: 'Notas titular', doctorName: 'Doc', type: 'consultation' },
        { id: 'r-lucia', patientId: 'pat-chart', familyMemberId: 'fm-lucia', familyMemberName: 'Lucía Ficha', familyMemberRelation: 'hijo/a', date: '2026-11-02T10:00:00Z', diagnosis: 'Diagnóstico de Lucía', notes: 'Notas Lucía', doctorName: 'Doc', type: 'consultation' },
      ] as any);
      render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: /Expediente/i }));
      fireEvent.click(await screen.findByRole('button', { name: /Evoluciones/ }));
      expect(await screen.findByText('Diagnóstico del titular')).toBeInTheDocument();
      expect(screen.getByText('Diagnóstico de Lucía')).toBeInTheDocument();

      const picker = await screen.findByLabelText('Ver historia de');
      await waitFor(() => expect(screen.getByRole('option', { name: 'Lucía Ficha (hijo/a)' })).toBeInTheDocument());
      fireEvent.change(picker, { target: { value: 'fm-lucia' } });
      expect(screen.queryByText('Diagnóstico del titular')).not.toBeInTheDocument();
      expect(screen.getByText('Diagnóstico de Lucía')).toBeInTheDocument();

      fireEvent.change(picker, { target: { value: 'titular' } });
      expect(screen.getByText('Diagnóstico del titular')).toBeInTheDocument();
      expect(screen.queryByText('Diagnóstico de Lucía')).not.toBeInTheDocument();
    });

    it('says whose each study is and filters the studies by person', async () => {
      vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValueOnce([queueRow] as any);
      vi.mocked(familyMemberRepository.findFamilyGroupId).mockResolvedValue('g1');
      vi.mocked(familyMemberRepository.getByFamilyGroup).mockResolvedValue([{ id: 'fm-lucia', name: 'Lucía Ficha', relation: 'hijo/a' }] as any);
      vi.mocked(medicalDocumentRepository.getDocumentsByPatientId).mockResolvedValueOnce([
        { id: 'd-titular', patientId: 'pat-chart', title: 'Análisis del titular', type: 'lab_result', date: '2026-11-01', url: 'https://x/1' },
        { id: 'd-lucia', patientId: 'pat-chart', familyMemberId: 'fm-lucia', title: 'Radiografía de Lucía', type: 'imaging', date: '2026-11-02', url: 'https://x/2' },
      ] as any);
      render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: /Expediente/i }));
      fireEvent.click(await screen.findByRole('button', { name: /Estudios/ }));

      expect(await screen.findByText('Para: Lucía Ficha (hijo/a)')).toBeInTheDocument();
      fireEvent.change(await screen.findByLabelText('Ver historia de'), { target: { value: 'titular' } });
      expect(screen.getByText('Análisis del titular')).toBeInTheDocument();
      expect(screen.queryByText('Radiografía de Lucía')).not.toBeInTheDocument();
    });

    it('does not show the person picker when the patient has no family group', async () => {
      vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValueOnce([queueRow] as any);
      vi.mocked(familyMemberRepository.findFamilyGroupId).mockResolvedValue(null);
      render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: /Expediente/i }));
      await screen.findByRole('button', { name: /Evoluciones/ });

      expect(screen.queryByLabelText('Ver historia de')).not.toBeInTheDocument();
    });

    it('adds an evolution from the chart and reloads the evolutions', async () => {
      vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValueOnce([queueRow] as any);
      vi.mocked(medicalRecordRepository.createMedicalRecord).mockResolvedValue({ id: 'mr-new' } as any);
      render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: /Expediente/i }));
      fireEvent.click(await screen.findByRole('button', { name: /Evoluciones/ }));
      const loadsBefore = vi.mocked(medicalRecordRepository.getRecordsByPatientId).mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: /agregar evolución/i }));
      fireEvent.change(screen.getByPlaceholderText('Diagnóstico'), { target: { value: 'Control anual' } });
      fireEvent.change(screen.getByPlaceholderText('Notas de evolución'), { target: { value: 'Sin novedades clínicas.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar evolución' }));

      await waitFor(() => expect(medicalRecordRepository.createMedicalRecord).toHaveBeenCalledWith(expect.objectContaining({
        patientId: 'pat-chart', doctorId: mockDoctor.id, diagnosis: 'Control anual',
      })));
      expect(vi.mocked(medicalRecordRepository.createMedicalRecord).mock.calls[0][0]).not.toHaveProperty('appointmentId');
      await waitFor(() => expect(vi.mocked(medicalRecordRepository.getRecordsByPatientId).mock.calls.length).toBeGreaterThan(loadsBefore));
    });
  });

  it('lists attended consultations from most recent to oldest', async () => {
    await openHistory();
    const names = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(names).toEqual(['Beto Reciente', 'Carla Media', 'Ana Antigua']);
  });

  it('filters the history by patient name', async () => {
    await openHistory();
    fireEvent.change(screen.getByLabelText('Filtrar por nombre o DNI'), { target: { value: 'carla' } });
    expect(screen.getByText('Carla Media')).toBeInTheDocument();
    expect(screen.queryByText('Beto Reciente')).not.toBeInTheDocument();
  });

  it('filters the history by date', async () => {
    await openHistory();
    fireEvent.change(screen.getByLabelText('Filtrar por fecha'), { target: { value: '2026-10-01' } });
    expect(screen.getByText('Ana Antigua')).toBeInTheDocument();
    expect(screen.queryByText('Carla Media')).not.toBeInTheDocument();
  });

  it('adds a new evolution for the patient without an appointment id', async () => {
    vi.mocked(medicalRecordRepository.createMedicalRecord).mockResolvedValue(mockRecord);
    await openHistory();
    fireEvent.click(screen.getAllByRole('button', { name: /Ver Resumen/i })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar evolución' }));
    fireEvent.change(screen.getByLabelText('Diagnóstico de la evolución'), { target: { value: 'Control' } });
    fireEvent.change(screen.getByLabelText('Notas de la evolución'), { target: { value: 'Llamó por dolor de cabeza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar evolución' }));

    await waitFor(() => expect(medicalRecordRepository.createMedicalRecord).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(medicalRecordRepository.createMedicalRecord).mock.calls[0][0];
    expect(payload).toMatchObject({
      patientId: 'pat-new',
      doctorId: mockDoctor.id,
      diagnosis: 'Control',
      notes: 'Llamó por dolor de cabeza',
    });
    expect(payload.appointmentId).toBeUndefined();
    expect(await screen.findByText('Evolución agregada a la historia clínica.')).toBeInTheDocument();
  });

  it('stores the added evolution against the family member attended in that consultation', async () => {
    vi.mocked(medicalRecordRepository.createMedicalRecord).mockResolvedValue(mockRecord);
    vi.mocked(appointmentRepository.getDoctorAppointments).mockResolvedValue([
      { ...history[1], familyMemberId: 'fm1', familyMemberName: 'Lucía Pérez', familyMemberRelation: 'hijo/a' },
    ]);
    render(<MemoryRouter><DoctorDashboard user={mockDoctor} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Historial/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Ver Resumen/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar evolución' }));
    fireEvent.change(screen.getByLabelText('Diagnóstico de la evolución'), { target: { value: 'Control' } });
    fireEvent.change(screen.getByLabelText('Notas de la evolución'), { target: { value: 'Llamó por dolor de cabeza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar evolución' }));

    await waitFor(() => expect(medicalRecordRepository.createMedicalRecord).toHaveBeenCalledTimes(1));
    expect(vi.mocked(medicalRecordRepository.createMedicalRecord).mock.calls[0][0]).toMatchObject({
      patientId: 'pat-new',
      familyMemberId: 'fm1',
    });
  });

  it('resends the prescription of a past consultation by WhatsApp', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionByAppointmentId).mockResolvedValue(mockPrescription);
    vi.mocked(sendPrescriptionWhatsapp).mockResolvedValue({ ok: true });
    await openHistory();
    fireEvent.click(screen.getAllByRole('button', { name: /Ver Resumen/i })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar por WhatsApp' }));

    expect(await screen.findByText('Receta enviada por WhatsApp.')).toBeInTheDocument();
    expect(sendPrescriptionWhatsapp).toHaveBeenCalledWith('pres1');
  });

  it('shows why the WhatsApp resend failed', async () => {
    vi.mocked(prescriptionRepository.getPrescriptionByAppointmentId).mockResolvedValue(mockPrescription);
    vi.mocked(sendPrescriptionWhatsapp).mockResolvedValue({ ok: false, message: 'El WhatsApp de la empresa no está conectado.' });
    await openHistory();
    fireEvent.click(screen.getAllByRole('button', { name: /Ver Resumen/i })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar por WhatsApp' }));

    expect(await screen.findByText('El WhatsApp de la empresa no está conectado.')).toBeInTheDocument();
  });
});

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
    // The name shows in the history list and again in the modal header.
    expect((await screen.findAllByText('John Wilson')).length).toBeGreaterThanOrEqual(2);

    // Verify data fetching calls
    expect(medicalRecordRepository.getRecordByAppointmentId).toHaveBeenCalledWith('appt1');
    expect(prescriptionRepository.getPrescriptionByAppointmentId).toHaveBeenCalledWith('appt1');

    // Verify content
    expect(await screen.findByText('Lupus (Never is lupus)')).toBeInTheDocument();
    expect(screen.getByText('Vicodin')).toBeInTheDocument();
  });

  it('shows appointment dates as dd/mm/yyyy in the history list and summary modal', async () => {
    vi.mocked(appointmentRepository.getDoctorAppointments).mockResolvedValue(mockAppointments);
    vi.mocked(medicalRecordRepository.getRecordByAppointmentId).mockResolvedValue(mockRecord);
    vi.mocked(prescriptionRepository.getPrescriptionByAppointmentId).mockResolvedValue(mockPrescription);

    renderComponent();

    fireEvent.click(await screen.findByRole('button', { name: /Historial/i }));
    expect(await screen.findByText('10/05/2024')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /Ver Resumen/i }));
    await screen.findByRole('heading', { name: /Resumen/i });
    expect((await screen.findAllByText('10/05/2024')).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/2024-05-10/)).not.toBeInTheDocument();
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
      expect(screen.queryByText(/Cargando datos de la consulta/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Sin diagnóstico registrado para esta consulta/i)).toBeInTheDocument();
    expect(screen.getByText(/Sin prescripciones en esta consulta/i)).toBeInTheDocument();
  });

  it('shows Historia clínica dates on the local day in dd/mm/yyyy and visit types in Spanish', async () => {
    vi.mocked(dashboardRepository.getDoctorQueue).mockResolvedValue([
      {
        appointment_id: 'appt-queue-1',
        patient_id: 'pat1',
        patient_name: 'John Wilson',
        patient_avatar: null,
        patient_plan: null,
        doctor_id: 'doc1',
        scheduled_at: '2026-08-26T19:30:00Z',
        status: 'confirmed',
        consultation_metadata: {},
      },
    ] as any);
    vi.mocked(medicalRecordRepository.getRecordsByPatientId).mockResolvedValue([
      { ...mockRecord, date: '2026-08-26T19:30:00+00:00', type: 'checkup' },
    ]);
    vi.mocked(medicalDocumentRepository.getDocumentsByPatientId).mockResolvedValue([
      { id: 'doc-1', patientId: 'pat1', name: 'Hemograma', type: 'lab_result', url: 'x', date: '2026-08-26' } as any,
    ]);

    renderComponent();

    fireEvent.click(await screen.findByRole('button', { name: /Expediente/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Evoluciones/i }));

    expect(await screen.findByText('26/08/2026 16:30')).toBeInTheDocument();
    expect(screen.getByText('Chequeo General')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-26T19:30:00+00:00')).not.toBeInTheDocument();
    expect(screen.queryByText('checkup')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Estudios/i }));
    expect(await screen.findByText(/Laboratorio · 26\/08\/2026/)).toBeInTheDocument();
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
