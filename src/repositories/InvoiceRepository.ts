import { supabase } from '../services/supabase';
import { Invoice } from '../types';

export class InvoiceRepository {
  async getAll(): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getById(id: string): Promise<Invoice | null> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getByEntity(entityType: 'affiliate' | 'agreement', entityId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async updateStatus(id: string, status: Invoice['status']): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async create(invoice: Partial<Invoice>): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .insert([invoice])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async createBulk(invoices: Partial<Invoice>[]): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .insert(invoices)
      .select();

    if (error) throw error;
    return data || [];
  }
}

export const invoiceRepository = new InvoiceRepository();
