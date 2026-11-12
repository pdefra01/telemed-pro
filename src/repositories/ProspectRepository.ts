import { supabase } from '../services/supabase';
import { Prospect, ProspectStatus } from '../types';

// Two foreign keys point from prospects to profiles, so the advisor embed
// needs the explicit constraint name.
const SELECT = '*, advisor:profiles!prospects_advisor_id_fkey(full_name)';

export interface ProspectInput {
  fullName: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface ProspectPatch extends Partial<ProspectInput> {
  status?: ProspectStatus;
  lastContactAt?: string;
}

const clean = (value?: string): string | null => value?.trim() || null;

const toProspect = (row: any): Prospect => ({
  id: row.id,
  advisorId: row.advisor_id,
  advisorName: row.advisor?.full_name ?? undefined,
  fullName: row.full_name,
  phone: row.phone ?? undefined,
  email: row.email ?? undefined,
  notes: row.notes ?? undefined,
  status: row.status,
  source: row.source,
  lastContactAt: row.last_contact_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * CRM prospects. Row-level security scopes what each role gets back: an
 * advisor reads their own, a supervisor their team's, an admin everything.
 */
export class ProspectRepository {
  async list(filter?: { advisorId?: string }): Promise<Prospect[]> {
    let query = supabase
      .from('prospects')
      .select(SELECT)
      .order('created_at', { ascending: false });

    if (filter?.advisorId) query = query.eq('advisor_id', filter.advisorId);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(toProspect);
  }

  async create(advisorId: string, input: ProspectInput): Promise<Prospect> {
    const { data, error } = await supabase
      .from('prospects')
      .insert({
        advisor_id: advisorId,
        full_name: input.fullName.trim(),
        phone: clean(input.phone),
        email: clean(input.email),
        notes: clean(input.notes),
      })
      .select(SELECT)
      .single();

    if (error) throw error;
    return toProspect(data);
  }

  /** Writes only the fields that are provided; an empty optional field clears it. */
  async update(id: string, patch: ProspectPatch): Promise<Prospect> {
    const payload: Record<string, unknown> = {};
    if (patch.fullName !== undefined) payload.full_name = patch.fullName.trim();
    if (patch.phone !== undefined) payload.phone = clean(patch.phone);
    if (patch.email !== undefined) payload.email = clean(patch.email);
    if (patch.notes !== undefined) payload.notes = clean(patch.notes);
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.lastContactAt !== undefined) payload.last_contact_at = patch.lastContactAt;

    const { data, error } = await supabase
      .from('prospects')
      .update(payload)
      .eq('id', id)
      .select(SELECT)
      .single();

    if (error) throw error;
    return toProspect(data);
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('prospects').delete().eq('id', id);
    if (error) throw error;
  }
}

export const prospectRepository = new ProspectRepository();
