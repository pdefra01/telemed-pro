import { supabase } from '../services/supabase';
import { Patient } from '../types';
import { generateUUID } from '../utils/uuid';
import { authRepository } from './AuthRepository';

export class AffiliateRepository {
  /**
   * Obtiene todos los afiliados activos
   */
  async getAllAffiliates(): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'patient')
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
      .eq('agreement_id', agreementId);

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
      .is('agreement_id', null);

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
        planId: data.planId,
        planName: data.planName || 'Plan Base',
        planStatus: data.planStatus || 'active',
        address: data.address,
        phone: data.phone,
        paymentStatus: 'paid',
        currentPeriodQuotaUsed: 0
      };
    }

    // El endpoint /api/create-patient no acepta plan_id (solo crea el auth user +
    // el perfil base vía trigger). Si el admin eligió un plan al crear el afiliado,
    // lo asignamos acá con un segundo write — el trigger de profiles sincroniza
    // plan_name automáticamente a partir de plan_id.
    if (data.planId) {
      const { data: withPlan, error: planAssignError } = await supabase
        .from('profiles')
        .update({ plan_id: data.planId })
        .eq('id', result.id)
        .select()
        .single();

      if (planAssignError) {
        console.error(`Error asignando plan al afiliado recién creado ${result.id}:`, planAssignError);
      } else {
        return this.mapProfileToPatient(withPlan);
      }
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
    // Solo escribimos plan_id — el trigger sync_profile_plan_name_trigger sincroniza
    // plan_name automáticamente. Nunca se escribe plan_name directo (evita el drift
    // que causaba el bug original de esta feature).
    if (data.planId !== undefined) profileData.plan_id = data.planId;
    if (data.planStatus !== undefined) profileData.plan_status = data.planStatus;
    if (data.address !== undefined) profileData.address = data.address;
    if (data.phone !== undefined) profileData.phone = data.phone;
    if (data.bloodType !== undefined) profileData.blood_type = data.bloodType || null;
    if (data.birthDate !== undefined) profileData.birth_date = data.birthDate || null;

    // Sync the real Supabase Auth login email — updating profiles.email alone
    // leaves the account unable to log in with the new address.
    if (data.email !== undefined) {
      await authRepository.updateEmailFromAdmin(id, data.email);
    }

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
   * Activa/Aprueba a un afiliado
   */
  async activateAffiliate(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true, plan_status: 'active' })
      .eq('id', id);

    if (error) {
      console.error(`Error activando afiliado ${id}:`, error);
      throw error;
    }
  }

  /**
   * Desactiva a un afiliado (Soft Delete / Suspensión)
   */
  async deactivateAffiliate(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false, plan_status: 'suspended' })
      .eq('id', id);

    if (error) {
      console.error(`Error desactivando afiliado ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene el estado del cupo de consultas bonificadas del paciente y su grupo familiar.
   *
   * Resuelve el plan real vía `profiles.plan_id -> plans` (nunca fabrica un cupo por
   * defecto). Si el paciente no tiene plan asignado, devuelve un estado explícito
   * "sin plan" en lugar de un número inventado. Si el plan es ilimitado, `totalBonified`
   * y `remaining` son `null` para no simular un tope numérico.
   */
  async getConsultationQuotaStatus(patientId: string): Promise<{
    quotaUsed: number;
    totalBonified: number | null;
    remaining: number | null;
    isUnlimited: boolean;
    hasPlan: boolean;
    isOverQuota: boolean;
    planName: string;
  }> {
    const noPlanState = (quotaUsed: number) => ({
      quotaUsed,
      totalBonified: 0,
      remaining: 0,
      isUnlimited: false,
      hasPlan: false,
      isOverQuota: false,
      planName: 'Sin plan asignado',
    });

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('plan_id, current_period_quota_used, family_group_id')
      .eq('id', patientId)
      .single();

    if (pErr || !profile) {
      console.error(`Error obteniendo perfil ${patientId} para cupo de consultas:`, pErr);
      return noPlanState(0);
    }

    let quotaUsed = profile.current_period_quota_used || 0;

    // Si tiene grupo familiar, sumar el consumo de todos los integrantes
    if (profile.family_group_id) {
      const { data: familyProfiles } = await supabase
        .from('profiles')
        .select('current_period_quota_used')
        .eq('family_group_id', profile.family_group_id);
      if (familyProfiles) {
        quotaUsed = familyProfiles.reduce((acc, curr) => acc + (curr.current_period_quota_used || 0), 0);
      }
    }

    if (!profile.plan_id) {
      return noPlanState(quotaUsed);
    }

    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('name, bonified_consultations, is_unlimited')
      .eq('id', profile.plan_id)
      .single();

    if (planErr || !plan) {
      console.error(`Error obteniendo plan ${profile.plan_id} para cupo de consultas:`, planErr);
      return noPlanState(quotaUsed);
    }

    const isUnlimited = !!plan.is_unlimited;
    const totalBonified = isUnlimited ? null : plan.bonified_consultations;
    const remaining = isUnlimited ? null : Math.max(0, (totalBonified ?? 0) - quotaUsed);
    const isOverQuota = !isUnlimited && quotaUsed >= (totalBonified ?? 0);

    return {
      quotaUsed,
      totalBonified,
      remaining,
      isUnlimited,
      hasPlan: true,
      isOverQuota,
      planName: plan.name,
    };
  }

  /**
   * Incrementa el contador de consultas consumidas para el paciente
   */
  async incrementQuotaUsed(patientId: string): Promise<void> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_period_quota_used')
      .eq('id', patientId)
      .single();

    const current = profile?.current_period_quota_used || 0;
    await supabase
      .from('profiles')
      .update({ current_period_quota_used: current + 1 })
      .eq('id', patientId);
  }

  private mapProfileToPatient(row: any): Patient {
    return {
      id: row.id,
      name: row.full_name,
      email: row.email || '',
      role: 'patient',
      dni: row.dni,
      planId: row.plan_id ?? undefined,
      planName: row.plan_name || 'Plan Base',
      planStatus: row.plan_status || 'active',
      avatarUrl: row.avatar_url,
      address: row.address,
      phone: row.phone,
      birthDate: row.birth_date ?? undefined,
      bloodType: row.blood_type ?? undefined,
      agreementId: row.agreement_id,
      familyGroupId: row.family_group_id ?? undefined,
      paymentStatus: row.payment_status || 'paid',
      currentPeriodQuotaUsed: row.current_period_quota_used || 0,
      isActive: row.is_active
    };
  }
}

export const affiliateRepository = new AffiliateRepository();
