import { describe, it, expect } from 'vitest';
import { validateExternalPrescriptionUrl, isSafeExternalPrescriptionUrl, MAX_EXTERNAL_URL_LENGTH } from '../externalPrescriptionUrl';

describe('validateExternalPrescriptionUrl', () => {
  it('accepts an https link (trimmed)', () => {
    expect(validateExternalPrescriptionUrl('  https://obrasocial.example/receta/abc  ')).toBeNull();
  });

  it.each([
    [''],
    ['   '],
    ['http://obrasocial.example/receta'],
    ['javascript:alert(1)'],
    ['ftp://obrasocial.example/r'],
    ['obrasocial.example/receta'],
    ['https://'],
    ['https://with space.example/x'],
  ])('rejects %j with a Spanish message', (value) => {
    expect(validateExternalPrescriptionUrl(value)).toMatch(/link|https/i);
  });

  it('rejects links longer than the maximum', () => {
    const long = `https://obrasocial.example/${'a'.repeat(MAX_EXTERNAL_URL_LENGTH)}`;
    expect(validateExternalPrescriptionUrl(long)).not.toBeNull();
  });
});

describe('isSafeExternalPrescriptionUrl', () => {
  it('accepts a valid https link', () => {
    expect(isSafeExternalPrescriptionUrl('https://obrasocial.example/receta/abc')).toBe(true);
  });

  it.each([
    ['http://obrasocial.example/receta'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    [''],
    [undefined],
    [' https://obrasocial.example/r'],
    ['https://obrasocial.example/r '],
    ['https://with space.example/x'],
  ])('rejects %j', (value) => {
    expect(isSafeExternalPrescriptionUrl(value)).toBe(false);
  });

  it('rejects links longer than the maximum', () => {
    expect(isSafeExternalPrescriptionUrl(`https://obrasocial.example/${'a'.repeat(MAX_EXTERNAL_URL_LENGTH)}`)).toBe(false);
  });
});
