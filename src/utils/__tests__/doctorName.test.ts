import { describe, it, expect } from 'vitest';
import { formatDoctorName, normalizeProfessionalTitle } from '../doctorName';

describe('normalizeProfessionalTitle', () => {
  it.each([
    ['Dr.', 'Dr.'],
    ['Dra.', 'Dra.'],
    [undefined, 'Dr.'],
    [null, 'Dr.'],
    ['', 'Dr.'],
    ['Lic.', 'Dr.'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalizeProfessionalTitle(input)).toBe(expected);
  });
});

describe('formatDoctorName', () => {
  it('prefixes the professional title', () => {
    expect(formatDoctorName('Dra.', 'Lucía Fernández')).toBe('Dra. Lucía Fernández');
    expect(formatDoctorName('Dr.', 'Sergio Dib Ashur')).toBe('Dr. Sergio Dib Ashur');
  });

  it('falls back to Dr. for a missing or invalid title', () => {
    expect(formatDoctorName(undefined, 'Sergio Dib')).toBe('Dr. Sergio Dib');
    expect(formatDoctorName(null, 'Sergio Dib')).toBe('Dr. Sergio Dib');
    expect(formatDoctorName('Lic.', 'Sergio Dib')).toBe('Dr. Sergio Dib');
  });

  it.each([
    ['Dra. Lucía Fernández', 'Dra.', 'Dra. Lucía Fernández'],
    ['Dr. Pablo Médico', 'Dra.', 'Dra. Pablo Médico'],
    ['Dr/a Ana Ruiz', 'Dra.', 'Dra. Ana Ruiz'],
    ['dra lucía fernández', 'Dra.', 'Dra. lucía fernández'],
    ['  Dr.   House  ', 'Dr.', 'Dr. House'],
  ])('strips a title already in the name (%s)', (name, title, expected) => {
    expect(formatDoctorName(title, name)).toBe(expected);
  });

  it('does not strip names that merely start with the same letters', () => {
    expect(formatDoctorName('Dr.', 'Drago Pérez')).toBe('Dr. Drago Pérez');
    expect(formatDoctorName('Dra.', 'Draco Malfoy')).toBe('Dra. Draco Malfoy');
  });

  it('returns an empty string when there is no name', () => {
    expect(formatDoctorName('Dra.', '')).toBe('');
    expect(formatDoctorName('Dra.', undefined)).toBe('');
    expect(formatDoctorName('Dra.', 'Dra.')).toBe('');
  });
});
