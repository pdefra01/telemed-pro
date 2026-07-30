import { supabase } from '../services/supabase';
import { Invoice } from '../types';

/**
 * `invoices` columns are snake_case; `Invoice` is camelCase. Every prior
 * method here did `return data;`/`.insert(invoices)` directly against the raw
 * Supabase row — meaning `invoice.entityType` was always `undefined` at
 * runtime (silently defeating `reconcileInvoice`'s branching and the
 * agreement-billing dedup Set in BillingService.ts) and inserting a
 * camelCase-keyed object into a snake_case table risked outright rejection.
 * Found by judgment-day review of cuenta-corriente-billing PR3.
 */
function mapRowToInvoice(row: any): Invoice {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    period: row.period,
    netAmount: Number(row.net_amount),
    taxAmount: Number(row.tax_amount),
    totalAmount: Number(row.total_amount),
    taxDetails: row.tax_details,
    status: row.status,
    pdfUrl: row.pdf_url ?? undefined,
    createdAt: row.created_at,
    invoiceNumber: row.invoice_number,
  };
}

function mapInvoiceToRow(invoice: Partial<Invoice>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (invoice.entityType !== undefined) row.entity_type = invoice.entityType;
  if (invoice.entityId !== undefined) row.entity_id = invoice.entityId;
  if (invoice.period !== undefined) row.period = invoice.period;
  if (invoice.netAmount !== undefined) row.net_amount = invoice.netAmount;
  if (invoice.taxAmount !== undefined) row.tax_amount = invoice.taxAmount;
  if (invoice.totalAmount !== undefined) row.total_amount = invoice.totalAmount;
  if (invoice.taxDetails !== undefined) row.tax_details = invoice.taxDetails;
  if (invoice.status !== undefined) row.status = invoice.status;
  if (invoice.pdfUrl !== undefined) row.pdf_url = invoice.pdfUrl;
  return row;
}

export class InvoiceRepository {
  async getAll(): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRowToInvoice);
  }

  async getById(id: string): Promise<Invoice | null> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? mapRowToInvoice(data) : null;
  }

  async getByEntity(entityType: 'affiliate' | 'agreement', entityId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRowToInvoice);
  }

  async updateStatus(id: string, status: Invoice['status']): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRowToInvoice(data);
  }

  async create(invoice: Partial<Invoice>): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .insert([mapInvoiceToRow(invoice)])
      .select()
      .single();

    if (error) throw error;
    return mapRowToInvoice(data);
  }

  async createBulk(invoices: Partial<Invoice>[]): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .insert(invoices.map(mapInvoiceToRow))
      .select();

    if (error) throw error;
    return (data || []).map(mapRowToInvoice);
  }
}

export const invoiceRepository = new InvoiceRepository();
