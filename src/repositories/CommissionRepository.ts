import { supabase } from '../services/supabase';
import {
  CommissionGenerationResult,
  CommissionLine,
  CommissionLiquidation,
  CommissionSummary,
} from '../types';

/** A database error as an Error carrying its own (Spanish) message. */
const toError = (error: any): Error =>
  new Error(error?.message || 'No se pudo completar la operación.');

const num = (value: unknown): number => Number(value ?? 0);

/** PostgREST returns at most 1000 rows per request: read page after page until a short one. */
const PAGE_SIZE = 1000;
async function readAll(page: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw toError(error);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

export interface CommissionListFilter {
  /** The lines of one liquidation. */
  liquidationId?: string;
  /** One advisor's commissions (always within the caller's scope). */
  advisorId?: string;
  /** Only the commissions in no liquidation (retained, excluded or not liquidated yet). */
  unattachedOnly?: boolean;
}

/**
 * Advisor commissions and their monthly liquidations (S2/S3). Reads are scoped by
 * the database (advisor: own, supervisor: team, admin: all); every write is an
 * admin-only function that checks the role itself.
 */
export class CommissionRepository {
  /** The switch in Configuración: whether advisors and supervisors may see commissions. */
  async isVisible(): Promise<boolean> {
    const { data, error } = await supabase.rpc('commissions_visible');
    if (error) throw toError(error);
    return data === true;
  }

  async getSummary(): Promise<CommissionSummary[]> {
    const data = await readAll((from, to) => supabase.rpc('advisor_commission_summary').range(from, to));
    return data.map((r: any) => ({
      advisorId: r.advisor_id,
      advisorName: r.advisor_name,
      generatedAmount: num(r.generated_amount),
      generatedCount: num(r.generated_count),
      retainedAmount: num(r.retained_amount),
      retainedCount: num(r.retained_count),
      toCollectAmount: num(r.to_collect_amount),
      toCollectCount: num(r.to_collect_count),
      collectedAmount: num(r.collected_amount),
      collectedCount: num(r.collected_count),
    }));
  }

  /** Commissions in scope, narrowed by liquidation, advisor and/or unattached only; every page is read. */
  async listCommissions(filter: CommissionListFilter = {}): Promise<CommissionLine[]> {
    const params = {
      p_liquidation_id: filter.liquidationId ?? null,
      p_advisor_id: filter.advisorId ?? null,
      p_unattached_only: filter.unattachedOnly ?? false,
    };
    const data = await readAll((from, to) => supabase.rpc('advisor_commission_list', params).range(from, to));
    return data.map((r: any) => ({
      id: r.id,
      advisorId: r.advisor_id,
      advisorName: r.advisor_name,
      affiliateName: r.affiliate_name ?? null,
      planName: r.plan_name ?? null,
      amount: num(r.amount),
      confirmedAt: r.confirmed_at,
      status: r.status,
      exclusionReason: r.exclusion_reason ?? null,
      retainedReason: r.retained_reason ?? null,
      liquidationId: r.liquidation_id ?? null,
    }));
  }

  async listLiquidations(filter: { month?: string; advisorId?: string } = {}): Promise<CommissionLiquidation[]> {
    const data = await readAll((from, to) => {
      let query = supabase
        .from('commission_liquidations')
        .select('id, advisor_id, month, status, total_amount, retained_amount, retained_count, approved_at, paid_at, payment_method, payment_reference');
      if (filter.month) query = query.eq('month', filter.month);
      if (filter.advisorId) query = query.eq('advisor_id', filter.advisorId);
      return query.order('month', { ascending: false }).order('id', { ascending: true }).range(from, to);
    });
    return data.map((r: any) => ({
      id: r.id,
      advisorId: r.advisor_id,
      month: r.month,
      status: r.status,
      totalAmount: num(r.total_amount),
      retainedAmount: num(r.retained_amount),
      retainedCount: num(r.retained_count),
      approvedAt: r.approved_at ?? null,
      paidAt: r.paid_at ?? null,
      paymentMethod: r.payment_method ?? null,
      paymentReference: r.payment_reference ?? null,
    }));
  }

  /** Admin: generates (or recalculates while draft) the liquidations of a closed month. */
  async generate(month: string): Promise<CommissionGenerationResult> {
    const { data, error } = await supabase.rpc('generate_commission_liquidations', { p_month: month });
    if (error) throw toError(error);
    const r: any = (data || [])[0] ?? {};
    return {
      advisors: num(r.advisors),
      commissionsAttached: num(r.commissions_attached),
      retainedCount: num(r.retained_count),
      totalAmount: num(r.total_amount),
    };
  }

  async exclude(commissionId: string, reason: string): Promise<void> {
    const trimmed = reason.trim();
    if (!trimmed) throw new Error('Escribí el motivo de la exclusión.');
    const { error } = await supabase.rpc('exclude_commission', { p_commission_id: commissionId, p_reason: trimmed });
    if (error) throw toError(error);
  }

  async include(commissionId: string): Promise<void> {
    const { error } = await supabase.rpc('include_commission', { p_commission_id: commissionId });
    if (error) throw toError(error);
  }

  async approve(liquidationId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_commission_liquidation', { p_liquidation_id: liquidationId });
    if (error) throw toError(error);
  }

  async pay(liquidationId: string, payment: { paidAt: string; method: string; reference?: string }): Promise<void> {
    const { error } = await supabase.rpc('pay_commission_liquidation', {
      p_liquidation_id: liquidationId,
      p_paid_at: payment.paidAt,
      p_method: payment.method,
      p_reference: payment.reference ?? '',
    });
    if (error) throw toError(error);
  }
}

export const commissionRepository = new CommissionRepository();
