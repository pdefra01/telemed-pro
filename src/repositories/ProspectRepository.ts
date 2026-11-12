import { supabase } from '../services/supabase';
import { Prospect, ProspectStatus } from '../types';
import { PROSPECT_STATUSES } from '../utils/prospectStatus';

// Two foreign keys point from prospects to profiles, so the advisor embed
// needs the explicit constraint name.
const SELECT = '*, advisor:profiles!prospects_advisor_id_fkey(full_name)';

/** Prospects per page; the API never returns more than 1000 rows per request. */
export const PROSPECT_PAGE_SIZE = 100;

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
  /** One page, newest first. A page shorter than `limit` is the last one. */
  async list(filter: { advisorId?: string; limit?: number; offset?: number } = {}): Promise<Prospect[]> {
    const limit = filter.limit ?? PROSPECT_PAGE_SIZE;
    const offset = filter.offset ?? 0;
    let query = supabase
      .from('prospects')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filter.advisorId) query = query.eq('advisor_id', filter.advisorId);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(toProspect);
  }

  /** Exact totals per status of every prospect the caller may see (RLS), without reading the rows. */
  async countByStatus(): Promise<Record<ProspectStatus, number>> {
    const counts = await Promise.all(
      PROSPECT_STATUSES.map(async (status) => {
        const { count, error } = await supabase
          .from('prospects')
          .select('id', { count: 'exact', head: true })
          .eq('status', status);
        if (error) throw error;
        return [status, count ?? 0] as const;
      })
    );
    return Object.fromEntries(counts) as Record<ProspectStatus, number>;
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
