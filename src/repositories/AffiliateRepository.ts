import { supabase } from '../services/supabase';
import { Patient } from '../types';
import { generateUUID } from '../utils/uuid';
import { authRepository } from './AuthRepository';
import type { AffiliatePaymentStatus } from './AccountMovementRepository';

/**
 * FROZEN coverage-window billing terms for one affiliate, as returned by
 * `getCoverageWindowsForBilling` (cuenta-corriente-billing D6). Always read
 * from the window's own snapshot columns — never the live plan — so a later
 * admin plan edit cannot retroactively reclassify already-elapsed months.
 */
export interface CoverageWindowSnapshot {
  periodStart: string;
  paidMonthsSnapshot: number;
  bonusMonthsSnapshot: number;
  monthlyCostSnapshot: number;
}

/**
 * El paciente base ya fue creado con éxito (vía /api/create-patient), pero el
 * segundo write que le asigna el plan_id elegido falló. Se propaga como error
 * en vez de devolver silenciosamente un perfil sin plan, para que la UI
 * pueda mostrar un mensaje honesto en lugar de un "registrado" genérico.
 */
export class PlanAssignmentFailedError extends Error {
  constructor(public readonly patient: Patient, cause: unknown) {
    super('El afiliado se registró, pero no se pudo asignar el plan seleccionado.');
    this.name = 'PlanAssignmentFailedError';
    this.cause = cause as Error | undefined;
  }
}

/**
 * `assign_plan` ya commiteó el cambio de plan (y, si correspondía, abrió la
 * ventana de cobertura) antes de que el resto de los campos del perfil se
 * intente escribir en un segundo write separado. Si ese segundo write falla,
 * el plan/cupo ya cambiaron pero el resto del formulario no se guardó — se
 * propaga como error distinto de uno genérico para que la UI no reporte un
 * fallo total cuando en realidad una parte sí se persistió.
 */
