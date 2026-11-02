interface AttendedMemberFields {
  familyMemberName?: string | null;
  familyMemberRelation?: string | null;
}

/** "Para: X (Relación)" when a family member is attended, null when it is the titular. */
export function attendedMemberLabel({ familyMemberName, familyMemberRelation }: AttendedMemberFields): string | null {
  if (!familyMemberName) return null;
  return familyMemberRelation ? `Para: ${familyMemberName} (${familyMemberRelation})` : `Para: ${familyMemberName}`;
}
