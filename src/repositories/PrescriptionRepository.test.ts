import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prescriptionRepository } from './PrescriptionRepository';

describe('PrescriptionRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-05-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a new Prescription with default expiration and digital signature', async () => {
    const newPrescription = {
      patientId: 'p-1',
      doctorId: 'd-1',
      doctorName: 'Dr. House',
      medications: [
        {
          name: 'Ibuprofen 400mg',
          instructions: '1 pill every 8 hours',
          quantity: 1
        }
      ],
    };

    const recordResult = await prescriptionRepository.createPrescription(newPrescription);

    expect(recordResult).toBeDefined();
    expect(recordResult.id).toBeDefined();
    expect(recordResult.patientId).toBe('p-1');
    expect(recordResult.medications[0].name).toBe('Ibuprofen 400mg');
    // Default expiration should be 30 days from 2024-05-01, which is 2024-05-31
    expect(recordResult.expirationDate).toBe('2024-05-31');
    expect(recordResult.digitalSignature).toBeDefined();
    expect(recordResult.digitalSignature).toContain('SIG-');
    expect(recordResult.status).toBe('active');
  });

  it('should get a prescription by appointmentId', async () => {
    const appointmentId = 'appt-rx-123';
    await prescriptionRepository.createPrescription({
      patientId: 'p-1',
      appointmentId,
      doctorId: 'd-1',
      doctorName: 'Dr. House',
      medications: [{ name: 'Amoxicillin', instructions: 'Twice a day', quantity: 1 }],
    });

    const prescription = await prescriptionRepository.getPrescriptionByAppointmentId(appointmentId);
    expect(prescription).toBeDefined();
    expect(prescription?.appointmentId).toBe(appointmentId);
    expect(prescription?.medications[0].name).toBe('Amoxicillin');
  });
});
