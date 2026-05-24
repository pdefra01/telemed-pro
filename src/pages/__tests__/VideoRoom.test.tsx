import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import VideoRoom from '../VideoRoom';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../../context/ToastContext';

// Mock de repositorios
vi.mock('../../repositories/AppointmentRepository', () => ({
  appointmentRepository: {
    saveAppointmentNotes: vi.fn().mockResolvedValue(undefined),
    completeAppointment: vi.fn().mockResolvedValue(undefined),
    getAppointmentById: vi.fn().mockResolvedValue({
      id: 'app1',
      patientId: 'pat1',
      patientName: 'Juan Pérez',
      doctorId: 'doc1',
      doctorName: 'Dr. García',
      date: '2024-05-20',
      time: '14:00',
      status: 'confirmed',
      type: 'video'
    }),
    getDoctorAppointments: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../repositories/MedicalRecordRepository', () => ({
  medicalRecordRepository: {
    getRecordsByPatientId: vi.fn().mockResolvedValue([]),
  },
}));

// Mock de supabase (para el token fetch y canales)
vi.mock('../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { token: 'mock-token-123' },
        error: null,
      }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

// Mock de LiveKit components — no necesitamos la videollamada real en tests unitarios
vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => <div data-testid="livekit-room">{children}</div>,
  VideoConference: () => <div data-testid="video-conference">VideoConference Mock</div>,
  RoomAudioRenderer: () => <div data-testid="room-audio">Audio Mock</div>,
  useLocalParticipant: () => ({
    localParticipant: { identity: 'mock-identity' },
    isMicrophoneEnabled: true,
    isCameraEnabled: true,
  }),
  useConnectionQualityIndicator: () => ({
    quality: 'excellent',
  }),
}));

vi.mock('@livekit/components-styles', () => ({}));

vi.mock('../../components/video/WaitingExperience', () => ({
  WaitingExperience: ({ onReady }: { onReady: () => void }) => {
    React.useEffect(() => {
      onReady();
    }, [onReady]);
    return <div data-testid="waiting-experience-mock">Waiting Mock</div>;
  },
}));

// Mock import.meta.env
vi.stubEnv('VITE_LIVEKIT_URL', 'wss://fake-livekit.example.com');

const doctorUser = {
  id: 'doc1',
  name: 'Dr. García',
  email: 'garcia@test.com',
  role: 'doctor' as const,
};

const patientUser = {
  id: 'pat1',
  name: 'Juan Pérez',
  email: 'juan@test.com',
  role: 'patient' as const,
};

function renderVideoRoom(user: any = doctorUser, appointmentId = 'app1') {
  return render(
    <MemoryRouter initialEntries={[`/room/${appointmentId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/room/:appointmentId" element={<VideoRoom user={user} />} />
          <Route path="/doctor/post-consultation/:appointmentId" element={<div data-testid="post-consultation-page">Post Consultation</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('VideoRoom — Doctor Notes Panel (Spec Task 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ token: 'mock-token-123' }),
    }));
  });

  // Spec AC #3: Panel de notas solo visible para el Doctor
  it('should show the notes panel only for doctor users', async () => {
    renderVideoRoom(doctorUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/Documente hallazgos/i)).toBeInTheDocument();
  });

  it('should NOT show the notes panel for patient users', async () => {
    renderVideoRoom(patientUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/Documente hallazgos/i)).not.toBeInTheDocument();
  });

  // Spec Scenario 3: Doctor saves medical notes
  it('should call saveAppointmentNotes when the doctor clicks save', async () => {
    renderVideoRoom(doctorUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Documente hallazgos/i);
    fireEvent.change(textarea, { target: { value: 'Paciente presenta fiebre alta...' } });

    const saveButton = screen.getByRole('button', { name: /Actualizar Ficha/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(appointmentRepository.saveAppointmentNotes).toHaveBeenCalledWith(
        'app1',
        'Paciente presenta fiebre alta...'
      );
    });
  });

  // Spec AC #5 & #6 & Scenario 4: "Finalizar Consulta" button
  it('should show "Finalizar Consulta" button only for doctors', async () => {
    renderVideoRoom(doctorUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Finalizar Turno/i })).toBeInTheDocument();
  });

  it('should NOT show "Finalizar Consulta" button for patients', async () => {
    renderVideoRoom(patientUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Finalizar Turno/i })).not.toBeInTheDocument();
  });

  // Spec Scenario 4: Clicking "Finalizar" saves notes AND completes appointment
  it('should save notes and complete appointment when clicking "Finalizar Consulta"', async () => {
    renderVideoRoom(doctorUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Documente hallazgos/i);
    fireEvent.change(textarea, { target: { value: 'Diagnóstico final: gripe estacional' } });

    const finalizarButton = screen.getByRole('button', { name: /Finalizar Turno/i });
    fireEvent.click(finalizarButton);

    await waitFor(() => {
      // Debe guardar las notas primero
      expect(appointmentRepository.saveAppointmentNotes).toHaveBeenCalledWith(
        'app1',
        'Diagnóstico final: gripe estacional'
      );
      // Y después marcar como completado
      expect(appointmentRepository.completeAppointment).toHaveBeenCalledWith('app1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('post-consultation-page')).toBeInTheDocument();
    });
  });

  it('should render Retry button on token fetch failure and refetch on click', async () => {
    // Mock fetch to fail first
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network connection lost')));

    renderVideoRoom(doctorUser);

    // Expect error screen and Retry button
    await waitFor(() => {
      expect(screen.getByText(/Fallo de Conexión/i)).toBeInTheDocument();
      expect(screen.getByText(/Network connection lost/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /Reintentar/i });
    expect(retryButton).toBeInTheDocument();

    // Mock fetch to succeed next time
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ token: 'recovered-mock-token-456' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Click retry
    fireEvent.click(retryButton);

    // Expect it to recover and show LiveKit room
    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

