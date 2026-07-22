import { describe, it, expect, vi, beforeEach } from 'vitest';
import { familyMemberRepository } from '../FamilyMemberRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('FamilyMemberRepository.addMember — maxFamilyMembers cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Wires .from() so each table name resolves to its own canned response. */
  function mockTables(responses: {
    family_members?: { count: number | null; error?: any };
    family_groups?: { data: any; error?: any };
    profiles?: { data: any; error?: any };
    plans?: { data: any; error?: any };
    insert?: { data: any; error?: any };
  }) {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'family_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(responses.family_members ?? { count: 0, error: null }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                responses.insert ?? { data: { id: 'new-member', family_group_id: 'group-1', full_name: 'Nuevo', relation: 'hijo/a', birth_date: null, dni: null }, error: null }
              ),
            }),
          }),
        } as any;
      }
      if (table === 'family_groups') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(responses.family_groups ?? { data: { primary_affiliate_id: 'titular-1' }, error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(responses.profiles ?? { data: { plan_id: 'plan-1' }, error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'plans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(responses.plans ?? { data: { max_family_members: 4 }, error: null }),
            }),
          }),
        } as any;
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });
  }

  it('allows adding a member when the group is under the plan cap', async () => {
    mockTables({ family_members: { count: 2, error: null } }); // 2 existing, cap is 4

    const result = await familyMemberRepository.addMember('group-1', { fullName: 'Nuevo', relation: 'hijo/a' });

    expect(result.id).toBe('new-member');
  });

  it('blocks adding a member once the group already has maxFamilyMembers', async () => {
    mockTables({ family_members: { count: 4, error: null }, plans: { data: { max_family_members: 4 }, error: null } });

    await expect(
      familyMemberRepository.addMember('group-1', { fullName: 'Sobrante', relation: 'hijo/a' })
    ).rejects.toThrow(/hasta 4 familiares/);
  });

  it('blocks adding a member when the titular has no plan assigned (no coverage to extend)', async () => {
    mockTables({ profiles: { data: { plan_id: null }, error: null } });

    await expect(
      familyMemberRepository.addMember('group-1', { fullName: 'Sin Plan', relation: 'hijo/a' })
    ).rejects.toThrow(/No tenés un plan asignado/);
  });
});
