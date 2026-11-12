// server/salesConfirmation.js
//
// A sale only counts for what pays or measures an advisor (commission, revenue,
// goals) once the affiliate has a confirmed payment: at least one `payment`
// movement with a positive amount in the receivables ledger
// (odd/tasks/commercial-crm.md, S14). Activation itself does not depend on
// payment (decided 2026-10-06); this only decides what counts as a sale.
// advisor_monthly_metrics applies the same rule in SQL.

const CHUNK_SIZE = 200;
const RPC = 'confirmed_affiliate_ids';

/**
 * Asks the database (confirmed_affiliate_ids, service role only) which of the
 * given ids have a positive ledger payment. It returns each id once, so a chunk
 * of 200 ids can never hit the API's 1000-row cap the way one row per payment did.
 *
 * @param {{ supabaseAdmin: object }} deps
 * @param {Array<string|null|undefined>} profileIds affiliate profile ids
 * @returns {Promise<Set<string>>} the ids that have a positive ledger payment
 */
export async function findConfirmedProfileIds({ supabaseAdmin }, profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  const confirmed = new Set();

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const { data, error } = await supabaseAdmin.rpc(RPC, { p_profile_ids: ids.slice(i, i + CHUNK_SIZE) });
    if (error) throw error;
    for (const row of data || []) {
      // SETOF uuid may arrive as bare values or as objects keyed by the function name
      const id = typeof row === 'string' ? row : row?.[RPC];
      if (id) confirmed.add(id);
    }
  }

  return confirmed;
}

/**
 * Pure split by an already known set of confirmed profile ids. A request with
 * no approved profile cannot have a payment, so it is unconfirmed.
 */
export function partitionConfirmed(requests, confirmedIds) {
  const confirmed = [];
  const unconfirmed = [];
  for (const r of requests || []) {
    (r.approved_profile_id && confirmedIds.has(r.approved_profile_id) ? confirmed : unconfirmed).push(r);
  }
  return { confirmed, unconfirmed };
}
