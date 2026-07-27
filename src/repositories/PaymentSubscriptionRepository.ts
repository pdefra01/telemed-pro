import { supabase } from '../services/supabase';
import { PaymentSubscription, PaymentSubscriptionStatus } from '../types';

const LIVE_STATUSES = new Set<PaymentSubscriptionStatus>(['authorized', 'payment_failed']);

/**
 * Precedence rule (design D-E): a profile can have more than one
 * `affiliate_payment_subscriptions` row — Decision #7 forbids in-place
 * reactivation, so every re-enrollment creates a NEW row instead of
 * resurrecting a `cancelled` one. Exactly ONE row governs pricing/lifecycle
 * display for a profile. Live outranks dead; among ties, newest `createdAt`
 * wins; the `id` tie-break is the final, deterministic key — `id` is a
 * random UUID, so which row wins is arbitrary, but it is STABLE across every
 * call, every instance, every billing run, which is the actual requirement.
 */
export function pickGoverningRow(rows: PaymentSubscription[]): PaymentSubscription {
  return rows.reduce((best, row) => {
    const rowLive = LIVE_STATUSES.has(row.status);
    const bestLive = LIVE_STATUSES.has(best.status);
    if (rowLive !== bestLive) return rowLive ? row : best; // live always outranks dead
    if (row.createdAt !== best.createdAt) return row.createdAt > best.createdAt ? row : best; // newest wins
    return row.id > best.id ? row : best; // deterministic tie-break
  });
}

function mapRow(row: any): PaymentSubscription {
  return {
    id: row.id,
    profileId: row.profile_id,
    adhesionRequestId: row.adhesion_request_id,
    mpPreapprovalId: row.mp_preapproval_id,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    discountedMonthlyCost: row.discounted_monthly_cost !== null && row.discounted_monthly_cost !== undefined
      ? Number(row.discounted_monthly_cost)
      : null,
    discountThroughPeriod: row.discount_through_period,
    lastFailureAt: row.last_failure_at,
    failureCount: row.failure_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profileName: row.profiles
      ? (`${row.profiles.first_name || ''} ${row.profiles.last_name || ''}`.trim() || undefined)
      : undefined,
    profileEmail: row.profiles?.email ?? undefined,
  };
}

/**
 * Read-only repository over `affiliate_payment_subscriptions` (design D-A):
 * every write goes through a service-role SECURITY DEFINER RPC, so no write
 * method exists here by design — a browser wrapper for a service-role-only
 * RPC would be dead code.
 */
export class PaymentSubscriptionRepository {
  /**
   * Batch read, bucketed by profile and reduced through `pickGoverningRow`.
   * ONE plain `.select('*').in('profile_id', ids)` — the precedence rule
   * above is not expressible via PostgREST's `.order()` API (D-E).
   */
  async getByProfileIds(profileIds: string[]): Promise<Map<string, PaymentSubscription>> {
    if (profileIds.length === 0) return new Map();

    const { data, error } = await supabase
      .from('affiliate_payment_subscriptions')
      .select('*')
      .in('profile_id', profileIds);

    if (error) throw error;

    const byProfile = new Map<string, PaymentSubscription[]>();
    for (const row of (data || []).map(mapRow)) {
      if (!row.profileId) continue;
      const bucket = byProfile.get(row.profileId) || [];
      bucket.push(row);
      byProfile.set(row.profileId, bucket);
    }

    const result = new Map<string, PaymentSubscription>();
    for (const [profileId, rows] of byProfile) {
      result.set(profileId, pickGoverningRow(rows));
    }
    return result;
  }

  async getByProfileId(profileId: string): Promise<PaymentSubscription | null> {
    const map = await this.getByProfileIds([profileId]);
    return map.get(profileId) ?? null;
  }

  /**
   * Affiliates currently `payment_failed` — the admin-visible signal the
   * spec requires INSTEAD OF any automatic delinquency/payment-method switch
   * ("Admin-Visible Alert On Exhausted Retries").
   */
  async getFailedDebits(): Promise<PaymentSubscription[]> {
    const { data, error } = await supabase
      .from('affiliate_payment_subscriptions')
      .select('*, profiles(first_name, last_name, email)')
      .eq('status', 'payment_failed')
      .order('last_failure_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRow);
  }

  /**
   * Count of `mercadopago_events` rows the D-H reconciliation sweep (PR 4)
   * has not yet resolved — feeds OCCBilling.tsx's unreconciled-payments
   * badge (PR 4).
   */
  async getUnreconciledCount(): Promise<number> {
    const { count, error } = await supabase
      .from('mercadopago_events')
      .select('*', { count: 'exact', head: true })
      .in('resolution_state', ['pending', 'needs_admin']);

    if (error) throw error;
    return count || 0;
  }
}

export const paymentSubscriptionRepository = new PaymentSubscriptionRepository();
