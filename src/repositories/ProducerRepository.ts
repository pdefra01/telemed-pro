import { supabase } from '../services/supabase';
import { Producer } from '../types';
import { authRepository } from './AuthRepository';

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
      .select('id, producer_id, dni, address');

    const referralCountMap: Record<string, number> = {};
    const detailsByProducerId: Record<string, { dni?: string; address?: string }> = {};
    (profiles || []).forEach(p => {
      if (p.producer_id) {
        referralCountMap[p.producer_id] = (referralCountMap[p.producer_id] || 0) + 1;
      }
      detailsByProducerId[p.id] = { dni: p.dni, address: p.address };
    });

    return (sups || []).map(row => ({
      id: row.id,
      name: row.name,
      producerCode: row.producer_code,
      email: row.email,
      phone: row.phone,
      dni: detailsByProducerId[row.id]?.dni,
      address: detailsByProducerId[row.id]?.address,
      // "Landing Directo (sin asesor)" and similar seed placeholders have a
      // producers row but no linked auth.users/profiles account — editing or
      // resetting a password for them has nothing real to act on.
      hasAccount: row.id in detailsByProducerId,
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
   * Actualiza los datos de un asesor/productor comercial existente.
   * Sincroniza email, teléfono y nombre entre `profiles` y `producers`
   * (comparten el mismo id) y el email de acceso real en Supabase Auth.
   */
  async updateProducer(id: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dni?: string;
    address?: string;
  }): Promise<Producer> {
    if (data.email !== undefined) {
      await authRepository.updateEmailFromAdmin(id, data.email);
    }

    const fullName = data.firstName !== undefined || data.lastName !== undefined
      ? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim()
      : undefined;

    const profileData: any = {};
    if (data.firstName !== undefined) profileData.first_name = data.firstName;
    if (data.lastName !== undefined) profileData.last_name = data.lastName;
    if (fullName !== undefined) profileData.full_name = fullName;
    if (data.email !== undefined) profileData.email = data.email;
    if (data.phone !== undefined) profileData.phone = data.phone;
    if (data.dni !== undefined) profileData.dni = data.dni;
    if (data.address !== undefined) profileData.address = data.address;

    if (Object.keys(profileData).length > 0) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', id);

      if (profileError) throw profileError;
    }

    const producerData: any = {};
    if (fullName !== undefined) producerData.name = fullName;
    if (data.email !== undefined) producerData.email = data.email;
    if (data.phone !== undefined) producerData.phone = data.phone;

    const { data: result, error } = await supabase
      .from('producers')
      .update(producerData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      id: result.id,
      name: result.name,
      producerCode: result.producer_code,
      email: result.email,
      phone: result.phone,
      dni: data.dni,
      address: data.address,
      commissionRate: Number(result.commission_rate),
      status: result.status,
      createdAt: result.created_at
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
