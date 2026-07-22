import { supabase } from '../services/supabase';

export interface LeadSurveyResponseInput {
  promoterCode?: string;
  fullName: string;
  age?: number;
  whatsapp: string;
  painPoint: string;           // Q1
  whoGetsSickMore: string;     // Q2
  knewRemoteCare: boolean;     // Q3 (Sí/No)
  interestedInEasierAccess: boolean; // Q4 (Sí/No)
  fairMonthlyValue: number;    // Q5
  consentContact: boolean;
}

export interface LeadSurveyResponse {
  id: string;
  promoterCode?: string;
  fullName: string;
  age?: number;
  whatsapp: string;
  painPoint: string;
  whoGetsSickMore: string;
  knewRemoteCare: boolean;
  interestedInEasierAccess: boolean;
  fairMonthlyValue: number;
  consentContact: boolean;
  createdAt: string;
}

export interface LeadSurveyFilters {
  promoterCode?: string;
  from?: string;
  to?: string;
}

export class LeadSurveyRepository {
  /**
   * Envía una respuesta pública de la encuesta de opinión (formulario QR de asesores).
   */
  async submitResponse(input: LeadSurveyResponseInput): Promise<void> {
    // Validate promoterCode against active producers to prevent orphan attribution,
    // mirroring AdhesionRepository.submitApplication() — but only when a code was
    // provided at all, since a submission found organically has none.
    if (input.promoterCode && input.promoterCode.trim() !== '') {
      const { data: producer, error: producerErr } = await supabase
        .from('producers')
        .select('id')
        .eq('producer_code', input.promoterCode.trim())
        .eq('status', 'active')
        .maybeSingle();

      if (producerErr) {
        console.warn('Could not validate promoter code:', producerErr.message);
        // Non-blocking: proceed without promoter attribution if validation fails
      } else if (!producer) {
        throw new Error('El código de promotor ingresado no es válido o no está activo.');
      }
    }

    const { error } = await supabase
      .from('lead_survey_responses')
      .insert({
        promoter_code: input.promoterCode || null,
        full_name: input.fullName,
        age: input.age ?? null,
        whatsapp: input.whatsapp,
        pain_point: input.painPoint,
        who_gets_sick_more: input.whoGetsSickMore,
        knew_remote_care: input.knewRemoteCare,
        interested_in_easier_access: input.interestedInEasierAccess,
        fair_monthly_value: input.fairMonthlyValue,
        consent_contact: input.consentContact,
      });

    if (error) {
      console.error('Error submitting lead survey response:', error);
      throw new Error(error.message || 'Error al enviar la encuesta.');
    }
  }

  /**
   * Obtiene las respuestas de la encuesta para el panel de administración,
   * aplicando cada filtro sólo si fue provisto.
   */
  async getResponses(filters: LeadSurveyFilters = {}): Promise<LeadSurveyResponse[]> {
    let query = supabase.from('lead_survey_responses').select('*');

    if (filters.promoterCode) {
      query = query.eq('promoter_code', filters.promoterCode);
    }
    if (filters.from) {
      query = query.gte('created_at', filters.from);
    }
    if (filters.to) {
      query = query.lte('created_at', filters.to);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching lead survey responses:', error);
      throw new Error(error.message || 'Error al obtener las respuestas de la encuesta.');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      promoterCode: row.promoter_code ?? undefined,
      fullName: row.full_name,
      age: row.age ?? undefined,
      whatsapp: row.whatsapp,
      painPoint: row.pain_point,
      whoGetsSickMore: row.who_gets_sick_more,
      knewRemoteCare: row.knew_remote_care,
      interestedInEasierAccess: row.interested_in_easier_access,
      fairMonthlyValue: Number(row.fair_monthly_value),
      consentContact: row.consent_contact,
      createdAt: row.created_at,
    }));
  }
}

export const leadSurveyRepository = new LeadSurveyRepository();
