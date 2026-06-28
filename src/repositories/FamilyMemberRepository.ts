import { supabase } from '../services/supabase';
import { FamilyMember } from '../types';

interface FamilyMemberRow {
  id: string;
  family_group_id: string;
  full_name: string;
  relation: string;
  birth_date: string | null;
  dni: string | null;
  created_at: string;
}

function calculateAge(birthDate: string | null): number {
  if (!birthDate) return 0;
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

function mapRowToFamilyMember(row: FamilyMemberRow): FamilyMember & { dni?: string; birthDate?: string } {
  return {
    id: row.id,
    name: row.full_name,
    relation: row.relation,
    age: calculateAge(row.birth_date),
    dni: row.dni ?? undefined,
    birthDate: row.birth_date ?? undefined,
  };
}

export class FamilyMemberRepository {
  /**
   * Retrieves all family members for a given family group.
   */
  async getByFamilyGroup(groupId: string): Promise<(FamilyMember & { dni?: string; birthDate?: string })[]> {
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_group_id', groupId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching family members:', error);
      throw error;
    }

    return (data || []).map(mapRowToFamilyMember);
  }

  /**
   * Adds a new member to a family group.
   */
  async addMember(
    groupId: string,
    data: { fullName: string; relation: string; birthDate?: string; dni?: string }
  ): Promise<FamilyMember & { dni?: string; birthDate?: string }> {
    const { data: row, error } = await supabase
      .from('family_members')
      .insert({
        family_group_id: groupId,
        full_name: data.fullName,
        relation: data.relation,
        birth_date: data.birthDate || null,
        dni: data.dni || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding family member:', error);
      throw error;
    }

    return mapRowToFamilyMember(row as FamilyMemberRow);
  }

  /**
   * Updates an existing family member's data.
   */
  async updateMember(
    memberId: string,
    data: Partial<{ fullName: string; relation: string; birthDate: string; dni: string }>
  ): Promise<FamilyMember & { dni?: string; birthDate?: string }> {
    const payload: Record<string, unknown> = {};
    if (data.fullName !== undefined) payload.full_name = data.fullName;
    if (data.relation !== undefined) payload.relation = data.relation;
    if (data.birthDate !== undefined) payload.birth_date = data.birthDate || null;
    if (data.dni !== undefined) payload.dni = data.dni || null;

    const { data: row, error } = await supabase
      .from('family_members')
      .update(payload)
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      console.error('Error updating family member:', error);
      throw error;
    }

    return mapRowToFamilyMember(row as FamilyMemberRow);
  }

  /**
   * Removes a family member.
   */
  async removeMember(memberId: string): Promise<void> {
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      console.error('Error removing family member:', error);
      throw error;
    }
  }

  /**
   * Ensures a family group exists for the given patient.
   * Creates one if it doesn't exist yet and links it to the patient's profile.
   * Returns the family_group_id.
   */
  async ensureFamilyGroup(patientId: string): Promise<string> {
    // Check if patient already has a group
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('family_group_id')
      .eq('id', patientId)
      .single();

    if (profileError) throw profileError;

    if (profile?.family_group_id) {
      return profile.family_group_id as string;
    }

    // Create a new family group
    const { data: group, error: groupError } = await supabase
      .from('family_groups')
      .insert({ primary_affiliate_id: patientId })
      .select()
      .single();

    if (groupError) throw groupError;

    // Link to patient profile
    const { error: linkError } = await supabase
      .from('profiles')
      .update({ family_group_id: group.id })
      .eq('id', patientId);

    if (linkError) throw linkError;

    return group.id as string;
  }
}

export const familyMemberRepository = new FamilyMemberRepository();
