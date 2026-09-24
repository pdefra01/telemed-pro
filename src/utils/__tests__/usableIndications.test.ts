import { describe, it, expect } from 'vitest';
import { hasUsableIndications } from '../usableIndications';

describe('hasUsableIndications', () => {
  it.each([
    ['Reposo 48 horas', true],
    ['  Dieta blanda  ', true],
    ['', false],
    ['   ', false],
    ['Recetado para: Faringitis', false],
    ['  Recetado para: Faringitis', false],
    ['Nota. Recetado para: algo', true],
  ])('%j -> %s', (text, expected) => {
    expect(hasUsableIndications(text)).toBe(expected);
  });
});
