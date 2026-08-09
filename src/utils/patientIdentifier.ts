// src/utils/patientIdentifier.ts
//
// Pure helpers for resolving a patient login identifier (email or legacy
// DNI/phone) into a Supabase Auth email. Extracted verbatim from
// Auth.tsx:82-97 (design D6/"File Changes") so the mapping logic is
// unit-testable without rendering the form.

/** True when the entered identifier looks like a real email address. */
export function isEmailLike(value: string): boolean {
  return value.includes('@');
}

/**
 * Maps a bare DNI or phone number to the legacy synthetic-domain email used
 * by `AuthRepository.registerPatient` (`${value}@medinex-paciente.com`).
 * Values longer than 8 characters are treated as phone numbers and have
 * non-digit characters stripped first (spaces/dashes); 8 characters or
 * fewer are treated as a DNI and used as-is.
 */
export function toLegacyPatientEmail(value: string): string {
  if (value.length > 8) {
    const cleanPhone = value.replace(/\D/g, '');
    return `${cleanPhone}@medinex-paciente.com`;
  }
  return `${value}@medinex-paciente.com`;
}
