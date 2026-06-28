import { supabase } from '../services/supabase';
import { Campaign, CampaignAction, CampaignAssignment } from '../types';

export class CampaignRepository {
  /**
   * Obtiene todas las campañas registradas
   */
  async getAllCampaigns(): Promise<Campaign[]> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, survey_templates(title)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }

    return (data || []).map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      templateId: c.template_id,
      templateTitle: c.survey_templates?.title || 'Plantilla',
      status: c.status,
      targetGroup: c.target_group,
      targetGroupId: c.target_group_id,
      startDate: c.start_date,
      endDate: c.end_date,
      createdAt: c.created_at
    }));
  }

  /**
   * Obtiene las acciones configuradas para una campaña
   */
  async getCampaignActions(campaignId: string): Promise<CampaignAction[]> {
    const { data, error } = await supabase
      .from('campaign_actions')
      .select('*')
      .eq('campaign_id', campaignId);

    if (error) throw error;

    return (data || []).map(a => ({
      id: a.id,
      campaignId: a.campaign_id,
      questionId: a.question_id,
      conditionOperator: a.condition_operator,
      conditionValue: a.condition_value,
      actionType: a.action_type,
      actionPayload: a.action_payload
    }));
  }

  /**
   * Crea una nueva campaña con sus reglas de acción
   */
  async createCampaign(
    campaignData: Omit<Campaign, 'id' | 'createdAt' | 'status'>,
    actions: Omit<CampaignAction, 'id' | 'campaignId'>[]
  ): Promise<Campaign> {
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .insert({
        title: campaignData.title,
        description: campaignData.description,
        template_id: campaignData.templateId,
        status: 'draft',
        target_group: campaignData.targetGroup,
        target_group_id: campaignData.targetGroupId || null
      })
      .select()
      .single();

    if (cErr || !campaign) throw cErr || new Error('Error creando campaña');

    if (actions.length > 0) {
      const actPayload = actions.map(a => ({
        campaign_id: campaign.id,
        question_id: a.questionId,
        condition_operator: a.conditionOperator,
        condition_value: a.conditionValue,
        action_type: a.actionType,
        action_payload: a.actionPayload || null
      }));

      const { error: aErr } = await supabase
        .from('campaign_actions')
        .insert(actPayload);

      if (aErr) console.error('Error insertando acciones de campaña:', aErr);
    }

    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      templateId: campaign.template_id,
      status: campaign.status,
      targetGroup: campaign.target_group,
      targetGroupId: campaign.target_group_id,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      createdAt: campaign.created_at
    };
  }

  /**
   * Activa una campaña y genera las asignaciones para los pacientes elegibles
   */
  async activateCampaign(campaignId: string): Promise<void> {
    // 1. Obtener la campaña
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (cErr || !campaign) throw cErr || new Error('Campaña no encontrada');

    // 2. Buscar pacientes según target_group
    let query = supabase.from('profiles').select('id, full_name').eq('role', 'patient').eq('is_active', true);

    if (campaign.target_group === 'agreement' && campaign.target_group_id) {
      query = query.eq('agreement_id', campaign.target_group_id);
    }

    const { data: patients, error: pErr } = await query;
    if (pErr) throw pErr;

    if (patients && patients.length > 0) {
      // 3. Crear asignaciones de forma atómica (UPSERT o IGNORE)
      const assignPayload = patients.map(p => ({
        campaign_id: campaignId,
        patient_id: p.id,
        status: 'pending'
      }));

      const { error: asErr } = await supabase
        .from('campaign_assignments')
        .upsert(assignPayload, { onConflict: 'campaign_id,patient_id', ignoreDuplicates: true });

      if (asErr) console.error('Error creando asignaciones:', asErr);

      // 4. Notificar a los pacientes asignados
      const notifPayload = patients.map(p => ({
        user_id: p.id,
        title: '📋 Nuevo Censo de Salud Disponible',
        message: `Se ha publicado el censo "${campaign.title}". Por favor, completalo desde tu portal.`,
        type: 'info',
        link: '/patient-surveys'
      }));

      await supabase.from('notifications').insert(notifPayload);
    }

    // 5. Cambiar estado a activa
    await supabase
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', campaignId);
  }

  /**
   * Obtiene las asignaciones de encuestas pendientes para un paciente
   */
  async getMyPendingAssignments(patientId: string): Promise<(CampaignAssignment & { campaignTitle: string; templateId: string })[]> {
    const { data, error } = await supabase
      .from('campaign_assignments')
      .select('*, campaigns(title, template_id)')
      .eq('patient_id', patientId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching patient assignments:', error);
      throw error;
    }

    return (data || []).map(a => ({
      id: a.id,
      campaignId: a.campaign_id,
      campaignTitle: a.campaigns?.title || 'Censo de Salud',
      templateId: a.campaigns?.template_id || '',
      patientId: a.patient_id,
      status: a.status,
      assignedAt: a.assigned_at,
      completedAt: a.completed_at
    }));
  }

  /**
   * Obtiene métricas estadísticas de una campaña
   */
  async getCampaignStats(campaignId: string): Promise<{ totalAssigned: number; completedCount: number; completionPercentage: number }> {
    const { data: assignments, error } = await supabase
      .from('campaign_assignments')
      .select('status')
      .eq('campaign_id', campaignId);

    if (error || !assignments) return { totalAssigned: 0, completedCount: 0, completionPercentage: 0 };

    const totalAssigned = assignments.length;
    const completedCount = assignments.filter(a => a.status === 'completed').length;
    const completionPercentage = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

    return { totalAssigned, completedCount, completionPercentage };
  }
}

export const campaignRepository = new CampaignRepository();
