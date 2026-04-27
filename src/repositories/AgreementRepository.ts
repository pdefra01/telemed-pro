import { supabase } from '../lib/supabase';
import { Agreement } from '../types';

export class AgreementRepository {
  async getAll(): Promise<Agreement[]> {
    const { data, error } = await supabase
      .from('agreements')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getById(id: string): Promise<Agreement | null> {
    const { data, error } = await supabase
      .from('agreements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async create(agreement: Omit<Agreement, 'id'>): Promise<Agreement> {
    const { data, error } = await supabase
      .from('agreements')
      .insert([agreement])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, agreement: Partial<Agreement>): Promise<Agreement> {
    const { data, error } = await supabase
      .from('agreements')
      .update(agreement)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('agreements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
