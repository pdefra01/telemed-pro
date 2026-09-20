import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PostConsultation from '../PostConsultation';
import { supabase } from '../../../services/supabase';
import { appointmentRepository } from '../../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../../repositories/MedicalRecordRepository';
import { medicalDocumentRepository } from '../../../repositories/MedicalDocumentRepository';
import { prescriptionRepository } from '../../../repositories/PrescriptionRepository';

// Mock dependencies
vi.mock('../../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } }),
    },
  },
}));

vi.mock('../../../repositories/PrescriptionRepository', () => ({
  prescriptionRepository: {
    getPrescriptionByAppointmentId: vi.fn(),
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

    const diagnosisInput = screen.getByLabelText(/Diagnóstico principal/i);
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

  describe('WhatsApp delivery of the prescription', () => {
    const PDF_URL = 'https://storage.example/receta.pdf';

    const finalizeConsultation = async () => {
      (supabase.functions.invoke as any).mockResolvedValue({ data: { pdfUrl: PDF_URL }, error: null });
      (prescriptionRepository.getPrescriptionByAppointmentId as any).mockResolvedValue({ id: 'rx-1' });

      render(
        <BrowserRouter>
          <PostConsultation user={mockDoctor as any} />
        </BrowserRouter>
      );
      await waitFor(() => screen.getByText(/Documentación/i), { timeout: 4000 });
      fireEvent.change(screen.getByLabelText(/Diagnóstico principal/i), { target: { value: 'Dx' } });
      fireEvent.click(screen.getByRole('button', { name: /Finalizar Consulta/i }));
    };

    beforeEach(() => {
      mockNavigate.mockClear();
    });

    afterEach(() => {
      // Unmount so a pending redirect timer from this test cannot leak into the next one.
      cleanup();
      vi.unstubAllGlobals();
    });

    it('sends the prescription automatically from the company number and confirms it', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'sent' }) });
      vi.stubGlobal('fetch', fetchMock);

      await finalizeConsultation();

      expect(await screen.findByText(/Enviado por WhatsApp/i, undefined, { timeout: 6000 })).toBeDefined();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prescriptions/rx-1/send-whatsapp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-123' }),
        })
      );
    }, 15000);

    it('does not expose the doctor number: no wa.me link is offered', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'sent' }) }));

      await finalizeConsultation();
      await screen.findByText(/Enviado por WhatsApp/i, undefined, { timeout: 6000 });

      expect(document.querySelector('a[href*="wa.me"]')).toBeNull();
    }, 15000);

    it('shows the failure reason, offers a retry and does not leave the page automatically', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 503, json: async () => ({ status: 'failed', reason: 'session_not_ready' }) });
      vi.stubGlobal('fetch', fetchMock);

      await finalizeConsultation();

      expect(await screen.findByText(/no está conectado/i, undefined, { timeout: 6000 })).toBeDefined();
      const retry = screen.getByRole('button', { name: /Reenviar por WhatsApp/i });

      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'sent' }) });
      fireEvent.click(retry);
      expect(await screen.findByText(/Enviado por WhatsApp/i)).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }, 15000);

    it('stays on the page after a failed send instead of redirecting', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ status: 'failed', reason: 'session_not_ready' }) }));

      await finalizeConsultation();
      await screen.findByText(/no está conectado/i, undefined, { timeout: 6000 });
      await new Promise(resolve => setTimeout(resolve, 4000));

      expect(mockNavigate).not.toHaveBeenCalledWith('/doctor', expect.anything());
    }, 20000);
  });
});
