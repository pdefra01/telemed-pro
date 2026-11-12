import { supabase } from '../services/supabase';
import { AdvisorMonthMetrics, GoalTargets } from '../types';

const optionalNumber = (value: unknown): number | undefined =>
  value === null || value === undefined ? undefined : Number(value);

/**
 * Monthly goals and metrics. Scope is decided by the database: an advisor gets
 * their own figures, a supervisor their team's, an admin everyone's; goals are
 * written by the supervisor (their team) or the admin (all). `month` is always
 * a month start (`YYYY-MM-01`).
 */
export class AdvisorPerformanceRepository {
  async getMonthlyMetrics(month: string): Promise<AdvisorMonthMetrics[]> {
    const { data, error } = await supabase.rpc('advisor_monthly_metrics', { p_month: month });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      advisorId: row.advisor_id,
      advisorName: row.advisor_name,
      supervisorId: row.supervisor_id ?? undefined,
      month: row.month,
      affiliatesSold: Number(row.affiliates_sold),
      revenue: Number(row.revenue),
      prospectsLoaded: Number(row.prospects_loaded),
      prospectsContacted: Number(row.prospects_contacted),
      prospectsAffiliated: Number(row.prospects_affiliated),
      prospectsStale: Number(row.prospects_stale),
      linksShared: Number(row.links_shared),
      goalAffiliates: optionalNumber(row.goal_affiliates),
      goalRevenue: optionalNumber(row.goal_revenue),
    }));
  }

  /** Creates or replaces the goal of an advisor for a month; an unset target is stored as null. */
  async saveGoal(advisorId: string, month: string, targets: GoalTargets): Promise<void> {
    const affiliates = targets.targetAffiliates ?? null;
    const revenue = targets.targetRevenue ?? null;

    if (affiliates === null && revenue === null) {
      throw new Error('Definí al menos una meta (afiliados o ingresos).');
    }
    if ((affiliates !== null && affiliates < 0) || (revenue !== null && revenue < 0)) {
      throw new Error('Las metas no pueden ser negativas.');
    }

    const { error } = await supabase
      .from('advisor_goals')
      .upsert(
        { advisor_id: advisorId, month, target_affiliates: affiliates, target_revenue: revenue },
        { onConflict: 'advisor_id,month' }
      );

    if (error) throw error;
  }

  async deleteGoal(advisorId: string, month: string): Promise<void> {
    const { error } = await supabase
      .from('advisor_goals')
      .delete()
      .eq('advisor_id', advisorId)
      .eq('month', month);

    if (error) throw error;
  }
}

export const advisorPerformanceRepository = new AdvisorPerformanceRepository();
