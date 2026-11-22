import { describe, it, expect } from 'vitest';
import { filterByPerson } from '../chartPerson';

const items = [
  { id: 'titular-1' },
  { id: 'lucia-1', familyMemberId: 'fm-lucia' },
  { id: 'titular-2', familyMemberId: undefined },
  { id: 'tomas-1', familyMemberId: 'fm-tomas' },
];

describe('filterByPerson', () => {
  it('keeps everything for "all"', () => {
    expect(filterByPerson(items, 'all')).toEqual(items);
  });

  it('keeps only the titular entries (no family member)', () => {
    expect(filterByPerson(items, 'titular').map((x) => x.id)).toEqual(['titular-1', 'titular-2']);
  });

  it('keeps only the chosen family member entries', () => {
    expect(filterByPerson(items, 'fm-lucia').map((x) => x.id)).toEqual(['lucia-1']);
  });
});
