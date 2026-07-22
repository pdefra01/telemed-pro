import { describe, it, expect } from 'vitest';
import { formatCycleResultMessage } from '../OCCBilling';

describe('formatCycleResultMessage', () => {
  it('renders the base summary without a skipped section when nothing was skipped', () => {
    const message = formatCycleResultMessage({
      processedAgreements: 3,
      processedIndividuals: 10,
      totalAmount: 150000,
      skippedNoWindow: [],
    });

    expect(message).toContain('Convenios: 3');
    expect(message).toContain('Directos: 10');
    expect(message).not.toContain('Omitidos');
  });

  it('appends the skipped-no-window affiliates by name so the admin can see who needs a plan reassignment', () => {
    const message = formatCycleResultMessage({
      processedAgreements: 3,
      processedIndividuals: 10,
      totalAmount: 150000,
      skippedNoWindow: [
        { id: 'p1', name: 'Juan Pérez' },
        { id: 'p2', name: 'Ana Gómez' },
      ],
    });

    expect(message).toContain('Omitidos');
    expect(message).toContain('Juan Pérez');
    expect(message).toContain('Ana Gómez');
  });
});
