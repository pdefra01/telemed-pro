import { supabase } from '../services/supabase';
import { Plan } from '../types';

export class PlanRepository {
  async getAll(): Promise<Plan[]> {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getById(id: string): Promise<Plan | null> {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async create(plan: Omit<Plan, 'id'>): Promise<Plan> {
    const { data, error } = await supabase
      .from('plans')
      .insert([plan])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, plan: Partial<Plan>): Promise<Plan> {
    const { data, error } = await supabase
      .from('plans')
      .update(plan)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}

export const planRepository = new PlanRepository();
