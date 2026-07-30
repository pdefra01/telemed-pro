import { supabase } from '../services/supabase';

export type AffiliatePaymentStatus = 'current' | 'pending' | 'overdue';

export interface AccountMovement {
  id: string;
  entityType: 'affiliate';
  entityId: string;
  type: 'charge' | 'payment' | 'adjustment';
  amount: number;
  externalRef: string | null;
  invoiceId: string | null;
  source: string | null;
  createdAt: string;
  receiptNumber?: number;
}

export interface PostBillingChargeParams {
  entityId: string;
  period: string;
  amount: number;
  externalRef: string;
}

export interface PostManualAdjustmentParams {
  entityId: string;
  amount: number;
  type: 'payment' | 'adjustment' | 'charge';
  externalRef: string;
  source: string;
}

export interface PostPaymentMovementParams {
  invoiceId: string;
  entityId: string;
  amount: number;
  externalRef: string;
  source?: string;
}

/**
 * Reads and posts to the receivables ledger (`affiliate_account_movements`
 * and its derived views) introduced in `sdd/cuenta-corriente-billing` PR2.
 * DIRECT AFFILIATES ONLY (agreements are out of scope — see design's Scope
 * Boundary). All writes go through the SECURITY DEFINER RPCs
 * (`post_billing_charge`/`post_payment_movement`) — this repository never
 * writes to `affiliate_account_movements` directly, mirroring the DB-layer
 * enforcement that the table is INSERT/UPDATE/DELETE-closed to every role.
 */
export class AccountMovementRepository {
  /**
   * Computed balance for a direct affiliate — always `SUM(movements)` at
   * read time (D1), never a cached column. Returns `0` (not `null`/NaN) when
   * the affiliate has no ledger rows yet, matching the view's own COALESCE.
   */
  async getBalance(entityId: string): Promise<number> {
    const { data, error } = await supabase
      .from('affiliate_account_balances')
      .select('balance')
      .eq('entity_type', 'affiliate')
      .eq('entity_id', entityId)
      .maybeSingle();

    if (error) throw error;
    return Number(data?.balance || 0);
  }

  /**
   * Derived payment status for a direct affiliate from `affiliate_payment_status`.
   * Returns `null` (never a fabricated default) when the affiliate has no row
   * in the view — callers decide the honest fallback for that case.
   */
  async getPaymentStatus(entityId: string): Promise<AffiliatePaymentStatus | null> {
    const { data, error } = await supabase
      .from('affiliate_payment_status')
      .select('payment_status')
      .eq('entity_id', entityId)
      .maybeSingle();

    if (error) throw error;
    return data?.payment_status ?? null;
  }

  async getMovements(entityId: string): Promise<AccountMovement[]> {
    const { data, error } = await supabase
      .from('affiliate_account_movements')
      .select('*')
      .eq('entity_type', 'affiliate')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(row => this.mapMovement(row));
  }

  /**
   * Idempotent (by `externalRef`) atomic invoice-upsert + charge-movement
   * posting for a direct affiliate period, via `post_billing_charge`.
   */
  async postBillingCharge(params: PostBillingChargeParams): Promise<AccountMovement> {
    const { data, error } = await supabase.rpc('post_billing_charge', {
      p_entity_type: 'affiliate',
      p_entity_id: params.entityId,
      p_period: params.period,
      p_amount: params.amount,
      p_external_ref: params.externalRef,
    });

    if (error) throw error;
    return this.mapMovement(data);
  }

  /**
   * Idempotent manual adjustment/payment posting for a direct affiliate
   * without linking to a specific invoice.
   */
  async postManualAdjustment(params: PostManualAdjustmentParams): Promise<AccountMovement> {
    const { data, error } = await supabase.rpc('post_manual_adjustment', {
      p_entity_id: params.entityId,
      p_amount: params.amount,
      p_type: params.type,
      p_external_ref: params.externalRef,
      p_source: params.source,
    });

    if (error) throw error;
    return this.mapMovement(data);
  }

  /**
   * Idempotent (by `externalRef`) atomic payment posting for a direct
   * affiliate invoice: payment movement + invoice `paid` + plan reactivation,
   * via `post_payment_movement`.
   */
  async postPaymentMovement(params: PostPaymentMovementParams): Promise<AccountMovement> {
    const { data, error } = await supabase.rpc('post_payment_movement', {
      p_invoice_id: params.invoiceId,
      p_entity_type: 'affiliate',
      p_entity_id: params.entityId,
      p_amount: params.amount,
      p_external_ref: params.externalRef,
      p_source: params.source ?? null,
    });

    if (error) throw error;
    return this.mapMovement(data);
  }

  private mapMovement(row: any): AccountMovement {
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      type: row.type,
      amount: Number(row.amount),
      externalRef: row.external_ref,
      invoiceId: row.invoice_id,
      source: row.source,
      createdAt: row.created_at,
      receiptNumber: row.receipt_number,
    };
  }
}

export const accountMovementRepository = new AccountMovementRepository();
