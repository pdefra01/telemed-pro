import { useEffect, useState } from 'react';
import { familyMemberRepository } from '../../repositories/FamilyMemberRepository';

export interface FamilyGroupOption {
  id: string;
  /** "Name (relation)", or just the name when the relation is missing. */
  label: string;
}

/**
 * Family members of the titular's group, for the doctor's chart pickers.
 * Without a group, or when it cannot be loaded, the list is empty and the
 * chart works for the titular only.
 */
export function useFamilyGroupMembers(patientId: string | null): FamilyGroupOption[] {
  const [members, setMembers] = useState<FamilyGroupOption[]>([]);

  useEffect(() => {
    setMembers([]);
    if (!patientId) return;
    let cancelled = false;
    (async () => {
      try {
        const groupId = await familyMemberRepository.findFamilyGroupId(patientId);
        if (!groupId) return;
        const group = await familyMemberRepository.getByFamilyGroup(groupId);
        if (!cancelled) setMembers(group.map((m) => ({ id: m.id, label: m.relation ? `${m.name} (${m.relation})` : m.name })));
      } catch (err) {
        console.warn('No se pudo cargar el grupo familiar:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  return members;
}
