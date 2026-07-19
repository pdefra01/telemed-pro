import { supabase } from '../services/supabase';

export interface AdhesionRequest {
  id?: string;
  titular_name: string;
  titular_first_name?: string;
  titular_last_name?: string;
  titular_dni: string;
  titular_cuil?: string;
  titular_birth_date: string;
  titular_address: string;
  titular_locality: string;
  titular_neighborhood: string;
  titular_email: string;
  titular_phone: string;
  titular_civil_status: string;
  titular_health_insurance?: string;
  discovery_source?: string;
  discovery_other?: string;
  preferred_contact_time?: string;
  plan_type?: string;
  payment_method: string;
  payment_detail?: string;
  family_members?: any[];
  medical_history?: string[];
  medical_history_other?: string;
  recommended_friend_phone?: string;
  consent_data_treatment: boolean;
  consent_promotions: boolean;
  signature_base64: string;
  status?: 'pending' | 'approved' | 'rejected';
  promoter_id?: string;
  email_verified?: boolean;
  created_at?: string;
}

export class AdhesionRepository {
  /**
   * Envía una solicitud de adhesión de forma pública (para el formulario QR)
   */
  async submitApplication(data: AdhesionRequest): Promise<void> {
    // Pre-insert duplicate check (DNI + CUIL) against affiliates, family members
    // and pending requests, for the titular and every family member.
    const checkResponse = await fetch('/api/adhesion/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titularDni: data.titular_dni,
        titularCuil: data.titular_cuil,
        family: (data.family_members || []).map((member: any) => ({
          dni: member.dni,
          cuil: member.cuil,
          name: member.name
        }))
      })
    });

    const checkResult = await checkResponse.json().catch(() => ({}));

    if (!checkResult.ok) {
      const conflictMessages = (checkResult.conflicts || [])
        .filter((conflict: any) => conflict.message)
        .map((conflict: any) => {
          const who = conflict.person === 'titular' ? 'Titular' : `Familiar ${conflict.name || ''}`.trim();
          return `${who}: ${conflict.message}`;
        });
      throw new Error(
        conflictMessages.length > 0
          ? conflictMessages.join(' ')
          : 'Ya existe una solicitud con datos duplicados.'
      );
    }

    // Validate promoter_id against active producers to prevent orphan records (B-3)
    if (data.promoter_id && data.promoter_id.trim() !== '') {
      const { data: producer, error: producerErr } = await supabase
        .from('producers')
        .select('id')
        .eq('producer_code', data.promoter_id.trim())
        .eq('status', 'active')
        .maybeSingle();

      if (producerErr) {
        console.warn('Could not validate promoter_id:', producerErr.message);
        // Non-blocking: proceed without promoter attribution if validation fails
      } else if (!producer) {
        throw new Error('El código de promotor ingresado no es válido o no está activo.');
      }
    }

    const { error } = await supabase
      .from('adhesion_requests')
      .insert({
        titular_name: data.titular_name,
        titular_first_name: data.titular_first_name || null,
        titular_last_name: data.titular_last_name || null,
        titular_dni: data.titular_dni,
        titular_cuil: data.titular_cuil || null,
        titular_birth_date: data.titular_birth_date,
        titular_address: data.titular_address,
        titular_locality: data.titular_locality,
        titular_neighborhood: data.titular_neighborhood,
        titular_email: data.titular_email,
        titular_phone: data.titular_phone,
        titular_civil_status: data.titular_civil_status,
        titular_health_insurance: data.titular_health_insurance || null,
        discovery_source: data.discovery_source || null,
        discovery_other: data.discovery_other || null,
        preferred_contact_time: data.preferred_contact_time || null,
        plan_type: data.plan_type || 'Plan Familiar',
        payment_method: data.payment_method,
        payment_detail: data.payment_detail || null,
        family_members: data.family_members || [],
        medical_history: data.medical_history || [],
        medical_history_other: data.medical_history_other || null,
        recommended_friend_phone: data.recommended_friend_phone || null,
        consent_data_treatment: data.consent_data_treatment,
        consent_promotions: data.consent_promotions,
        signature_base64: data.signature_base64,
        status: 'pending',
        promoter_id: data.promoter_id || null,
        email_verified: data.email_verified || false
      });

    if (error) {
      console.error("Error submitting adhesion request:", error);
      throw new Error(error.message || "Error al enviar la solicitud.");
    }
  }

  /**
   * Obtiene todas las solicitudes pendientes (exclusivo para Admins)
   */
  async getPendingApplications(): Promise<AdhesionRequest[]> {
    const { data, error } = await supabase
      .from('adhesion_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching pending applications:", error);
      throw new Error(error.message || "Error al obtener solicitudes pendientes.");
    }

    return data || [];
  }

  /**
   * Aprueba una solicitud llamando al endpoint del backend
   */
  async approveApplication(id: string): Promise<void> {
    const response = await fetch('/api/approve-adhesion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adhesionId: id }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al aprobar la afiliación en el servidor.');
    }
  }

  /**
   * Rechaza una solicitud de adhesión cambiándole el estado
   */
  async rejectApplication(id: string): Promise<void> {
    const { error } = await supabase
      .from('adhesion_requests')
      .update({ status: 'rejected' })
      .eq('id', id);

    if (error) {
      console.error(`Error rejecting application ${id}:`, error);
      throw new Error(error.message || "Error al rechazar la solicitud.");
    }
  }
}

export const adhesionRepository = new AdhesionRepository();
