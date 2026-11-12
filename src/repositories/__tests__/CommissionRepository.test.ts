import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommissionRepository } from '../CommissionRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

/** Chainable, awaitable stand-in for a PostgREST query builder. */
function chain(result: { data?: unknown; error?: unknown }) {
  const c: any = {};
  for (const m of ['select', 'order', 'eq', 'range']) c[m] = vi.fn(() => c);
  c.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
  return c;
}

/** An RPC call: awaitable directly (single row results) and pageable with .range() (set results). */
const rpcResult = (data: unknown, error: unknown = null): any => {
  const result = { data, error };
  const call: any = Promise.resolve(result);
  call.range = vi.fn(() => Promise.resolve(result));
  return call;
};

const commissionRow = (id: string) => ({
  id, advisor_id: 'a-1', advisor_name: 'Pedro Gómez', affiliate_profile_id: 'p-1', affiliate_name: 'Ana Paz',
  plan_id: 'pl-1', plan_name: 'Plan A', amount: 500, confirmed_at: '2026-08-10T12:00:00Z', status: 'generated',
  exclusion_reason: null, retained_reason: null, liquidation_id: null, liquidation_month: null, liquidation_status: null,
});

describe('CommissionRepository', () => {
  let repository: CommissionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new CommissionRepository();
  });

  it('maps the per-advisor summary to numbers', async () => {
    vi.mocked(supabase.rpc).mockReturnValueOnce(rpcResult([{
      advisor_id: 'a-1', advisor_name: 'Pedro Gómez',
      generated_amount: '1500.00', generated_count: 2,
      retained_amount: 800, retained_count: 1,
      to_collect_amount: 500, to_collect_count: 1,
      collected_amount: 0, collected_count: 0,
    }]));

    const result = await repository.getSummary();

    expect(supabase.rpc).toHaveBeenCalledWith('advisor_commission_summary');
    expect(result).toEqual([{
      advisorId: 'a-1', advisorName: 'Pedro Gómez',
      generatedAmount: 1500, generatedCount: 2,
      retainedAmount: 800, retainedCount: 1,
      toCollectAmount: 500, toCollectCount: 1,
      collectedAmount: 0, collectedCount: 0,
    }]);
  });

  it('lists the lines of one liquidation, or every visible line', async () => {
    const row = {
      id: 'c-1', advisor_id: 'a-1', advisor_name: 'Pedro Gómez', affiliate_profile_id: 'p-1', affiliate_name: 'Ana Paz',
      plan_id: 'pl-1', plan_name: 'Plan A', amount: '500.00', confirmed_at: '2026-08-10T12:00:00Z', status: 'excluded',
      exclusion_reason: 'Duplicada', retained_reason: null, liquidation_id: 'l-1', liquidation_month: '2026-08-01', liquidation_status: 'draft',
    };
    vi.mocked(supabase.rpc).mockReturnValueOnce(rpcResult([row])).mockReturnValueOnce(rpcResult([]));

    const lines = await repository.listCommissions({ liquidationId: 'l-1' });
    await repository.listCommissions({ advisorId: 'a-1', unattachedOnly: true });

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'advisor_commission_list', { p_liquidation_id: 'l-1', p_advisor_id: null, p_unattached_only: false });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'advisor_commission_list', { p_liquidation_id: null, p_advisor_id: 'a-1', p_unattached_only: true });
    expect(lines).toEqual([{
      id: 'c-1', advisorId: 'a-1', advisorName: 'Pedro Gómez', affiliateName: 'Ana Paz', planName: 'Plan A',
      amount: 500, confirmedAt: '2026-08-10T12:00:00Z', status: 'excluded', exclusionReason: 'Duplicada',
      retainedReason: null, liquidationId: 'l-1',
    }]);
  });

  it('reads every page of commissions, past the 1000-row cap', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => commissionRow(`c-${i}`));
    const first = rpcResult(full);
    const second = rpcResult([commissionRow('c-last')]);
    vi.mocked(supabase.rpc).mockReturnValueOnce(first).mockReturnValueOnce(second);

    const lines = await repository.listCommissions({ advisorId: 'a-1', unattachedOnly: true });

    expect(lines).toHaveLength(1001);
    expect(first.range).toHaveBeenCalledWith(0, 999);
    expect(second.range).toHaveBeenCalledWith(1000, 1999);
  });

  it('reads every page of the liquidations and of the summary', async () => {
    const liq = (id: string) => ({ id, advisor_id: 'a-1', month: '2026-08-01', status: 'draft', total_amount: 0, retained_amount: 0, retained_count: 0 });
    const q1 = chain({ data: Array.from({ length: 1000 }, (_, i) => liq(`l-${i}`)) });
    const q2 = chain({ data: [liq('l-last')] });
    vi.mocked(supabase.from).mockReturnValueOnce(q1).mockReturnValueOnce(q2);
    const s1 = rpcResult(Array.from({ length: 1000 }, (_, i) => ({ advisor_id: `a-${i}`, advisor_name: 'X' })));
    const s2 = rpcResult([{ advisor_id: 'a-last', advisor_name: 'Y' }]);
    vi.mocked(supabase.rpc).mockReturnValueOnce(s1).mockReturnValueOnce(s2);

    expect(await repository.listLiquidations({ month: '2026-08-01' })).toHaveLength(1001);
    expect(q2.range).toHaveBeenCalledWith(1000, 1999);
    expect(await repository.getSummary()).toHaveLength(1001);
    expect(s2.range).toHaveBeenCalledWith(1000, 1999);
  });

  it('lists the liquidations of a month and of an advisor, newest first', async () => {
    const q = chain({ data: [{
      id: 'l-1', advisor_id: 'a-1', month: '2026-08-01', status: 'paid', total_amount: '1300.00',
      retained_amount: 800, retained_count: 1, approved_at: '2026-09-02T10:00:00Z',
      paid_at: '2026-09-05', payment_method: 'Transferencia', payment_reference: 'OP-1',
    }] });
    vi.mocked(supabase.from).mockReturnValueOnce(q);

    const result = await repository.listLiquidations({ month: '2026-08-01', advisorId: 'a-1' });

    expect(supabase.from).toHaveBeenCalledWith('commission_liquidations');
    expect(q.eq).toHaveBeenCalledWith('month', '2026-08-01');
    expect(q.eq).toHaveBeenCalledWith('advisor_id', 'a-1');
    expect(q.order).toHaveBeenCalledWith('month', { ascending: false });
    expect(result).toEqual([{
      id: 'l-1', advisorId: 'a-1', month: '2026-08-01', status: 'paid', totalAmount: 1300,
      retainedAmount: 800, retainedCount: 1, approvedAt: '2026-09-02T10:00:00Z',
      paidAt: '2026-09-05', paymentMethod: 'Transferencia', paymentReference: 'OP-1',
    }]);
  });

  it('does not filter the liquidations when no month or advisor is given (RLS scopes them)', async () => {
    const q = chain({ data: [] });
    vi.mocked(supabase.from).mockReturnValueOnce(q);

    await repository.listLiquidations();

    expect(q.eq).not.toHaveBeenCalled();
  });

  it('generates a month and returns its summary', async () => {
    vi.mocked(supabase.rpc).mockReturnValueOnce(rpcResult([{ advisors: 2, commissions_attached: 5, retained_count: 1, total_amount: '2500.00' }]));

    const result = await repository.generate('2026-08-01');

    expect(supabase.rpc).toHaveBeenCalledWith('generate_commission_liquidations', { p_month: '2026-08-01' });
    expect(result).toEqual({ advisors: 2, commissionsAttached: 5, retainedCount: 1, totalAmount: 2500 });
  });

  it('calls each admin action with its parameters', async () => {
    vi.mocked(supabase.rpc).mockImplementation(() => rpcResult(null));

    await repository.exclude('c-1', '  Venta duplicada ');
    await repository.include('c-1');
    await repository.approve('l-1');
    await repository.pay('l-1', { paidAt: '2026-09-05', method: 'Transferencia', reference: 'OP-1' });

    expect(supabase.rpc).toHaveBeenCalledWith('exclude_commission', { p_commission_id: 'c-1', p_reason: 'Venta duplicada' });
    expect(supabase.rpc).toHaveBeenCalledWith('include_commission', { p_commission_id: 'c-1' });
    expect(supabase.rpc).toHaveBeenCalledWith('approve_commission_liquidation', { p_liquidation_id: 'l-1' });
    expect(supabase.rpc).toHaveBeenCalledWith('pay_commission_liquidation', {
      p_liquidation_id: 'l-1', p_paid_at: '2026-09-05', p_method: 'Transferencia', p_reference: 'OP-1',
    });
  });

  it('requires a reason before excluding, without calling the database', async () => {
    await expect(repository.exclude('c-1', '   ')).rejects.toThrow('Escribí el motivo de la exclusión.');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('throws the database message as an Error (Spanish, as-is)', async () => {
    vi.mocked(supabase.rpc).mockReturnValueOnce(rpcResult(null, {
      code: 'P0001', message: 'Solo se liquidan meses cerrados: 11/2026 todavía no cerró',
    }));

    const failure = repository.generate('2026-11-01');

    await expect(failure).rejects.toBeInstanceOf(Error);
    await expect(failure).rejects.toThrow('Solo se liquidan meses cerrados: 11/2026 todavía no cerró');
  });

  it('falls back to a generic message when the error has none', async () => {
    vi.mocked(supabase.rpc).mockReturnValueOnce(rpcResult(null, { code: '42501' }));

    await expect(repository.approve('l-1')).rejects.toThrow('No se pudo completar la operación.');
  });
});
