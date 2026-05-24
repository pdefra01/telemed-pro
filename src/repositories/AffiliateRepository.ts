import { supabase } from '../services/supabase';
import { Patient } from '../types';

export class AffiliateRepository {
  /**
   * Obtiene todos los afiliados activos
   */
  async getAllAffiliates(): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'patient')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      console.error("Error obteniendo afiliados:", error);
      throw error;
    }

    return (data || []).map(row => this.mapProfileToPatient(row));
  }

  /**
   * Obtiene afiliados vinculados a un convenio
   */
  async getByAgreement(agreementId: string): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'patient')
      .eq('agreement_id', agreementId)
      .eq('is_active', true);

    if (error) throw error;
    return (data || []).map(row => this.mapProfileToPatient(row));
  }

  /**
   * Obtiene afiliados directos (sin convenio)
   */
  async getDirectAffiliates(): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'patient')
      .is('agreement_id', null)
      .eq('is_active', true);

    if (error) throw error;
    return (data || []).map(row => this.mapProfileToPatient(row));
  }

  /**
   * Crea un nuevo afiliado
   */
  async createAffiliate(data: Partial<Patient>): Promise<Patient> {
    const profileData = {
      id: crypto.randomUUID(),
      role: 'patient',
      full_name: data.name,
      email: data.email,
      dni: data.dni,
      plan_name: data.planName,
      plan_status: data.planStatus || 'active',
      address: data.address,
      phone: data.phone,
      is_active: true
    };

    const { data: result, error } = await supabase
      .from('profiles')
      .insert([profileData])
      .select()
      .single();

    if (error) {
      console.error("Error creando afiliado:", error);
      throw error;
    }

    return this.mapProfileToPatient(result);
  }

  /**
   * Crea múltiples afiliados en una sola operación
   */
  async createBulk(affiliates: Partial<Patient>[]): Promise<Patient[]> {
    const profilesData = affiliates.map(data => ({
      id: crypto.randomUUID(),
      role: 'patient',
      full_name: data.name,
      email: data.email,
      dni: data.dni,
      plan_name: data.planName,
      plan_status: data.planStatus || 'active',
      address: data.address,
      phone: data.phone,
      agreement_id: data.agreementId,
      is_active: true
    }));

    const { data: results, error } = await supabase
      .from('profiles')
      .insert(profilesData)
      .select();

    if (error) {
      console.error("Error en creación masiva:", error);
      throw error;
    }

    return (results || []).map(row => this.mapProfileToPatient(row));
  }

  /**
   * Actualiza los datos de un afiliado
   */
  async updateAffiliate(id: string, data: Partial<Patient>): Promise<Patient> {
    const profileData: any = {};
    if (data.name !== undefined) profileData.full_name = data.name;
    if (data.email !== undefined) profileData.email = data.email;
    if (data.dni !== undefined) profileData.dni = data.dni;
    if (data.planName !== undefined) profileData.plan_name = data.planName;
    if (data.planStatus !== undefined) profileData.plan_status = data.planStatus;
    if (data.address !== undefined) profileData.address = data.address;
    if (data.phone !== undefined) profileData.phone = data.phone;

    const { data: result, error } = await supabase
      .from('profiles')
      .update(profileData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`Error actualizando afiliado ${id}:`, error);
      throw error;
    }

    return this.mapProfileToPatient(result);
  }

  /**
   * Actualiza el estado del plan para todos los afiliados de un convenio
   */
  async updateStatusByAgreement(agreementId: string, status: Patient['planStatus']): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ plan_status: status })
      .eq('agreement_id', agreementId)
      .eq('role', 'patient');

    if (error) {
      console.error(`Error actualizando masivamente afiliados del convenio ${agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Desactiva a un afiliado (Soft Delete)
   */
  async deactivateAffiliate(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error(`Error desactivando afiliado ${id}:`, error);
      throw error;
    }
  }

  private mapProfileToPatient(row: any): Patient {
    return {
      id: row.id,
      name: row.full_name,
      email: row.email || '',
      role: 'patient',
      dni: row.dni,
      planName: row.plan_name || 'Plan Base',
      planStatus: row.plan_status || 'active',
      avatarUrl: row.avatar_url,
      address: row.address,
      phone: row.phone,
      agreementId: row.agreement_id,
      paymentStatus: row.payment_status || 'paid',
      currentPeriodQuotaUsed: row.current_period_quota_used || 0
    };
  }
}

export const affiliateRepository = new AffiliateRepository();
