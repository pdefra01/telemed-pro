import { supabase } from '../services/supabase';
import { CollectionAction, CollectionActionInput, CollectionAffiliate } from '../types';

// The author embed needs the explicit constraint name; a reader who cannot see
// the author's profile simply gets null.
const ACTION_SELECT = '*, author:profiles!collection_actions_created_by_fkey(full_name)';

const toAffiliate = (row: any): CollectionAffiliate => ({
  affiliateId: row.affiliate_id,
  affiliateName: row.affiliate_name,
  affiliatePhone: row.affiliate_phone ?? undefined,
  advisorId: row.advisor_id,
  advisorName: row.advisor_name,
  planName: row.plan_name ?? undefined,
  paymentStatus: row.payment_status,
  balance: Number(row.balance),
  paidThrough: row.paid_through ?? undefined,
  lastActionAt: row.last_action_at ?? undefined,
  lastActionType: row.last_action_type ?? undefined,
  promisedDate: row.promised_date ?? undefined,
  actionsCount: Number(row.actions_count),
  debitRejected: row.debit_rejected === true,
  debitRejectedAt: row.debit_rejected_at ?? undefined,
  debitFailures: Number(row.debit_failures ?? 0),
});

const toAction = (row: any): CollectionAction => ({
  id: row.id,
  affiliateId: row.affiliate_id,
  actionType: row.action_type,
  note: row.note ?? undefined,
  promisedDate: row.promised_date ?? undefined,
  createdBy: row.created_by,
  createdByName: row.author?.full_name ?? undefined,
  createdAt: row.created_at,
});

/**
 * Collections follow-up. The database scopes everything: an advisor gets the
 * affiliates they brought and can log actions on them, a supervisor reads their
 * team's, an admin reads and logs everywhere. The history is append-only.
 */
export class CollectionRepository {
  async listAffiliates(): Promise<CollectionAffiliate[]> {
    const { data, error } = await supabase.rpc('advisor_collections');
    if (error) throw error;
    return (data || []).map(toAffiliate);
  }

  async listActions(affiliateId: string): Promise<CollectionAction[]> {
    const { data, error } = await supabase
      .from('collection_actions')
      .select(ACTION_SELECT)
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(toAction);
  }

  async createAction(affiliateId: string, input: CollectionActionInput): Promise<CollectionAction> {
    const note = input.note?.trim() || null;
    const isPromise = input.actionType === 'promise';

    if (isPromise && !input.promisedDate) {
      throw new Error('Indicá la fecha prometida de pago.');
    }
    if (input.actionType === 'note' && !note) {
      throw new Error('Escribí la nota.');
    }

    const { data, error } = await supabase
      .from('collection_actions')
      .insert({
        affiliate_id: affiliateId,
        action_type: input.actionType,
        note,
        promised_date: isPromise ? input.promisedDate : null,
      })
      .select(ACTION_SELECT)
      .single();

    if (error) throw error;
    return toAction(data);
  }
}

export const collectionRepository = new CollectionRepository();