export class ProfileFieldsUpdateFailedError extends Error {
  constructor(public readonly patient: Patient, cause: unknown) {
    super('El plan se actualizó correctamente, pero no se pudieron guardar los demás datos del afiliado.');
    this.name = 'ProfileFieldsUpdateFailedError';
    this.cause = cause as Error | undefined;
  }
}

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

    return this.mapRowsWithDerivedPaymentStatus(data || []);
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
    return this.mapRowsWithDerivedPaymentStatus(data || []);
  }

  /**
   * Batch-resolves each row's DERIVED payment status from
   * `affiliate_payment_status` (cuenta-corriente-billing PR3) before mapping
   * to `Patient` — ONE query for the whole batch, never one per row. Only
   * DIRECT affiliates (`agreement_id IS NULL`) can ever have a row in that
   * view (agreements are out of scope for the ledger); agreement-linked rows
   * skip the lookup entirely and fall through to `mapProfileToPatient`'s
   * documented default.
   */
  private async mapRowsWithDerivedPaymentStatus(rows: any[]): Promise<Patient[]> {
    const directIds = rows.filter(r => !r.agreement_id).map(r => r.id);

    const statusMap = new Map<string, AffiliatePaymentStatus>();
    if (directIds.length > 0) {
      const { data: statusRows, error: statusError } = await supabase
        .from('affiliate_payment_status')
        .select('entity_id, payment_status')
        .in('entity_id', directIds);

      if (statusError) {
        // No inventamos un estado ante un error de lectura de la vista — cada
        // fila cae al fallback documentado de mapProfileToPatient en vez de
        // reventar el listado completo por un problema puntual en la vista derivada.
        console.error('Error obteniendo estado de pago derivado (affiliate_payment_status):', statusError);
      } else {
        for (const s of statusRows || []) {
          statusMap.set(s.entity_id, s.payment_status);
        }
      }
    }

    return rows.map(row => this.mapProfileToPatient(row, statusMap.get(row.id)));
  }

  /**
   * Single-row variant for update/create call sites — an admin editing an
   * overdue affiliate's phone number must not get back a Patient object
   * claiming `paymentStatus: 'current'` just because this path skipped the
   * lookup (found by judgment-day review of cuenta-corriente-billing PR3;
   * traced to `Profile.tsx` overwriting the patient's own session/localStorage
   * with a stale/wrong status on self-edit).
   */
  private async mapRowWithDerivedPaymentStatus(row: any): Promise<Patient> {
    const [patient] = await this.mapRowsWithDerivedPaymentStatus([row]);
    return patient;
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
        birth_date: data.birthDate,
        locality: data.locality,
        neighborhood: data.neighborhood,
        cuil: data.cuil,
        password: data.dni, // DNI como password temporal por defecto
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
        planName: data.planName || 'Sin plan asignado',
        planStatus: data.planStatus || 'active',
        address: data.address,
        phone: data.phone,
        paymentStatus: 'current',
        currentPeriodQuotaUsed: 0
      };
    }

    // El endpoint /api/create-patient no acepta plan_id (solo crea el auth user +
    // el perfil base vía trigger). Si el admin eligió un plan al crear el afiliado,
    // lo asignamos acá vía la RPC assign_plan — no con un update directo, porque
    // esta es exactamente la primera asignación que assign_plan usa para abrir
    // automáticamente la ventana de cobertura (un write directo la dejaría sin crear).
    if (data.planId) {
      const { data: withPlan, error: planAssignError } = await supabase.rpc('assign_plan', {
        p_profile_id: result.id,
        p_plan_id: data.planId,
      });

      if (planAssignError) {
        console.error(`Error asignando plan al afiliado recién creado ${result.id}:`, planAssignError);
        throw new PlanAssignmentFailedError(this.mapProfileToPatient(profile), planAssignError);
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
          planName: source.planName || 'Sin plan asignado',
          planStatus: source.planStatus || 'active',
          address: source.address,
          phone: source.phone,
          paymentStatus: 'current',
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
    // plan_id ya NO se escribe acá — se enruta por la RPC assign_plan (ver
    // abajo), que además abre automáticamente la ventana de cobertura en la
    // primera asignación. Un write directo a profiles.plan_id dejaría esa
    // ventana sin crear.
    if (data.planStatus !== undefined) profileData.plan_status = data.planStatus;
    if (data.address !== undefined) profileData.address = data.address;
    if (data.phone !== undefined) profileData.phone = data.phone;
    if (data.bloodType !== undefined) profileData.blood_type = data.bloodType || null;
    if (data.birthDate !== undefined) profileData.birth_date = data.birthDate || null;
    if (data.locality !== undefined) profileData.locality = data.locality || null;
    if (data.neighborhood !== undefined) profileData.neighborhood = data.neighborhood || null;
    if (data.cuil !== undefined) profileData.cuil = data.cuil || null;

    // Sync the real Supabase Auth login email — updating profiles.email alone
    // leaves the account unable to log in with the new address.
    if (data.email !== undefined) {
      await authRepository.updateEmailFromAdmin(id, data.email);
    }

    let assignedProfile: any = null;
    if (data.planId !== undefined) {
      const { data: rpcResult, error: assignError } = await supabase.rpc('assign_plan', {
        p_profile_id: id,
        p_plan_id: data.planId,
      });

      if (assignError) {
        console.error(`Error asignando plan al afiliado ${id}:`, assignError);
        throw assignError;
      }

      assignedProfile = rpcResult;
    }

    if (Object.keys(profileData).length === 0) {
      // Solo cambió el plan (o nada más) — assign_plan ya devolvió el perfil
      // actualizado completo, evitamos un segundo UPDATE vacío/redundante.
      return this.mapRowWithDerivedPaymentStatus(assignedProfile);
    }

    const { data: result, error } = await supabase
      .from('profiles')
      .update(profileData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`Error actualizando afiliado ${id}:`, error);
      if (assignedProfile) {
        throw new ProfileFieldsUpdateFailedError(await this.mapRowWithDerivedPaymentStatus(assignedProfile), error);
      }
      throw error;
    }

    return this.mapRowWithDerivedPaymentStatus(result);
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
   * "sin plan" en lugar de un número inventado.
   *
   * El cupo otorgado y la vigencia (`coverageActive`/`paidThrough`) se leen SIEMPRE
   * de la ventana de cobertura (`family_coverage_windows`), nunca del plan vivo:
   * es el snapshot congelado en `assign_plan`/`renew_coverage_window` el que
   * determina lo ya otorgado, para que un cambio de plan a mitad de ventana no
   * altere retroactivamente el cupo. Si la ventana venció (`paid_through < now()`)
   * se reporta un estado "vencido" explícito y nunca se informa el remanente
   * congelado como disponible. Si el plan es ilimitado, `totalBonified` y
   * `remaining` son `null` para no simular un tope numérico.
   */
  async getConsultationQuotaStatus(patientId: string): Promise<{
    quotaUsed: number;
    totalBonified: number | null;
    remaining: number | null;
    isUnlimited: boolean;
    hasPlan: boolean;
    isOverQuota: boolean;
    planName: string;
    coverageActive: boolean;
    paidThrough: string | null;
    periodStart: string | null;
  }> {
    const noPlanState = (quotaUsed: number) => ({
      quotaUsed,
      totalBonified: 0,
      remaining: 0,
      isUnlimited: false,
      hasPlan: false,
      isOverQuota: false,
      planName: 'Sin plan asignado',
      coverageActive: false,
      paidThrough: null,
      periodStart: null,
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

    // Subject key mirrors assign_plan/renew_coverage_window: family_group_id
    // when present, else the standalone profile id.
    const windowQuery = profile.family_group_id
      ? supabase
          .from('family_coverage_windows')
          .select('paid_through, period_start, granted_quota, is_unlimited')
          .eq('family_group_id', profile.family_group_id)
      : supabase
          .from('family_coverage_windows')
          .select('paid_through, period_start, granted_quota, is_unlimited')
          .eq('subject_profile_id', patientId);

    const { data: window, error: windowErr } = await windowQuery.maybeSingle();

    if (windowErr) {
      console.error(`Error obteniendo ventana de cobertura para ${patientId}:`, windowErr);
    }

    if (!window) {
      // Tiene plan asignado pero nunca se abrió una ventana de cobertura
      // (p.ej. asignación legacy fuera de assign_plan) — se informa como
      // cobertura inactiva sin inventar un cupo que no existe.
      return {
        quotaUsed,
        totalBonified: null,
        remaining: null,
        isUnlimited: false,
        hasPlan: true,
        isOverQuota: false,
        planName: plan.name,
        coverageActive: false,
        paidThrough: null,
        periodStart: null,
      };
    }

    const coverageActive = new Date(window.paid_through) > new Date();
    const isUnlimited = !!window.is_unlimited;

    if (!coverageActive) {
      // Vencida: nunca se reporta el remanente congelado como disponible,
      // sea el plan finito o ilimitado.
      return {
        quotaUsed,
        totalBonified: isUnlimited ? null : window.granted_quota,
        remaining: 0,
        isUnlimited,
        hasPlan: true,
        isOverQuota: true,
        planName: plan.name,
        coverageActive: false,
        paidThrough: window.paid_through,
        periodStart: window.period_start,
      };
    }

    const totalBonified = isUnlimited ? null : window.granted_quota;
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
      coverageActive: true,
      paidThrough: window.paid_through,
      periodStart: window.period_start,
    };
  }

  /**
   * Ejecuta la renovación explícita de la ventana de cobertura vencida vía la
   * RPC `renew_coverage_window` (SECURITY DEFINER, atómica). Nunca es
   * automática — es una acción manual del admin, ya que no existe scheduler;
   * la propia RPC rechaza renovar una ventana que todavía no venció.
   */
  async renewCoverageWindow(profileId: string): Promise<{
    paidThrough: string;
    periodStart: string;
    grantedQuota: number | null;
    isUnlimited: boolean;
    isDelinquent: boolean;
    balanceDue: number;
  }> {
    const { data, error } = await supabase.rpc('renew_coverage_window', { p_profile_id: profileId });

    if (error) {
      console.error(`Error renovando cobertura del afiliado ${profileId}:`, error);
      throw error;
    }

    // PostgREST returns the named composite type renew_coverage_window_result
    // as ONE object with the window row NESTED under the "window" key —
    // {window:{...}, is_delinquent, balance_due} — never flat, never
    // array-wrapped (cuenta-corriente-billing PR2's RETURNS
    // renew_coverage_window_result, not RETURNS TABLE/SETOF).
    return {
      paidThrough: data.window.paid_through,
      periodStart: data.window.period_start,
      grantedQuota: data.window.granted_quota,
      isUnlimited: data.window.is_unlimited,
      isDelinquent: data.is_delinquent,
      balanceDue: Number(data.balance_due),
    };
  }

  /**
   * Batch-resolves the CURRENT coverage window's FROZEN snapshot terms
   * (`period_start`/`paid_months_snapshot`/`bonus_months_snapshot`/
   * `monthly_cost_snapshot` — cuenta-corriente-billing D6) for a set of
   * affiliates, keyed by `affiliate.id`. Avoids N+1 (one query for all
   * family-group affiliates + one for all standalone affiliates, instead of
   * one query per affiliate). An affiliate absent from the returned Map has
   * NO window (e.g. onboarded via `/approve-adhesion`, which writes
   * `plan_id`/`plan_status` directly and never calls `assign_plan`) — callers
   * MUST treat a missing entry as "no window" and never fabricate one.
   */
  async getCoverageWindowsForBilling(affiliates: Patient[]): Promise<Map<string, CoverageWindowSnapshot>> {
    const result = new Map<string, CoverageWindowSnapshot>();
    if (affiliates.length === 0) return result;

    const selectCols = 'family_group_id, subject_profile_id, period_start, paid_months_snapshot, bonus_months_snapshot, monthly_cost_snapshot';
    const familyGroupIds = [...new Set(affiliates.filter(a => a.familyGroupId).map(a => a.familyGroupId as string))];
    const standaloneIds = affiliates.filter(a => !a.familyGroupId).map(a => a.id);

    const [familyResult, standaloneResult] = await Promise.all([
      familyGroupIds.length > 0
        ? supabase.from('family_coverage_windows').select(selectCols).in('family_group_id', familyGroupIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      standaloneIds.length > 0
        ? supabase.from('family_coverage_windows').select(selectCols).in('subject_profile_id', standaloneIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (familyResult.error) throw familyResult.error;
    if (standaloneResult.error) throw standaloneResult.error;

    const byFamilyGroup = new Map<string, any>((familyResult.data || []).map((w: any) => [w.family_group_id, w]));
    const bySubjectProfile = new Map<string, any>((standaloneResult.data || []).map((w: any) => [w.subject_profile_id, w]));

    for (const affiliate of affiliates) {
      const row = affiliate.familyGroupId
        ? byFamilyGroup.get(affiliate.familyGroupId)
        : bySubjectProfile.get(affiliate.id);

      if (!row) continue; // no window — caller must skip + surface, never fabricate

      // Defensive: NULL snapshot columns mean this window predates PR1's
      // snapshot migration and its backfill hasn't (or couldn't) resolve a
      // value for it — never bill an unverifiable amount, treat exactly like
      // "no window".
      if (row.paid_months_snapshot == null || row.bonus_months_snapshot == null || row.monthly_cost_snapshot == null) {
        continue;
      }

      result.set(affiliate.id, {
        periodStart: row.period_start,
        paidMonthsSnapshot: row.paid_months_snapshot,
        bonusMonthsSnapshot: row.bonus_months_snapshot,
        monthlyCostSnapshot: Number(row.monthly_cost_snapshot),
      });
    }

    return result;
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

  /**
   * @param derivedPaymentStatus Pre-resolved value from `affiliate_payment_status`
   * (see `mapRowsWithDerivedPaymentStatus`), already looked up by the caller
   * to avoid an N+1 query per row. `profiles.payment_status` is DEPRECATED
   * (write-stopped since PR1) and is intentionally never read here anymore.
   * `AffiliatePaymentStatus` ('current'|'pending'|'overdue') and
   * `Patient.paymentStatus` share the exact same vocabulary since the PR4
   * rename, so no translation is needed — `undefined` (no row in the view)
   * defaults to `'current'`, which is honest for BOTH cases that produce it:
   *   - an agreement-linked profile: agreements are entirely out of scope for
   *     this ledger (Scope Boundary), so no row can ever exist for them —
   *     never fabricate 'overdue'/'pending' for a status this feature can't see.
   *   - a direct affiliate with zero ledger movements yet (e.g. brand new, no
   *     billing cycle has run): balance is genuinely 0 by construction, so
   *     'current' (no view row = no charge = no debt) is the CORRECT value,
   *     not a guess.
   */
  private mapProfileToPatient(row: any, derivedPaymentStatus?: AffiliatePaymentStatus): Patient {
    return {
      id: row.id,
      name: row.full_name,
      email: row.email || '',
      role: 'patient',
      dni: row.dni,
      planId: row.plan_id ?? undefined,
      planName: row.plan_name || 'Sin plan asignado',
      planStatus: row.plan_status || 'active',
      avatarUrl: row.avatar_url,
      address: row.address,
      phone: row.phone,
      birthDate: row.birth_date ?? undefined,
      bloodType: row.blood_type ?? undefined,
      agreementId: row.agreement_id,
      familyGroupId: row.family_group_id ?? undefined,
      paymentStatus: derivedPaymentStatus ?? 'current',
      currentPeriodQuotaUsed: row.current_period_quota_used || 0,
      isActive: row.is_active,
      locality: row.locality ?? undefined,
      neighborhood: row.neighborhood ?? undefined,
      cuil: row.cuil ?? undefined,
    };
  }
}

export const affiliateRepository = new AffiliateRepository();
