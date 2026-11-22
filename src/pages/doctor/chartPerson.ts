/**
 * Whose entries the doctor's patient chart shows: everyone in the family group,
 * only the titular, or one family member (by id).
 */
export type ChartPerson = 'all' | 'titular' | string;

/** Entries without a family member belong to the titular. */
export function filterByPerson<T extends { familyMemberId?: string }>(items: T[], person: ChartPerson): T[] {
  if (person === 'all') return items;
  if (person === 'titular') return items.filter((item) => !item.familyMemberId);
  return items.filter((item) => item.familyMemberId === person);
}
