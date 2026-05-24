import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prescriptionRepository } from './PrescriptionRepository';
import { supabase } from '../services/supabase';

const VALID_PATIENT_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_DOCTOR_UUID = '33333333-3333-3333-3333-333333333333';
const VALID_APPOINTMENT_UUID = '44444444-4444-4444-4444-444444444444';

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

describe('PrescriptionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-05-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a new Prescription with default expiration and digital signature', async () => {
    const newPrescription = {
      patientId: VALID_PATIENT_UUID,
      doctorId: VALID_DOCTOR_UUID,
      doctorName: 'Dr. House',
      medications: [
        {
          name: 'Ibuprofen 400mg',
          instructions: '1 pill every 8 hours',
          quantity: 1
        }
      ],
    };

    const mockInserted = {
      id: 'pr-new-id',
      appointment_id: null,
      patient_id: VALID_PATIENT_UUID,
      doctor_id: VALID_DOCTOR_UUID,
      doctor_name: 'Dr. House',
      medications: newPrescription.medications,
      expiration_date: '2024-05-31',
      digital_signature: 'SIG-MOCK-123',
      status: 'active'
    };

    const supabaseMock = supabase as any;
    supabaseMock.select.mockReturnThis();
    supabaseMock.single.mockResolvedValue({ data: mockInserted, error: null });

    const recordResult = await prescriptionRepository.createPrescription(newPrescription);

    expect(recordResult).toBeDefined();
    expect(recordResult.id).toBeDefined();
    expect(recordResult.patientId).toBe(VALID_PATIENT_UUID);
    expect(recordResult.medications[0].name).toBe('Ibuprofen 400mg');
    // Default expiration should be 30 days from 2024-05-01, which is 2024-05-31
    expect(recordResult.expirationDate).toBe('2024-05-31');
    expect(recordResult.digitalSignature).toBeDefined();
    expect(recordResult.digitalSignature).toContain('SIG-');
    expect(recordResult.status).toBe('active');
  });

  it('should get a prescription by appointmentId', async () => {
    const appointmentId = VALID_APPOINTMENT_UUID;
    const mockPrescription = {
      id: 'pr-get-id',
      appointment_id: appointmentId,
      patient_id: VALID_PATIENT_UUID,
      doctor_id: VALID_DOCTOR_UUID,
      doctor_name: 'Dr. House',
      medications: [{ name: 'Amoxicillin', instructions: 'Twice a day', quantity: 1 }],
      expiration_date: '2024-05-31',
      digital_signature: 'SIG-MOCK-456',
      status: 'active'
    };

    const supabaseMock = supabase as any;
    supabaseMock.maybeSingle.mockResolvedValue({ data: mockPrescription, error: null });

    const prescription = await prescriptionRepository.getPrescriptionByAppointmentId(appointmentId);
    expect(prescription).toBeDefined();
    expect(prescription?.appointmentId).toBe(appointmentId);
    expect(prescription?.medications[0].name).toBe('Amoxicillin');
  });
});
