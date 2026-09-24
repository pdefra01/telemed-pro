import { describe, it, expect } from 'vitest';
import { buildPrescriptionDraft, parsePrescriptionDraft } from '../prescriptionDraft';

describe('buildPrescriptionDraft', () => {
  it('drops lines with a blank medication and trims values', () => {
    const draft = buildPrescriptionDraft(
      [
        { med: ' Amoxicilina 500mg ', dose: ' 1 cada 8hs ' },
        { med: '   ', dose: 'orphan dose' },
        { med: '', dose: '' },
      ],
      '  Reposo 48hs  '
    );
    expect(draft).toEqual({
      medications: [{ med: 'Amoxicilina 500mg', dose: '1 cada 8hs' }],
      recommendations: 'Reposo 48hs',
    });
  });

  it('returns null when there is nothing to carry over', () => {
    expect(buildPrescriptionDraft([{ med: ' ', dose: 'x' }], '  ')).toBeNull();
    expect(buildPrescriptionDraft([], '')).toBeNull();
  });
});

describe('parsePrescriptionDraft', () => {
  it('reads a valid navigate state', () => {
    const state = { prescriptionDraft: { medications: [{ med: 'A', dose: 'B' }], recommendations: 'R' } };
    expect(parsePrescriptionDraft(state)).toEqual({
      medications: [{ med: 'A', dose: 'B' }],
      recommendations: 'R',
    });
  });

  it.each([undefined, null, 'x', 42, {}, { prescriptionDraft: null }, { prescriptionDraft: 'x' }])(
    'returns null for missing or malformed state %#',
    (state) => {
      expect(parsePrescriptionDraft(state)).toBeNull();
    }
  );

  it('ignores malformed entries and non-string recommendations', () => {
    const state = {
      prescriptionDraft: {
        medications: [{ med: 'A', dose: 'B' }, null, { med: 5 }, { med: '  ' }, { med: 'C' }],
        recommendations: 7,
      },
    };
    expect(parsePrescriptionDraft(state)).toEqual({
      medications: [{ med: 'A', dose: 'B' }, { med: 'C', dose: '' }],
      recommendations: '',
    });
  });

  it('returns null when the draft ends up empty', () => {
    expect(parsePrescriptionDraft({ prescriptionDraft: { medications: 'x', recommendations: '' } })).toBeNull();
  });
});

describe('buildPrescriptionDraft with malformed input', () => {
  it('never throws on non-string fields and keeps only valid items', () => {
    const bad = [
      { med: 'Ibuprofeno', dose: 400 },
      { med: null, dose: 'x' },
      null,
      { med: 123, dose: 'y' },
      { med: ' Amoxicilina ' },
    ] as unknown as { med: string; dose: string }[];

    expect(() => buildPrescriptionDraft(bad, undefined as unknown as string)).not.toThrow();
    expect(buildPrescriptionDraft(bad, undefined as unknown as string)).toEqual({
      medications: [
        { med: 'Ibuprofeno', dose: '' },
        { med: 'Amoxicilina', dose: '' },
      ],
      recommendations: '',
    });
  });

  it('returns null for non-array input without throwing', () => {
    expect(buildPrescriptionDraft(undefined as unknown as [], null as unknown as string)).toBeNull();
  });
});
