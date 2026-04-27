import { describe, it, expect, beforeEach, vi } from 'vitest';
import { medicalRecordRepository } from './MedicalRecordRepository';

describe('MedicalRecordRepository', () => {
  beforeEach(() => {
    // Si tuviéramos un store en memoria para mockear, lo limpiaríamos aquí.
  });

  it('should create a new MedicalRecord', async () => {
    const newRecord = {
      patientId: 'p-1',
      diagnosis: 'Flu',
      notes: 'Rest and hydration',
      doctorName: 'Dr. House',
      type: 'consultation' as const,
    };

    const record = await medicalRecordRepository.createMedicalRecord(newRecord);

    expect(record).toBeDefined();
    expect(record.id).toBeDefined();
    expect(record.patientId).toBe('p-1');
    expect(record.diagnosis).toBe('Flu');
    expect(record.date).toBeDefined();
  });

  it('should get a record by appointmentId', async () => {
    const appointmentId = 'appt-123';
    await medicalRecordRepository.createMedicalRecord({
      patientId: 'p-1',
      appointmentId,
      diagnosis: 'Headache',
      notes: 'Take aspirin',
      doctorName: 'Dr. Smith',
      type: 'consultation',
    });

    const record = await medicalRecordRepository.getRecordByAppointmentId(appointmentId);
    expect(record).toBeDefined();
    expect(record?.diagnosis).toBe('Headache');
    expect(record?.appointmentId).toBe(appointmentId);
  });
});
