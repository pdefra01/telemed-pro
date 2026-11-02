import { describe, it, expect } from 'vitest';
import { attendedMemberLabel } from '../attendedMember';

describe('attendedMemberLabel', () => {
  it('returns null when the titular is the one attended', () => {
    expect(attendedMemberLabel({})).toBeNull();
    expect(attendedMemberLabel({ familyMemberName: '' })).toBeNull();
  });

  it('names the attended family member with the relation', () => {
    expect(attendedMemberLabel({ familyMemberName: 'Tomas Pérez', familyMemberRelation: 'Hijo' })).toBe(
      'Para: Tomas Pérez (Hijo)'
    );
  });

  it('omits the relation when it is unknown', () => {
    expect(attendedMemberLabel({ familyMemberName: 'Tomas Pérez' })).toBe('Para: Tomas Pérez');
  });
});
