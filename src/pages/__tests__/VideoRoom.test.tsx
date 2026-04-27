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
  },
}));

// Mock de supabase (para el token fetch)
vi.mock('../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { token: 'mock-token-123' },
        error: null,
      }),
    },
  },
}));

// Mock de LiveKit components — no necesitamos la videollamada real en tests unitarios
vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => <div data-testid="livekit-room">{children}</div>,
  VideoConference: () => <div data-testid="video-conference">VideoConference Mock</div>,
  RoomAudioRenderer: () => <div data-testid="room-audio">Audio Mock</div>,
}));

vi.mock('@livekit/components-styles', () => ({}));

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
  });

  // Spec AC #3: Panel de notas solo visible para el Doctor
  it('should show the notes panel only for doctor users', async () => {
    renderVideoRoom(doctorUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/notas médicas/i)).toBeInTheDocument();
  });

  it('should NOT show the notes panel for patient users', async () => {
    renderVideoRoom(patientUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/notas médicas/i)).not.toBeInTheDocument();
  });

  // Spec Scenario 3: Doctor saves medical notes
  it('should call saveAppointmentNotes when the doctor clicks save', async () => {
    renderVideoRoom(doctorUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/notas médicas/i);
    fireEvent.change(textarea, { target: { value: 'Paciente presenta fiebre alta...' } });

    const saveButton = screen.getByRole('button', { name: /guardar notas/i });
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

    expect(screen.getByRole('button', { name: /finalizar consulta/i })).toBeInTheDocument();
  });

  it('should NOT show "Finalizar Consulta" button for patients', async () => {
    renderVideoRoom(patientUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /finalizar consulta/i })).not.toBeInTheDocument();
  });

  // Spec Scenario 4: Clicking "Finalizar" saves notes AND completes appointment
  it('should save notes and complete appointment when clicking "Finalizar Consulta"', async () => {
    renderVideoRoom(doctorUser);

    await waitFor(() => {
      expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/notas médicas/i);
    fireEvent.change(textarea, { target: { value: 'Diagnóstico final: gripe estacional' } });

    const finalizarButton = screen.getByRole('button', { name: /finalizar consulta/i });
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
});
