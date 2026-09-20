// server/pricing.js
//
// Pure, testable plan-pricing logic (feature new-plans-pricing). Every
// sign-up is priced from the fixed plan table (plans.monthly_cost); there is
// no discount formula. Handlers take `{ supabaseAdmin }` like server/advisors.js
// because server.js cannot be imported by tests (it calls app.listen at import).

const PLAN_COLUMNS =
  'id, name, monthly_cost, plan_kind, payment_option, paid_months, bonus_months, max_family_members, advisor_commission_amount';

const FAMILIAR_OPTIONS = ['card_debit', 'prepaid_6', 'prepaid_12'];

/** Individual is always 'standard'; Familiar keeps its special options. */
export function paymentOptionFor(planKind, paymentMethod) {
  if (planKind !== 'familiar') return 'standard';
  return FAMILIAR_OPTIONS.includes(paymentMethod) ? paymentMethod : 'standard';
}

async function findDefaultPlan(supabaseAdmin) {
  const { data } = await supabaseAdmin
    .from('plans')
    .select(PLAN_COLUMNS)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * Resolves the plan a new sign-up buys. `planType` is a plan kind
 * ('individual' | 'familiar', case-insensitive) or, for legacy requests, a
 * plan NAME whose plan_kind decides the kind. Falls back to the default plan.
 */
export async function resolveSellablePlan(supabaseAdmin, { planType, paymentMethod } = {}) {
  const requested = (planType || '').trim();
  const lowered = requested.toLowerCase();
  let kind = lowered === 'individual' || lowered === 'familiar' ? lowered : null;

  if (!kind && requested) {
    const { data: legacy } = await supabaseAdmin
      .from('plans')
      .select('id, plan_kind')
      .eq('name', requested)
      .limit(1)
      .maybeSingle();
    kind = legacy?.plan_kind || null;
  }

  if (kind) {
    const { data: offered } = await supabaseAdmin
      .from('plans')
      .select(PLAN_COLUMNS)
      .eq('is_offered', true)
      .eq('plan_kind', kind)
      .eq('payment_option', paymentOptionFor(kind, paymentMethod))
      .limit(1)
      .maybeSingle();
    if (offered) return offered;
  }

  const fallback = await findDefaultPlan(supabaseAdmin);
  if (fallback) {
    console.warn(`[pricing] plan_type "${planType}" no coincide con ningún plan a la venta; usando el plan por defecto "${fallback.name}".`);
    return fallback;
  }
  console.error(`[pricing] No se encontró el plan solicitado ("${planType}") ni ningún plan marcado como default.`);
  return null;
}

/** Amount charged per period: the fixed plan price, no discount. */
export function subscriptionAmount(plan) {
  return Number(Number(plan.monthly_cost).toFixed(2));
}

/** Individual plans are never subscribed through Mercado Pago. */
export function canSubscribeToMercadoPago(plan) {
  return plan?.plan_kind !== 'individual';
}

/** Sum of the fixed advisor commission over plan rows (null-safe). */
export function sumAdvisorCommissions(plans) {
  return (plans || []).reduce((sum, p) => sum + (Number(p?.advisor_commission_amount) || 0), 0);
}

/**
 * Total fixed commission for an advisor's approved sales. Each sale resolves
 * through approved_profile_id -> profiles.plan_id -> plans; sales without a
 * profile fall back to resolveSellablePlan(plan_type, payment_method).
 */
export async function computeAdvisorCommissions({ supabaseAdmin }, approvedRequests) {
  const requests = approvedRequests || [];
  if (requests.length === 0) return 0;

  const profileIds = [...new Set(requests.map((r) => r.approved_profile_id).filter(Boolean))];
  const planIdByProfile = new Map();
  if (profileIds.length > 0) {
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('id, plan_id')
      .in('id', profileIds);
    if (error) throw error;
    for (const p of profiles || []) planIdByProfile.set(p.id, p.plan_id);
  }

  const planIds = [...new Set([...planIdByProfile.values()].filter(Boolean))];
  const commissionByPlan = new Map();
  if (planIds.length > 0) {
    const { data: plans, error } = await supabaseAdmin
      .from('plans')
      .select('id, advisor_commission_amount')
      .in('id', planIds);
    if (error) throw error;
    for (const p of plans || []) commissionByPlan.set(p.id, p);
  }

  const resolved = [];
  for (const r of requests) {
    const planId = planIdByProfile.get(r.approved_profile_id);
    if (planId && commissionByPlan.has(planId)) {
      resolved.push(commissionByPlan.get(planId));
    } else {
      resolved.push(await resolveSellablePlan(supabaseAdmin, { planType: r.plan_type, paymentMethod: r.payment_method }));
    }
  }
  return sumAdvisorCommissions(resolved);
}
