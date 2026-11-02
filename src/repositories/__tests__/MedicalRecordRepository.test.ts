import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MedicalRecordRepository } from '../MedicalRecordRepository';
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

describe('MedicalRecordRepository (TDD)', () => {
  let repository: MedicalRecordRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new MedicalRecordRepository();
  });

  describe('getRecordByAppointmentId', () => {
    it('should fetch a medical record by appointment ID from Supabase', async () => {
      const mockRecord = {
        id: 'mr-1',
        appointment_id: 'app-1',
        patient_id: 'p1',
        doctor_name: 'Dr. Smith',
        diagnosis: 'Flu',
        notes: 'Rest and fluids',
        date: '2024-05-20',
      };

      const supabaseMock = supabase as any;
      supabaseMock.maybeSingle.mockResolvedValue({ data: mockRecord, error: null });

      const record = await repository.getRecordByAppointmentId('app-1');

      expect(record).toBeDefined();
      expect(record?.diagnosis).toBe('Flu');
      expect(supabaseMock.from).toHaveBeenCalledWith('medical_records');
      expect(supabaseMock.eq).toHaveBeenCalledWith('appointment_id', 'app-1');
    });

    it("joins the doctor's current professional title", async () => {
      const supabaseMock = supabase as any;
      supabaseMock.maybeSingle.mockResolvedValue({
        data: { id: 'mr-1', doctor_name: 'Lucía Fernández', doctor: { professional_title: 'Dra.' } },
        error: null,
      });

      const record = await repository.getRecordByAppointmentId('app-1');

      expect(supabaseMock.select).toHaveBeenCalledWith('*, doctor:profiles!doctor_id(professional_title)');
      expect(record?.doctorTitle).toBe('Dra.');
    });

    it('should return null if no record is found', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null });

      const record = await repository.getRecordByAppointmentId('non-existent');

      expect(record).toBeNull();
    });
  });

  describe('attended family member', () => {
    const base = {
      patientId: 'p1',
      doctorId: 'd1',
      doctorName: 'Dr. Smith',
      diagnosis: 'Control',
      notes: 'Llamó por dolor de cabeza',
      type: 'consultation' as const,
    };

    it('stores the attended member on a new record, and null for the titular', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.select.mockReturnThis();
      supabaseMock.single.mockResolvedValue({ data: { id: 'mr-new', family_member_id: 'fm1' }, error: null });

      const created = await repository.createMedicalRecord({ ...base, familyMemberId: 'fm1' });
      expect(supabaseMock.insert).toHaveBeenLastCalledWith([expect.objectContaining({ family_member_id: 'fm1' })]);
      expect(created.familyMemberId).toBe('fm1');

      supabaseMock.single.mockResolvedValue({ data: { id: 'mr-2', family_member_id: null }, error: null });
      const titular = await repository.createMedicalRecord(base);
      expect(supabaseMock.insert).toHaveBeenLastCalledWith([expect.objectContaining({ family_member_id: null })]);
      expect(titular.familyMemberId).toBeUndefined();
    });

    it('maps the attended member when reading a record', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.maybeSingle.mockResolvedValue({ data: { id: 'mr-1', family_member_id: 'fm1' }, error: null });

      const record = await repository.getRecordByAppointmentId('app-1');

      expect(record?.familyMemberId).toBe('fm1');
    });
  });

  describe('createMedicalRecord', () => {
    it('should insert a new medical record into Supabase', async () => {
      const newRecordData = {
        appointmentId: 'app-1',
        patientId: 'p1',
        doctorId: 'd1',
        doctorName: 'Dr. Smith',
        diagnosis: 'Cold',
        notes: 'Take aspirin',
        type: 'consultation' as const,
      };

      const mockInserted = { ...newRecordData, id: 'mr-new', date: '2024-05-21' };

      const supabaseMock = supabase as any;
      supabaseMock.select.mockReturnThis();
      supabaseMock.single.mockResolvedValue({ data: mockInserted, error: null });

      const result = await repository.createMedicalRecord(newRecordData);

      expect(result.id).toBe('mr-new');
      expect(supabaseMock.from).toHaveBeenCalledWith('medical_records');
      expect(supabaseMock.insert).toHaveBeenCalled();
    });
  });
});
