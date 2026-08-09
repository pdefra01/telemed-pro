import { describe, it, expect } from 'vitest';
import { isEmailLike, toLegacyPatientEmail } from '../patientIdentifier';

describe('isEmailLike', () => {
  it('returns true when the value contains @', () => {
    expect(isEmailLike('juan@test.com')).toBe(true);
  });

  it('returns false for a bare DNI (no @)', () => {
    expect(isEmailLike('30123456')).toBe(false);
  });

  it('returns false for a bare phone number (no @)', () => {
    expect(isEmailLike('3876123899')).toBe(false);
  });
});

describe('toLegacyPatientEmail', () => {
  it('maps a short value (<=8 chars, DNI) to the synthetic domain as-is', () => {
    expect(toLegacyPatientEmail('30123456')).toBe('30123456@medinex-paciente.com');
  });

  it('maps a longer value (>8 chars, phone) by stripping non-digit characters first', () => {
    expect(toLegacyPatientEmail('387-612-3899')).toBe('3876123899@medinex-paciente.com');
  });

  it('treats exactly 8 characters as a DNI (boundary, unchanged)', () => {
    expect(toLegacyPatientEmail('12345678')).toBe('12345678@medinex-paciente.com');
  });
});
