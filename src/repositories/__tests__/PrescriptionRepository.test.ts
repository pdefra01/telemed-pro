import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PrescriptionRepository } from '../PrescriptionRepository';
import { supabase } from '../../services/supabase';

// Mock de Supabase
vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
  },
}));

describe('PrescriptionRepository (TDD)', () => {
  let repository: PrescriptionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrescriptionRepository();
  });

  describe('getPrescriptionByAppointmentId', () => {
    it('should fetch a prescription by appointment ID from Supabase', async () => {
      const mockPrescription = {
        id: 'rx-1',
        appointment_id: 'app-1',
        patient_id: 'p1',
        doctor_name: 'Dr. Smith',
        status: 'active',
        medications: [{ name: 'Ibuprofen', instructions: 'Every 8h', quantity: 1 }],
        expiration_date: '2024-06-20',
        date: '2024-05-20',
        digital_signature: 'SIG-123',
      };

      const supabaseMock = supabase as any;
      supabaseMock.maybeSingle.mockResolvedValue({ data: mockPrescription, error: null });

      const prescription = await repository.getPrescriptionByAppointmentId('app-1');

      expect(prescription).toBeDefined();
      expect(prescription?.medications).toHaveLength(1);
      expect(supabaseMock.from).toHaveBeenCalledWith('prescriptions');
      expect(supabaseMock.eq).toHaveBeenCalledWith('appointment_id', 'app-1');
    });
  });

  describe('createPrescription', () => {
    it('should insert a new prescription into Supabase', async () => {
      const newPrescriptionData = {
        appointmentId: 'app-1',
        patientId: 'p1',
        doctorId: 'd1',
        doctorName: 'Dr. Smith',
        medications: [{ name: 'Amoxicillin', instructions: '1 capsule every 8 hours', quantity: 1 }],
      };

      const mockInserted = { 
        ...newPrescriptionData, 
        id: 'rx-new', 
        status: 'active',
        digital_signature: 'SIG-NEW',
        expiration_date: '2024-06-21',
        date: '2024-05-21'
      };

      const supabaseMock = supabase as any;
      supabaseMock.select.mockReturnThis();
      supabaseMock.single.mockResolvedValue({ data: mockInserted, error: null });

      const result = await repository.createPrescription(newPrescriptionData);

      expect(result.id).toBeDefined();
      expect(supabaseMock.from).toHaveBeenCalledWith('prescriptions');
      expect(supabaseMock.insert).toHaveBeenCalled();
    });
  });
});
