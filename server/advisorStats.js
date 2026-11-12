// server/advisorStats.js
//
// GET /api/advisor/stats: sales figures of the authenticated advisor.
// Extracted from server.js (which cannot be imported by tests).
//
// A sale is CONFIRMED once the affiliate has a positive payment in the ledger
// (see salesConfirmation.js); approved sales without one are reported as
// `unconfirmedSales` and flagged `paymentConfirmed: false` in the sales list,
// so the advisor sees them as pending payment. Commissions come from the
// liquidations (advisor_commission_summary), not from here.

import { findConfirmedProfileIds, partitionConfirmed } from './salesConfirmation.js';

const APPROVED_PAGE_SIZE = 1000;

const EMPTY_STATS = {
  totalSales: 0,
  approvedSales: 0,
  pendingSales: 0,
  confirmedSales: 0,
  unconfirmedSales: 0,
  linksSharedCount: 0,
  sales: [],
};

/**
 * @param {{ supabaseAdmin: object }} deps
 * @param {string} advisorId profiles.id of the authenticated advisor
 * @returns {Promise<object>} the response body; throws on a database error
 */
export async function computeAdvisorStats({ supabaseAdmin }, advisorId) {
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

  // 5. Approved sales, split by confirmed payment.
  //    Read in pages: the API returns at most 1000 rows per request.
  const approvedRequests = [];
  for (let from = 0; ; from += APPROVED_PAGE_SIZE) {
    const { data: page, error: approvedError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('approved_profile_id')
      .eq('promoter_id', promoterCode)
      .eq('status', 'approved')
      .order('id', { ascending: true })
      .range(from, from + APPROVED_PAGE_SIZE - 1);
    if (approvedError) throw approvedError;
    approvedRequests.push(...(page || []));
    if (!page || page.length < APPROVED_PAGE_SIZE) break;
  }

  const confirmedIds = await findConfirmedProfileIds({ supabaseAdmin }, [
    ...(approvedRequests || []).map((r) => r.approved_profile_id),
    ...(sales || []).map((s) => s.approved_profile_id),
  ]);
  const { confirmed, unconfirmed } = partitionConfirmed(approvedRequests, confirmedIds);

  return {
    totalSales: totalCount,
    approvedSales,
    pendingSales: pendingCount,
    confirmedSales: confirmed.length,
    unconfirmedSales: unconfirmed.length,
    linksSharedCount: producer?.links_shared_count || 0,
    sales: (sales || []).map(({ approved_profile_id, ...rest }) => ({
      ...rest,
      ...(rest.status === 'approved' ? { paymentConfirmed: Boolean(approved_profile_id && confirmedIds.has(approved_profile_id)) } : {}),
    })),
  };
}
