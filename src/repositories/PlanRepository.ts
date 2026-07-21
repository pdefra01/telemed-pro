import { supabase } from '../services/supabase';
import { Plan } from '../types';

export class PlanRepository {
  async getAll(): Promise<Plan[]> {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('name');

    if (error) throw error;
    return (data || []).map(row => this.mapRowToPlan(row));
  }

  async getById(id: string): Promise<Plan | null> {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? this.mapRowToPlan(data) : null;
  }

  async create(plan: Omit<Plan, 'id'>): Promise<Plan> {
    const { data, error } = await supabase
      .from('plans')
      .insert([this.mapPlanToRow(plan)])
      .select()
      .single();

    if (error) throw error;
    return this.mapRowToPlan(data);
  }

  async update(id: string, plan: Partial<Plan>): Promise<Plan> {
    const { data, error } = await supabase
      .from('plans')
      .update(this.mapPlanToRow(plan))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.mapRowToPlan(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Marca `id` como el plan por defecto, desmarcando el anterior. Delegado a
   * la RPC `set_default_plan` (SECURITY DEFINER) que hace el toggle en una
   * única sentencia UPDATE atómica — evita la ventana de dos UPDATEs
   * secuenciales que podía dejar la tabla sin ningún plan por defecto si el
   * segundo paso fallaba o el id ya no existía.
   */
  async setDefault(id: string): Promise<void> {
    const { data, error } = await supabase.rpc('set_default_plan', { p_plan_id: id });

    if (error) throw error;
    if (!data) throw new Error(`No se pudo marcar el plan ${id} como predeterminado: no encontrado.`);
  }

  private mapRowToPlan(row: any): Plan {
    return {
      id: row.id,
      name: row.name,
      monthlyCost: row.monthly_cost,
      bonifiedConsultations: row.bonified_consultations,
      isUnlimited: row.is_unlimited,
      maxFamilyMembers: row.max_family_members,
      isDefault: row.is_default,
      metadata: row.metadata,
    };
  }

  private mapPlanToRow(plan: Partial<Plan>): Record<string, any> {
    const row: Record<string, any> = {};
    if (plan.name !== undefined) row.name = plan.name;
    if (plan.monthlyCost !== undefined) row.monthly_cost = plan.monthlyCost;
    if (plan.bonifiedConsultations !== undefined) row.bonified_consultations = plan.bonifiedConsultations;
    if (plan.isUnlimited !== undefined) row.is_unlimited = plan.isUnlimited;
    if (plan.maxFamilyMembers !== undefined) row.max_family_members = plan.maxFamilyMembers;
    if (plan.metadata !== undefined) row.metadata = plan.metadata;
    return row;
  }
}

export const planRepository = new PlanRepository();
