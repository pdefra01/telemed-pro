import { describe, it, expect, beforeEach, vi } from 'vitest';
import { medicalRecordRepository } from './MedicalRecordRepository';
import { supabase } from '../services/supabase';

const VALID_PATIENT_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_APPOINTMENT_UUID = '22222222-2222-2222-2222-222222222222';

// Mock de Supabase
vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
  },
}));

describe('MedicalRecordRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new MedicalRecord', async () => {
    const newRecord = {
      patientId: VALID_PATIENT_UUID,
      diagnosis: 'Flu',
      notes: 'Rest and hydration',
      doctorName: 'Dr. House',
      type: 'consultation' as const,
    };

    const mockInserted = {
      id: 'mr-new-id',
      appointment_id: null,
      patient_id: VALID_PATIENT_UUID,
      doctor_id: null,
      doctor_name: 'Dr. House',
      created_at: new Date().toISOString(),
      diagnosis: 'Flu',
      notes: 'Rest and hydration',
      type: 'consultation',
      attachments: []
    };

    const supabaseMock = supabase as any;
    supabaseMock.select.mockReturnThis();
    supabaseMock.single.mockResolvedValue({ data: mockInserted, error: null });

    const record = await medicalRecordRepository.createMedicalRecord(newRecord);

    expect(record).toBeDefined();
    expect(record.id).toBeDefined();
    expect(record.patientId).toBe(VALID_PATIENT_UUID);
    expect(record.diagnosis).toBe('Flu');
    expect(record.date).toBeDefined();
  });

  it('should get a record by appointmentId', async () => {
    const appointmentId = VALID_APPOINTMENT_UUID;
    const mockRecord = {
      id: 'mr-get-id',
      appointment_id: appointmentId,
      patient_id: VALID_PATIENT_UUID,
      doctor_id: null,
      doctor_name: 'Dr. Smith',
      created_at: new Date().toISOString(),
      diagnosis: 'Headache',
      notes: 'Take aspirin',
      type: 'consultation',
      attachments: []
    };

    const supabaseMock = supabase as any;
    supabaseMock.maybeSingle.mockResolvedValue({ data: mockRecord, error: null });

    const record = await medicalRecordRepository.getRecordByAppointmentId(appointmentId);
    expect(record).toBeDefined();
    expect(record?.diagnosis).toBe('Headache');
    expect(record?.appointmentId).toBe(appointmentId);
  });
});
