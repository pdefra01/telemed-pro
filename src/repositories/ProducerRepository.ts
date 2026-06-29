import { supabase } from '../services/supabase';
import { Producer } from '../types';

export class ProducerRepository {
  /**
   * Obtiene todos los productores comerciales con el total de afiliados referidos acumulados
   */
  async getProducers(): Promise<Producer[]> {
    const { data: sups, error } = await supabase
      .from('producers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('producer_id');

    const referralCountMap: Record<string, number> = {};
    (profiles || []).forEach(p => {
      if (p.producer_id) {
        referralCountMap[p.producer_id] = (referralCountMap[p.producer_id] || 0) + 1;
      }
    });

    return (sups || []).map(row => ({
      id: row.id,
      name: row.name,
      producerCode: row.producer_code,
      email: row.email,
      phone: row.phone,
      commissionRate: Number(row.commission_rate),
      status: row.status,
      createdAt: row.created_at,
      totalAffiliatesReferred: referralCountMap[row.id] || 0
    }));
  }

  /**
   * Busca un productor por su código comercial (ej: PROD-101)
   */
  async getProducerByCode(code: string): Promise<Producer | null> {
    const cleanCode = code.trim().toUpperCase();
    const { data, error } = await supabase
      .from('producers')
      .select('*')
      .eq('producer_code', cleanCode)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      producerCode: data.producer_code,
      email: data.email,
      phone: data.phone,
      commissionRate: Number(data.commission_rate),
      status: data.status,
      createdAt: data.created_at
    };
  }

  /**
   * Crea un nuevo productor en el sistema (Admin)
   */
  async createProducer(producerData: Omit<Producer, 'id' | 'totalAffiliatesReferred'>): Promise<Producer> {
    const { data, error } = await supabase
      .from('producers')
      .insert({
        name: producerData.name.trim(),
        producer_code: producerData.producerCode.trim().toUpperCase(),
        email: producerData.email.trim(),
        phone: producerData.phone?.trim() || null,
        commission_rate: producerData.commissionRate || 10.00,
        status: producerData.status || 'active'
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      producerCode: data.producer_code,
      email: data.email,
      phone: data.phone,
      commissionRate: Number(data.commission_rate),
      status: data.status,
      createdAt: data.created_at
    };
  }
}

export const producerRepository = new ProducerRepository();
