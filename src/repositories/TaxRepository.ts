import { supabase } from '../lib/supabase';
import { TaxConfiguration } from '../types';

export class TaxRepository {
  async getAll(): Promise<TaxConfiguration[]> {
    const { data, error } = await supabase
      .from('tax_configurations')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async update(id: string, tax: Partial<TaxConfiguration>): Promise<TaxConfiguration> {
    const { data, error } = await supabase
      .from('tax_configurations')
      .update(tax)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async create(tax: Omit<TaxConfiguration, 'id'>): Promise<TaxConfiguration> {
    const { data, error } = await supabase
      .from('tax_configurations')
      .insert([tax])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export const taxRepository = new TaxRepository();
