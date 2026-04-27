import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PostConsultation from '../PostConsultation';
import { supabase } from '../../../services/supabase';
import { appointmentRepository } from '../../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../../repositories/MedicalRecordRepository';
import { medicalDocumentRepository } from '../../../repositories/MedicalDocumentRepository';

// Mock dependencies
vi.mock('../../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('../../../repositories/AppointmentRepository', () => ({
  appointmentRepository: {
    getAppointmentById: vi.fn(),
  },
}));

vi.mock('../../../repositories/MedicalRecordRepository', () => ({
  medicalRecordRepository: {
    getRecordsByPatientId: vi.fn(),
  },
}));

vi.mock('../../../repositories/MedicalDocumentRepository', () => ({
  medicalDocumentRepository: {
    getDocumentsByPatientId: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ appointmentId: 'test-appointment-id' }),
  };
});

const mockDoctor = {
  id: 'doc-123',
  name: 'Dr. Test',
  email: 'test@doctor.com',
  role: 'doctor',
  specialty: 'Cardiology',
};

describe('PostConsultation Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (appointmentRepository.getAppointmentById as any).mockResolvedValue({
      id: 'test-appointment-id',
      patientId: 'patient-123',
      notes: 'Initial notes',
    });
    (medicalRecordRepository.getRecordsByPatientId as any).mockResolvedValue([]);
    (medicalDocumentRepository.getDocumentsByPatientId as any).mockResolvedValue([]);
  });

  it('renders correctly and loads data', async () => {
    render(
      <BrowserRouter>
        <PostConsultation user={mockDoctor as any} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Documentación/i)).toBeDefined();
    }, { timeout: 4000 });

    expect(screen.getByDisplayValue('Initial notes')).toBeDefined();
  });

  it('shows error if diagnosis is empty when saving', async () => {
    render(
      <BrowserRouter>
        <PostConsultation user={mockDoctor as any} />
      </BrowserRouter>
    );

    await waitFor(() => screen.getByText(/Documentación/i), { timeout: 4000 });

    const saveButton = screen.getByRole('button', { name: /Finalizar Consulta/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/El diagnóstico es obligatorio/i)).toBeDefined();
    });
  });

  it('calls edge function when saving valid data', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { success: true }, error: null });

    render(
      <BrowserRouter>
        <PostConsultation user={mockDoctor as any} />
      </BrowserRouter>
    );

    await waitFor(() => screen.getByText(/Documentación/i), { timeout: 4000 });

    const diagnosisInput = screen.getByPlaceholderText(/Diagnóstico Principal/i);
    fireEvent.change(diagnosisInput, { target: { value: 'Diagnóstico de prueba' } });

    const saveButton = screen.getByRole('button', { name: /Finalizar Consulta/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('finalize-consultation', expect.objectContaining({
        body: expect.objectContaining({
          appointmentId: 'test-appointment-id',
          diagnosis: 'Diagnóstico de prueba',
        }),
      }));
    }, { timeout: 4000 });

    // Wait for navigation (3.5s delay in component)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/doctor', expect.any(Object));
    }, { timeout: 6000 });
  }, 10000);
});


