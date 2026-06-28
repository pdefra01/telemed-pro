import { supabase } from '../services/supabase';
import { SurveyTemplate, SurveyQuestion, SurveyResponse, CampaignAction } from '../types';

export class SurveyRepository {
  /**
   * Obtiene todas las plantillas de encuestas con sus preguntas
   */
  async getAllTemplates(): Promise<SurveyTemplate[]> {
    const { data: templates, error } = await supabase
      .from('survey_templates')
      .select('*, survey_questions(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching survey templates:', error);
      throw error;
    }

    return (templates || []).map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      createdBy: t.created_by,
      createdAt: t.created_at,
      questions: (t.survey_questions || [])
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
        .map((q: any) => ({
          id: q.id,
          templateId: q.template_id,
          text: q.text,
          type: q.type,
          options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : undefined,
          isRequired: q.is_required,
          orderIndex: q.order_index
        }))
    }));
  }

  /**
   * Obtiene una plantilla específica por su ID
   */
  async getTemplateById(id: string): Promise<SurveyTemplate> {
    const { data: t, error } = await supabase
      .from('survey_templates')
      .select('*, survey_questions(*)')
      .eq('id', id)
      .single();

    if (error || !t) {
      console.error(`Error fetching template ${id}:`, error);
      throw error || new Error('Plantilla no encontrada');
    }

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      createdBy: t.created_by,
      createdAt: t.created_at,
      questions: (t.survey_questions || [])
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
        .map((q: any) => ({
          id: q.id,
          templateId: q.template_id,
          text: q.text,
          type: q.type,
          options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : undefined,
          isRequired: q.is_required,
          orderIndex: q.order_index
        }))
    };
  }

  /**
   * Crea una nueva plantilla con sus preguntas
   */
  async createTemplate(title: string, description: string, questions: Omit<SurveyQuestion, 'id' | 'templateId'>[]): Promise<SurveyTemplate> {
    const { data: template, error: tErr } = await supabase
      .from('survey_templates')
      .insert({ title, description })
      .select()
      .single();

    if (tErr || !template) throw tErr || new Error('Error al crear plantilla');

    if (questions.length > 0) {
      const qPayload = questions.map((q, idx) => ({
        template_id: template.id,
        text: q.text,
        type: q.type,
        options: q.options ? JSON.stringify(q.options) : null,
        is_required: q.isRequired,
        order_index: idx
      }));

      const { error: qErr } = await supabase
        .from('survey_questions')
        .insert(qPayload);

      if (qErr) console.error('Error insertando preguntas:', qErr);
    }

    return this.getTemplateById(template.id);
  }

  /**
   * Elimina una plantilla de encuesta
   */
  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('survey_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Envía las respuestas de una encuesta y ejecuta los disparadores de acciones configurados
   */
  async submitSurveyResponses(
    assignmentId: string,
    campaignId: string,
    patientId: string,
    responses: { questionId: string; responseValue: string }[]
  ): Promise<void> {
    // 1. Guardar respuestas
    const rPayload = responses.map(r => ({
      assignment_id: assignmentId,
      question_id: r.questionId,
      patient_id: patientId,
      response_value: r.responseValue
    }));

    const { error: rErr } = await supabase
      .from('survey_responses')
      .insert(rPayload);

    if (rErr) throw rErr;

    // 2. Marcar asignación como completada
    await supabase
      .from('campaign_assignments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', assignmentId);

    // 3. Evaluar disparadores de acciones de la campaña (Task 2.2)
    try {
      await this.evaluateCampaignActions(campaignId, patientId, responses);
    } catch (actErr) {
      console.error('Error evaluando acciones de campaña:', actErr);
    }
  }

  /**
   * Evalúa las reglas de acción de la campaña y ejecuta los disparadores (Notificaciones / Alertas)
   */
  private async evaluateCampaignActions(
    campaignId: string,
    patientId: string,
    responses: { questionId: string; responseValue: string }[]
  ): Promise<void> {
    const { data: actions, error } = await supabase
      .from('campaign_actions')
      .select('*')
      .eq('campaign_id', campaignId);

    if (error || !actions || actions.length === 0) return;

    for (const action of actions) {
      const resp = responses.find(r => r.questionId === action.question_id);
      if (!resp) continue;

      const matched = this.checkCondition(resp.responseValue, action.condition_operator, action.condition_value);
      if (matched) {
        await this.executeAction(action, patientId);
      }
    }
  }

  private checkCondition(val: string, operator: string, targetVal: string): boolean {
    const numVal = parseFloat(val);
    const numTarget = parseFloat(targetVal);

    switch (operator) {
      case 'equals':
        return val.toLowerCase().trim() === targetVal.toLowerCase().trim();
      case 'contains':
        return val.toLowerCase().includes(targetVal.toLowerCase());
      case 'greater_than':
        return !isNaN(numVal) && !isNaN(numTarget) && numVal > numTarget;
      case 'less_than':
        return !isNaN(numVal) && !isNaN(numTarget) && numVal < numTarget;
      default:
        return false;
    }
  }

  private async executeAction(action: any, patientId: string): Promise<void> {
    if (action.action_type === 'medical_alert') {
      await supabase.from('notifications').insert({
        user_id: patientId,
        title: '⚠️ Atención Médica Requerida',
        message: 'Según tus respuestas en el censo de salud, te recomendamos realizar una consulta de control.',
        type: 'warning',
        link: '/appointments'
      });
    } else if (action.action_type === 'recommend_appointment') {
      await supabase.from('notifications').insert({
        user_id: patientId,
        title: '🩺 Invitación a Turno Preventivo',
        message: 'Tu censo de salud indica que es momento de agendar un chequeo preventivo.',
        type: 'info',
        link: '/appointments'
      });
    } else if (action.action_type === 'tag_risk_group') {
      // Opcionalmente guardar etiqueta en notes o metadata del perfil
      console.log(`[CampaignAction] Paciente ${patientId} etiquetado en grupo de riesgo.`);
    }
  }
}

export const surveyRepository = new SurveyRepository();
