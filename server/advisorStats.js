// server/advisorStats.js
//
// GET /api/advisor/stats: sales and commission figures of the authenticated
// advisor. Extracted from server.js (which cannot be imported by tests).
//
// Commission counts only CONFIRMED sales (the affiliate has a positive payment
// in the ledger, see salesConfirmation.js); approved sales without a confirmed
// payment are reported as `unconfirmedSales` and flagged `paymentConfirmed:
// false` in the sales list, so the advisor sees them as pending payment.

import { computeAdvisorCommissions } from './pricing.js';
import { findConfirmedProfileIds, partitionConfirmed } from './salesConfirmation.js';

const EMPTY_STATS = {
  totalSales: 0,
  approvedSales: 0,
  pendingSales: 0,
  confirmedSales: 0,
  unconfirmedSales: 0,
  commissions: 0,
  linksSharedCount: 0,
  sales: [],
};

/**
 * @param {{ supabaseAdmin: object, computeCommissions?: Function }} deps
 * @param {string} advisorId profiles.id of the authenticated advisor
 * @returns {Promise<object>} the response body; throws on a database error
 */
export async function computeAdvisorStats({ supabaseAdmin, computeCommissions = computeAdvisorCommissions }, advisorId) {
  // 1. promoter_code of the advisor
  const { data: profile, error: profError } = await supabaseAdmin
    .from('profiles')
    .select('promoter_code')
    .eq('id', advisorId)
    .single();

  if (profError || !profile || !profile.promoter_code) {
    return { ...EMPTY_STATS, sales: [] };
  }

  const promoterCode = profile.promoter_code;

  // 2. Latest 100 requests (bounded to avoid loading everything)
  const { data: sales, error: salesError } = await supabaseAdmin
    .from('adhesion_requests')
    .select('id, titular_name, titular_dni, plan_type, status, created_at, approved_profile_id')
    .eq('promoter_id', promoterCode)
    .order('created_at', { ascending: false })
    .limit(100);

  if (salesError) throw salesError;

  // 3. Exact totals, unbounded
  const countFor = async (status) => {
    let query = supabaseAdmin
      .from('adhesion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('promoter_id', promoterCode);
    if (status) query = query.eq('status', status);
    const { count } = await query;
    return count || 0;
  };
  const totalCount = await countFor(null);
  const approvedSales = await countFor('approved');
  const pendingCount = await countFor('pending');

  // 4. links_shared_count from producers
  const { data: producer } = await supabaseAdmin
    .from('producers')
    .select('links_shared_count')
    .eq('id', advisorId)
    .maybeSingle();

  // 5. Approved sales, split by confirmed payment; fixed commission per plan on the confirmed ones
  const { data: approvedRequests, error: approvedError } = await supabaseAdmin
    .from('adhesion_requests')
    .select('approved_profile_id, plan_type, payment_method')
    .eq('promoter_id', promoterCode)
    .eq('status', 'approved');
  if (approvedError) throw approvedError;

  const confirmedIds = await findConfirmedProfileIds({ supabaseAdmin }, [
    ...(approvedRequests || []).map((r) => r.approved_profile_id),
    ...(sales || []).map((s) => s.approved_profile_id),
  ]);
  const { confirmed, unconfirmed } = partitionConfirmed(approvedRequests, confirmedIds);
  const commissions = await computeCommissions({ supabaseAdmin }, confirmed);

  return {
    totalSales: totalCount,
    approvedSales,
    pendingSales: pendingCount,
    confirmedSales: confirmed.length,
    unconfirmedSales: unconfirmed.length,
    commissions,
    linksSharedCount: producer?.links_shared_count || 0,
    sales: (sales || []).map(({ approved_profile_id, ...rest }) => ({
      ...rest,
      ...(rest.status === 'approved' ? { paymentConfirmed: Boolean(approved_profile_id && confirmedIds.has(approved_profile_id)) } : {}),
    })),
  };
}
