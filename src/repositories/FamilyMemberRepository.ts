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
  private groupCache: Record<string, string> = {};

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
   * Enforces the assigned plan's maxFamilyMembers cap before a new member is
   * inserted. Self-service additions have no admin approval step, so this is
   * the only gate — without it a patient could add unlimited dependents that
   * all draw from the same shared consultation quota (family_coverage_windows
   * is scoped by family_group_id).
   */
  private async assertUnderFamilyCap(groupId: string): Promise<void> {
    const { count, error: countError } = await supabase
      .from('family_members')
      .select('*', { count: 'exact', head: true })
      .eq('family_group_id', groupId);

    if (countError) {
      console.error('Error contando familiares del grupo:', countError);
      throw countError;
    }

    const { data: group, error: groupError } = await supabase
      .from('family_groups')
      .select('primary_affiliate_id')
      .eq('id', groupId)
      .single();

    if (groupError) {
      console.error('Error obteniendo grupo familiar:', groupError);
      throw groupError;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', group.primary_affiliate_id)
      .single();

    if (profileError) {
      console.error('Error obteniendo el plan del titular:', profileError);
      throw profileError;
    }

    if (!profile.plan_id) {
      throw new Error('No tenés un plan asignado — no se pueden agregar familiares sin cobertura activa.');
    }

    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('max_family_members')
      .eq('id', profile.plan_id)
      .single();

    if (planError) {
      console.error('Error obteniendo el tope de familiares del plan:', planError);
      throw planError;
    }

    if ((count || 0) >= plan.max_family_members) {
      throw new Error(`Tu plan permite hasta ${plan.max_family_members} familiares. Contactá a administración para ampliar tu cobertura.`);
    }
  }

  /**
   * Adds a new member to a family group.
   */
  async addMember(
    groupId: string,
    data: { fullName: string; relation: string; birthDate?: string; dni?: string }
  ): Promise<FamilyMember & { dni?: string; birthDate?: string }> {
    await this.assertUnderFamilyCap(groupId);

    const cleanRelation = data.relation.trim().toLowerCase();
    const { data: row, error } = await supabase
      .from('family_members')
      .insert({
        family_group_id: groupId,
        full_name: data.fullName.trim(),
        relation: cleanRelation,
        birth_date: data.birthDate || null,
        dni: data.dni ? data.dni.trim() : null,
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
    if (data.fullName !== undefined) payload.full_name = data.fullName.trim();
    if (data.relation !== undefined) payload.relation = data.relation.trim().toLowerCase();
    if (data.birthDate !== undefined) payload.birth_date = data.birthDate || null;
    if (data.dni !== undefined) payload.dni = data.dni ? data.dni.trim() : null;

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
    if (this.groupCache[patientId]) {
      return this.groupCache[patientId];
    }

    // Check if patient already has a group
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('family_group_id')
      .eq('id', patientId)
      .single();

    if (profileError) throw profileError;

    if (profile?.family_group_id) {
      this.groupCache[patientId] = profile.family_group_id;
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

    this.groupCache[patientId] = group.id;
    return group.id as string;
  }
}

export const familyMemberRepository = new FamilyMemberRepository();
