import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionRepository } from '../CollectionRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

/** Chainable, awaitable stand-in for a PostgREST query builder. */
function chain(result: { data?: unknown; error?: unknown }) {
  const c: any = {};
  for (const m of ['select', 'order', 'eq', 'insert', 'single']) c[m] = vi.fn(() => c);
  c.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
  return c;
}

const affiliateRow = {
  affiliate_id: 'aff-1',
  affiliate_name: 'Laura Pérez',
  affiliate_phone: '3875111222',
  advisor_id: 'adv-1',
  advisor_name: 'Pedro Gómez',
  plan_name: 'Plan Familiar',
  payment_status: 'overdue',
  balance: '1500.00',
  paid_through: '2026-10-01T00:00:00Z',
  last_action_at: '2026-11-05T12:00:00Z',
  last_action_type: 'promise',
  promised_date: '2026-12-01',
  actions_count: 2,
  debit_rejected: true,
  debit_rejected_at: '2026-10-10T12:00:00Z',
  debit_failures: 2,
};

const actionRow = {
  id: 'act-1',
  affiliate_id: 'aff-1',
  action_type: 'promise',
  note: 'pagará en diciembre',
  promised_date: '2026-12-01',
  created_by: 'adv-1',
  created_at: '2026-11-05T12:00:00Z',
  author: { full_name: 'Pedro Gómez' },
};

describe('CollectionRepository', () => {
  let repository: CollectionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new CollectionRepository();
  });

  describe('listAffiliates', () => {
    it('calls the collections function and maps numbers and optional fields', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [affiliateRow], error: null } as any);

      const result = await repository.listAffiliates();

      expect(supabase.rpc).toHaveBeenCalledWith('advisor_collections');
      expect(result).toEqual([{
        affiliateId: 'aff-1',
        affiliateName: 'Laura Pérez',
        affiliatePhone: '3875111222',
        advisorId: 'adv-1',
        advisorName: 'Pedro Gómez',
        planName: 'Plan Familiar',
        paymentStatus: 'overdue',
        balance: 1500,
        paidThrough: '2026-10-01T00:00:00Z',
        lastActionAt: '2026-11-05T12:00:00Z',
        lastActionType: 'promise',
        promisedDate: '2026-12-01',
        actionsCount: 2,
        debitRejected: true,
        debitRejectedAt: '2026-10-10T12:00:00Z',
        debitFailures: 2,
      }]);
    });

    it('treats a missing debit status as not rejected', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [{ ...affiliateRow, debit_rejected: null, debit_rejected_at: null, debit_failures: null }],
        error: null,
      } as any);

      const [a] = await repository.listAffiliates();

      expect(a.debitRejected).toBe(false);
      expect(a.debitRejectedAt).toBeUndefined();
      expect(a.debitFailures).toBe(0);
    });

    it('keeps missing optional values as undefined', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [{
          ...affiliateRow, affiliate_phone: null, plan_name: null, paid_through: null,
          last_action_at: null, last_action_type: null, promised_date: null, actions_count: 0, balance: 0, payment_status: 'current',
        }],
        error: null,
      } as any);

      const [a] = await repository.listAffiliates();

      expect(a.affiliatePhone).toBeUndefined();
      expect(a.planName).toBeUndefined();
      expect(a.paidThrough).toBeUndefined();
      expect(a.lastActionAt).toBeUndefined();
      expect(a.lastActionType).toBeUndefined();
      expect(a.promisedDate).toBeUndefined();
      expect(a.balance).toBe(0);
    });

    it('returns an empty list when there is no data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);
      expect(await repository.listAffiliates()).toEqual([]);
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('denied') } as any);
      await expect(repository.listAffiliates()).rejects.toThrow('denied');
    });
  });

  describe('listActions', () => {
    it('reads the history of an affiliate newest first', async () => {
      const q = chain({ data: [actionRow] });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      const result = await repository.listActions('aff-1');

      expect(supabase.from).toHaveBeenCalledWith('collection_actions');
      expect(q.eq).toHaveBeenCalledWith('affiliate_id', 'aff-1');
      expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toEqual([{
        id: 'act-1',
        affiliateId: 'aff-1',
        actionType: 'promise',
        note: 'pagará en diciembre',
        promisedDate: '2026-12-01',
        createdBy: 'adv-1',
        createdByName: 'Pedro Gómez',
        createdAt: '2026-11-05T12:00:00Z',
      }]);
    });

    it('tolerates an author the reader cannot see', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ data: [{ ...actionRow, author: null, note: null, promised_date: null }] }));

      const [a] = await repository.listActions('aff-1');

      expect(a.createdByName).toBeUndefined();
      expect(a.note).toBeUndefined();
      expect(a.promisedDate).toBeUndefined();
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('denied') }));
      await expect(repository.listActions('aff-1')).rejects.toThrow('denied');
    });
  });

  describe('createAction', () => {
    it('inserts a trimmed action and returns it mapped', async () => {
      const q = chain({ data: actionRow });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      const created = await repository.createAction('aff-1', { actionType: 'call', note: '  llamé  ' });

      expect(q.insert).toHaveBeenCalledWith({
        affiliate_id: 'aff-1',
        action_type: 'call',
        note: 'llamé',
        promised_date: null,
      });
      expect(q.single).toHaveBeenCalled();
      expect(created.id).toBe('act-1');
    });

    it('stores the promised date of a promise to pay', async () => {
      const q = chain({ data: actionRow });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.createAction('aff-1', { actionType: 'promise', promisedDate: '2026-12-01' });

      expect(q.insert).toHaveBeenCalledWith({
        affiliate_id: 'aff-1',
        action_type: 'promise',
        note: null,
        promised_date: '2026-12-01',
      });
    });

    it('refuses a promise without a date without calling the database', async () => {
      await expect(repository.createAction('aff-1', { actionType: 'promise' })).rejects.toThrow(/fecha/i);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('refuses an empty note without calling the database', async () => {
      await expect(repository.createAction('aff-1', { actionType: 'note', note: '   ' })).rejects.toThrow(/nota/i);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('does not send a promised date with an action that is not a promise', async () => {
      const q = chain({ data: actionRow });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.createAction('aff-1', { actionType: 'visit', promisedDate: '2026-12-01' });

      expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ promised_date: null }));
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('rls') }));
      await expect(repository.createAction('aff-1', { actionType: 'call' })).rejects.toThrow('rls');
    });
  });
});
