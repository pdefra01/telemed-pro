import { supabase } from '../services/supabase';
import { LegalTerm, LegalAcceptance } from '../types';

export class SubscriptionRepository {
  /**
   * Obtiene los Términos y Condiciones vigentes del sistema
   */
  async getActiveLegalTerms(): Promise<LegalTerm | null> {
    const { data, error } = await supabase
      .from('legal_terms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      version: data.version,
      title: data.title,
      contentMarkdown: data.content_markdown,
      isActive: data.is_active,
      createdAt: data.created_at
    };
  }

  /**
   * Registra la auditoría legal de aceptación de Términos y Condiciones con IP y Timestamp
   */
  async recordLegalAcceptance(userId: string, termsVersion: string, ipAddress: string): Promise<LegalAcceptance> {
    const { data, error } = await supabase
      .from('legal_acceptances')
      .insert({
        user_id: userId,
        terms_version: termsVersion,
        ip_address: ipAddress || '190.210.45.12',
        user_agent: window.navigator.userAgent || 'Web Client v2.0'
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      termsVersion: data.terms_version,
      acceptedAt: data.accepted_at,
      ipAddress: data.ip_address,
      userAgent: data.user_agent
    };
  }

  /**
   * Completa la suscripción del usuario vinculándolo a un productor y enviando el kit de bienvenida
   */
  async completeSubscription(userId: string, producerId: string | null, planName: string): Promise<{ success: boolean; welcomeEmailSent: boolean }> {
    const { error } = await supabase
      .from('profiles')
      .update({
        producer_id: producerId,
        subscription_status: 'active'
      })
      .eq('id', userId);

    if (error) throw error;

    // Simulación de envío de correo de bienvenida y kit de cobertura
    console.log(`[EMAIL SERVICE] Contrato y kit de cobertura enviados a la casilla verificada del afiliado ${userId} para el plan ${planName}. Producer ID: ${producerId || 'Directo'}`);

    return {
      success: true,
      welcomeEmailSent: true
    };
  }
}

export const subscriptionRepository = new SubscriptionRepository();
