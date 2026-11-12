import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvisorPerformanceRepository } from '../AdvisorPerformanceRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

/** Chainable, awaitable stand-in for a PostgREST query builder. */
function chain(result: { data?: unknown; error?: unknown }) {
  const c: any = {};
  for (const m of ['upsert', 'delete', 'eq']) c[m] = vi.fn(() => c);
  c.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
  return c;
}

const row = {
  advisor_id: 'adv-1',
  advisor_name: 'Pedro Gómez',
  supervisor_id: 'sup-1',
  month: '2026-10-01',
  affiliates_sold: 4,
  revenue: '3500',
  prospects_loaded: 4,
  prospects_contacted: 3,
  prospects_affiliated: 1,
  prospects_stale: 2,
  links_shared: 7,
  goal_affiliates: 6,
  goal_revenue: '4000.00',
  affiliates_unconfirmed: 4,
};

describe('AdvisorPerformanceRepository', () => {
  let repository: AdvisorPerformanceRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new AdvisorPerformanceRepository();
  });

  describe('getMonthlyMetrics', () => {
    it('calls the metrics function for the month and maps numbers (numeric columns may arrive as strings)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [row], error: null } as any);

      const result = await repository.getMonthlyMetrics('2026-10-01');

      expect(supabase.rpc).toHaveBeenCalledWith('advisor_monthly_metrics', { p_month: '2026-10-01' });
      expect(result).toEqual([{
        advisorId: 'adv-1',
        advisorName: 'Pedro Gómez',
        supervisorId: 'sup-1',
        month: '2026-10-01',
        affiliatesSold: 4,
        revenue: 3500,
        prospectsLoaded: 4,
        prospectsContacted: 3,
        prospectsAffiliated: 1,
        prospectsStale: 2,
        linksShared: 7,
        goalAffiliates: 6,
        goalRevenue: 4000,
        affiliatesUnconfirmed: 4,
      }]);
    });

    it('keeps a missing goal as undefined instead of zero', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [{ ...row, supervisor_id: null, goal_affiliates: null, goal_revenue: null }],
        error: null,
      } as any);

      const [m] = await repository.getMonthlyMetrics('2026-10-01');

      expect(m.goalAffiliates).toBeUndefined();
      expect(m.goalRevenue).toBeUndefined();
      expect(m.supervisorId).toBeUndefined();
    });

    it('returns an empty list when there is no data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);
      expect(await repository.getMonthlyMetrics('2026-10-01')).toEqual([]);
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('denied') } as any);
      await expect(repository.getMonthlyMetrics('2026-10-01')).rejects.toThrow('denied');
    });
  });

  describe('saveGoal', () => {
    it('upserts one goal per advisor and month', async () => {
      const q = chain({});
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.saveGoal('adv-1', '2026-10-01', { targetAffiliates: 6, targetRevenue: 4000 });

      expect(supabase.from).toHaveBeenCalledWith('advisor_goals');
      expect(q.upsert).toHaveBeenCalledWith(
        { advisor_id: 'adv-1', month: '2026-10-01', target_affiliates: 6, target_revenue: 4000 },
        { onConflict: 'advisor_id,month' }
      );
    });

    it('stores an unset target as null', async () => {
      const q = chain({});
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.saveGoal('adv-1', '2026-10-01', { targetRevenue: 4000 });

      expect(q.upsert).toHaveBeenCalledWith(
        { advisor_id: 'adv-1', month: '2026-10-01', target_affiliates: null, target_revenue: 4000 },
        { onConflict: 'advisor_id,month' }
      );
    });

    it('refuses a goal with no target without calling the database', async () => {
      await expect(repository.saveGoal('adv-1', '2026-10-01', {})).rejects.toThrow(/al menos una meta/i);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('refuses a negative target without calling the database', async () => {
      await expect(repository.saveGoal('adv-1', '2026-10-01', { targetAffiliates: -1 })).rejects.toThrow(/negativ/i);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('rls') }));
      await expect(repository.saveGoal('adv-1', '2026-10-01', { targetAffiliates: 1 })).rejects.toThrow('rls');
    });
  });

  describe('deleteGoal', () => {
    it('deletes the goal of an advisor for a month', async () => {
      const q = chain({});
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.deleteGoal('adv-1', '2026-10-01');

      expect(q.delete).toHaveBeenCalled();
      expect(q.eq).toHaveBeenCalledWith('advisor_id', 'adv-1');
      expect(q.eq).toHaveBeenCalledWith('month', '2026-10-01');
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('rls') }));
      await expect(repository.deleteGoal('adv-1', '2026-10-01')).rejects.toThrow('rls');
    });
  });
});
