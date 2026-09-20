import { describe, it, expect, vi } from 'vitest';
import {
  paymentOptionFor,
  resolveSellablePlan,
  subscriptionAmount,
  canSubscribeToMercadoPago,
  sumAdvisorCommissions,
  computeAdvisorCommissions,
} from '../pricing.js';

/**
 * Minimal chainable Supabase stub. `tables[name]` is a function receiving the
 * recorded filters ({ eq: {col: val}, in: {col: [..]} }) and returning rows.
 */
function createStub(tables) {
  const calls = [];
  function from(table) {
    const filters = { eq: {}, in: {} };
    const rowsFor = () => {
      calls.push({ table, filters });
      return tables[table]?.(filters) ?? [];
    };
    const builder = {
      select: () => builder,
      eq: (c, v) => { filters.eq[c] = v; return builder; },
      in: (c, v) => { filters.in[c] = v; return builder; },
      limit: () => builder,
      maybeSingle: async () => ({ data: rowsFor()[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rowsFor(), error: null }).then(resolve, reject),
    };
    return builder;
  }
  return { from, calls };
}

const PLANS = [
  { id: 'p-ind', name: 'Individual', plan_kind: 'individual', payment_option: 'standard', is_offered: true, is_default: true, monthly_cost: 14999, advisor_commission_amount: 7500 },
  { id: 'p-fam', name: 'Familiar', plan_kind: 'familiar', payment_option: 'standard', is_offered: true, monthly_cost: 49999, advisor_commission_amount: 25000 },
  { id: 'p-card', name: 'Familiar Tarjeta', plan_kind: 'familiar', payment_option: 'card_debit', is_offered: true, monthly_cost: 39999, advisor_commission_amount: 25000 },
  { id: 'p-s6', name: 'Familiar Semestral', plan_kind: 'familiar', payment_option: 'prepaid_6', is_offered: true, monthly_cost: 39999, advisor_commission_amount: 30000 },
  { id: 'p-old', name: 'Plan Viejo', plan_kind: null, payment_option: null, is_offered: false, monthly_cost: 1, advisor_commission_amount: 0 },
];

function plansTable(f) {
  return PLANS.filter((p) =>
    Object.entries(f.eq).every(([c, v]) => p[c] === v) &&
    Object.entries(f.in).every(([c, v]) => v.includes(p[c]))
  );
}

describe('paymentOptionFor', () => {
  it('always returns standard for individual', () => {
    expect(paymentOptionFor('individual', 'card_debit')).toBe('standard');
    expect(paymentOptionFor('individual', 'prepaid_12')).toBe('standard');
  });
  it('maps familiar special options to themselves', () => {
    expect(paymentOptionFor('familiar', 'card_debit')).toBe('card_debit');
    expect(paymentOptionFor('familiar', 'prepaid_6')).toBe('prepaid_6');
    expect(paymentOptionFor('familiar', 'prepaid_12')).toBe('prepaid_12');
  });
  it('maps every other familiar method to standard', () => {
    for (const m of ['monthly', 'debit', 'cash', 'transfer', undefined, null, '']) {
      expect(paymentOptionFor('familiar', m)).toBe('standard');
    }
  });
});

describe('resolveSellablePlan', () => {
  it('selects the offered plan by kind (trimmed, case-insensitive) and option', async () => {
    const stub = createStub({ plans: plansTable });
    const plan = await resolveSellablePlan(stub, { planType: '  FAMILIAR ', paymentMethod: 'prepaid_6' });
    expect(plan.id).toBe('p-s6');
  });
  it('uses standard for individual regardless of the payment method', async () => {
    const stub = createStub({ plans: plansTable });
    const plan = await resolveSellablePlan(stub, { planType: 'individual', paymentMethod: 'card_debit' });
    expect(plan.id).toBe('p-ind');
  });
  it('treats an unknown planType as a legacy name and uses that plan kind', async () => {
    const stub = createStub({
      plans: (f) => (f.eq.name === 'Mi Plan Legado'
        ? [{ id: 'legacy', name: 'Mi Plan Legado', plan_kind: 'familiar' }]
        : plansTable(f)),
    });
    const plan = await resolveSellablePlan(stub, { planType: 'Mi Plan Legado', paymentMethod: 'card_debit' });
    expect(plan.id).toBe('p-card');
  });
  it('falls back to the default plan and warns when the name is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = createStub({ plans: plansTable });
    const plan = await resolveSellablePlan(stub, { planType: 'nope', paymentMethod: 'monthly' });
    expect(plan.id).toBe('p-ind');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('falls back to the default plan when a legacy plan has no kind', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = createStub({ plans: plansTable });
    const plan = await resolveSellablePlan(stub, { planType: 'Plan Viejo', paymentMethod: 'monthly' });
    expect(plan.id).toBe('p-ind');
    warn.mockRestore();
  });
  it('returns null (and logs an error) when nothing resolves', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stub = createStub({ plans: () => [] });
    expect(await resolveSellablePlan(stub, { planType: 'familiar', paymentMethod: 'monthly' })).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('subscriptionAmount / canSubscribeToMercadoPago', () => {
  it('returns the plan price rounded to 2 decimals, with no discount', () => {
    expect(subscriptionAmount({ monthly_cost: '49999' })).toBe(49999);
    expect(subscriptionAmount({ monthly_cost: 39999.456 })).toBe(39999.46);
  });
  it('refuses MP subscription for individual only', () => {
    expect(canSubscribeToMercadoPago({ plan_kind: 'individual' })).toBe(false);
    expect(canSubscribeToMercadoPago({ plan_kind: 'familiar' })).toBe(true);
  });
});

describe('sumAdvisorCommissions', () => {
  it('sums fixed amounts null-safely', () => {
    expect(sumAdvisorCommissions([{ advisor_commission_amount: 7500 }, { advisor_commission_amount: '25000' }, {}, null])).toBe(32500);
    expect(sumAdvisorCommissions([])).toBe(0);
    expect(sumAdvisorCommissions(undefined)).toBe(0);
  });
});

describe('computeAdvisorCommissions', () => {
  it('sums the plan of each approved profile and falls back by plan_type/payment_method', async () => {
    const stub = createStub({
      profiles: () => [{ id: 'u1', plan_id: 'p-ind' }, { id: 'u2', plan_id: 'p-s6' }],
      plans: plansTable,
    });
    const total = await computeAdvisorCommissions({ supabaseAdmin: stub }, [
      { approved_profile_id: 'u1', plan_type: 'x', payment_method: 'x' },
      { approved_profile_id: 'u2', plan_type: 'x', payment_method: 'x' },
      { approved_profile_id: null, plan_type: 'familiar', payment_method: 'card_debit' },
    ]);
    expect(total).toBe(7500 + 30000 + 25000);
  });
  it('returns 0 for no approved sales without querying', async () => {
    const stub = createStub({});
    expect(await computeAdvisorCommissions({ supabaseAdmin: stub }, [])).toBe(0);
    expect(stub.calls).toHaveLength(0);
  });
});
