import { supabase } from '../lib/supabase';
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

  async getByEntity(entityType: 'affiliate' | 'agreement', entityId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('entityType', entityType)
      .eq('entityId', entityId)
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
}

export const invoiceRepository = new InvoiceRepository();
