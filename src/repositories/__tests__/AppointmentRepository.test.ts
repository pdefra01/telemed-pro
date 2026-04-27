import { vi, describe, it, expect, beforeEach } from 'vitest';
import { appointmentRepository } from '../AppointmentRepository';
import { supabase } from '../../services/supabase';

// Mock de Supabase
vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  },
}));

describe('AppointmentRepository (TDD - Path 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDoctorAppointments', () => {
    // Escenario 1: El médico recupera sus turnos activos (confirmados o pendientes)
    it('should filter appointments by an array of statuses', async () => {
      // Setup: Mock data returned by Supabase
      const mockData = [
        { id: '1', status: 'pending', scheduled_at: new Date().toISOString() },
        { id: '2', status: 'confirmed', scheduled_at: new Date().toISOString() },
      ];

      // Mock chain needs to support .from().select().eq().in().order()
      // We rely on mockReturnThis() defined in the global mock for basic chaining.
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue(supabaseMock);
      
      // Ensure .in() returns mock for chaining, and define its assertion spy
      supabaseMock.in = vi.fn().mockReturnValue(supabaseMock);
      
      // Ensure .order() returns the final result
      supabaseMock.order = vi.fn().mockReturnValue({ data: mockData, error: null });

      // Action: Calling the method with statuses we want to filter by
      // NOTE: Signature updated in implementation.
      const appointments = await appointmentRepository.getDoctorAppointments('doc1', { status: ['pending', 'confirmed'] });

      // Assertions
      expect(appointments).toHaveLength(2);
      expect(appointments[0].id).toBe('1');
      expect(supabaseMock.from).toHaveBeenCalledWith('appointments');
      expect(supabaseMock.eq).toHaveBeenCalledWith('doctor_id', 'doc1');
      
      // We expect 'in' to be called, but current impl calls 'neq'
      expect(supabaseMock.in).toHaveBeenCalledWith('status', ['pending', 'confirmed']);
    });
  });

  // Escenario 3: El médico guarda notas médicas.
  describe('saveAppointmentNotes', () => {
    it('should update the appointment with notes', async () => {
      // Setup
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.update.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue({ data: null, error: null });

      const notesContent = 'Paciente presenta... TDD is cool.';

      // Action: Implementation exists.
      await appointmentRepository.saveAppointmentNotes('app1', notesContent);

      // Assertions
      expect(supabaseMock.from).toHaveBeenCalledWith('appointments');
      expect(supabaseMock.update).toHaveBeenCalledWith({ notes: notesContent });
      expect(supabaseMock.eq).toHaveBeenCalledWith('id', 'app1');
    });
  });

  // Escenario 4: El médico marca el turno como completado.
  describe('completeAppointment', () => {
    it('should update status to "completed"', async () => {
      // Setup
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.update.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue({ data: null, error: null });

      // Action: Implementation exists.
      await appointmentRepository.completeAppointment('app1');

      // Assertions
      expect(supabaseMock.from).toHaveBeenCalledWith('appointments');
      // Status 'completed' constraint already updated in previous step.
      expect(supabaseMock.update).toHaveBeenCalledWith({ status: 'completed' }); 
      expect(supabaseMock.eq).toHaveBeenCalledWith('id', 'app1');
    });
  });
  // Escenario 5: Creación de un nuevo turno (Scheduler)
  describe('createAppointment', () => {
    it('should insert a new appointment into Supabase', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.single.mockResolvedValue({ data: { id: 'new-app-id' }, error: null });

      const appointmentData = {
        patient_id: 'p1',
        doctor_id: 'd1',
        scheduled_at: '2026-05-01T10:00:00Z',
        specialty: 'Cardiología',
        status: 'pending' as const
      };

      const result = await appointmentRepository.createAppointment(appointmentData);

      expect(supabaseMock.from).toHaveBeenCalledWith('appointments');
      expect(supabaseMock.insert).toHaveBeenCalledWith(expect.objectContaining({
        patient_id: 'p1',
        doctor_id: 'd1'
      }));
      expect(result.id).toBe('new-app-id');
    });
  });
});
