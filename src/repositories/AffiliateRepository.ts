import { supabase } from '../services/supabase';
import { Patient } from '../types';
import { generateUUID } from '../utils/uuid';

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
    const response = await fetch('/api/create-patient', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_name: data.name,
        dni: data.dni,
        email: data.email,
        phone: data.phone,
        address: data.address,
        password: data.dni, // Se usa el DNI como password temporal por defecto
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al registrar afiliado en el servidor.');
    }

    const result = await response.json();
    
    // Obtener los datos del perfil que el trigger handle_new_user acaba de crear
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', result.id)
      .single();

    if (error) {
      console.warn("Trigger tardó en sincronizar, retornando datos simulados...", error);
      return {
        id: result.id,
        name: data.name || '',
        email: result.email,
        role: 'patient',
        dni: data.dni,
        planName: data.planName || 'Plan Base',
        planStatus: data.planStatus || 'active',
        address: data.address,
        phone: data.phone,
        paymentStatus: 'paid',
        currentPeriodQuotaUsed: 0
      };
    }

    return this.mapProfileToPatient(profile);
  }

  /**
   * Crea múltiples afiliados en una sola operación
   */
  async createBulk(affiliates: Partial<Patient>[]): Promise<Patient[]> {
    const patientsPayload = affiliates.map(data => ({
      name: data.name,
      email: data.email,
      dni: data.dni,
      phone: data.phone,
      address: data.address,
      password: data.dni, // Password por defecto es su DNI
    }));

    const response = await fetch('/api/create-patient-bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patientsPayload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al procesar la importación masiva.');
    }

    const results = await response.json();
    
    // Si fallaron todos los registros del batch
    if (results.summary.success === 0 && results.summary.failed > 0) {
      const firstError = results.failures[0]?.error || 'Error de autenticación.';
      throw new Error(`Error en la importación masiva: ${firstError}`);
    }

    const successfulIds = results.successful.map((s: any) => s.id);
    if (successfulIds.length === 0) return [];

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .in('id', successfulIds);

    if (error) {
      console.warn("Error al recuperar perfiles del bulk import, retornando simulados...", error);
      return results.successful.map((s: any) => {
        const source = affiliates.find(a => a.dni === s.dni) || {};
        return {
          id: s.id,
          name: source.name || '',
          email: source.email || '',
          role: 'patient',
          dni: s.dni,
          planName: source.planName || 'Plan Base',
          planStatus: source.planStatus || 'active',
          address: source.address,
          phone: source.phone,
          paymentStatus: 'paid',
          currentPeriodQuotaUsed: 0
        };
      });
    }

    if (results.summary.failed > 0) {
      console.warn(`${results.summary.failed} registros fallaron en la importación masiva:`, results.failures);
    }

    return (profiles || []).map(row => this.mapProfileToPatient(row));
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
