import React, { useState, useEffect } from 'react';
import { 
  Megaphone, Plus, Play, CheckCircle2, AlertCircle, 
  Users, BarChart2, Bell, ShieldAlert, Calendar, Loader2, Save, X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Campaign, SurveyTemplate, ActionType, ConditionOperator, CampaignAction } from '../../types';
import { campaignRepository } from '../../repositories/CampaignRepository';
import { surveyRepository } from '../../repositories/SurveyRepository';

interface NewAction {
  questionId: string;
  conditionOperator: ConditionOperator;
  conditionValue: string;
  actionType: ActionType;
}

export const Campaigns: React.FC = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [targetGroup, setTargetGroup] = useState<'all' | 'agreement'>('all');
  const [verifiedChannelsOnly, setVerifiedChannelsOnly] = useState<boolean>(true);
  const [actions, setActions] = useState<NewAction[]>([]);

  // Selected template questions for action rules
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [cData, tData] = await Promise.all([
        campaignRepository.getAllCampaigns(),
        surveyRepository.getAllTemplates()
      ]);
      setCampaigns(cData);
      setTemplates(tData);
      if (tData.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(tData[0].id);
      }
    } catch (err) {
      console.error(err);
      toast('Error al cargar datos de campañas', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddActionRule = () => {
    if (!selectedTemplate || !selectedTemplate.questions || selectedTemplate.questions.length === 0) {
      toast('Seleccioná una encuesta que tenga preguntas primero', 'warning');
      return;
    }
    setActions([
      ...actions,
      {
        questionId: selectedTemplate.questions[0].id,
        conditionOperator: 'equals',
        conditionValue: 'Sí',
        actionType: 'medical_alert'
      }
    ]);
  };

  const handleRemoveActionRule = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, field: keyof NewAction, value: any) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], [field]: value };
    setActions(updated);
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast('Ingresá el nombre de la campaña', 'error');
      return;
    }
    if (!selectedTemplateId) {
      toast('Seleccioná una encuesta para la campaña', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await campaignRepository.createCampaign(
        {
          title: title.trim(),
          description: description.trim(),
          templateId: selectedTemplateId,
          targetGroup,
          startDate: new Date().toISOString()
        },
        actions.map(a => ({
          questionId: a.questionId,
          conditionOperator: a.conditionOperator,
          conditionValue: a.conditionValue,
          actionType: a.actionType
        }))
      );
      toast('Campaña creada en borrador', 'success');
      setTitle('');
      setDescription('');
      setActions([]);
      setShowForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast('Error al crear campaña', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivateCampaign = async (id: string) => {
    if (!window.confirm('¿Deseás activar esta campaña? Se enviarán notificaciones a los afiliados correspondientes.')) return;
    try {
      await campaignRepository.activateCampaign(id);
      toast('¡Campaña activada con éxito! Notificaciones enviadas.', 'success');
      fetchData();
    } catch (err) {
      console.error(err);
      toast('Error al activar la campaña', 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Megaphone size={20} />
            </div>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.25em]">Salud Preventiva</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Campañas de Censado</h1>
          <p className="text-slate-400 text-sm mt-1">Administrá relevamientos epidemiológicos y automatizá disparadores de acciones clínicas.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="relative z-10 px-6 py-4 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus size={18} />
          <span>{showForm ? 'Cancelar' : 'Nueva Campaña'}</span>
        </button>
      </div>

      {/* New Campaign Form */}
      {showForm && (
        <form onSubmit={handleCreateCampaign} className="bg-slate-900/60 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-blue-500/30 shadow-3xl space-y-8 animate-in slide-in-from-top duration-300">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Megaphone size={22} className="text-blue-400" />
            Configurar Nueva Campaña
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              id="cTitle"
              label="Nombre de la Campaña *"
              placeholder="Ej: Campaña de Control de Diabetes Tipo 2"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="bg-slate-950/60 border-white/10 text-white"
            />
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 pl-1">Encuesta Asociada *</label>
              <select
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950/60 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id} className="bg-slate-900">{t.title}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <Input
                id="cDesc"
                label="Descripción"
                placeholder="Detalles sobre el alcance o grupo objetivo..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="bg-slate-950/60 border-white/10 text-white"
              />
            </div>

            <div className="md:col-span-2 bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-3">
              <input
                type="checkbox"
                id="verifiedOnly"
                checked={verifiedChannelsOnly}
                onChange={e => setVerifiedChannelsOnly(e.target.checked)}
                className="w-4 h-4 text-blue-500 bg-slate-950 border-white/10 rounded focus:ring-blue-500/20 cursor-pointer"
              />
              <label htmlFor="verifiedOnly" className="text-xs font-semibold text-slate-200 cursor-pointer">
                Enviar campaña únicamente a afiliados con <span className="text-teal-400 font-bold">Celular / Email Verificados (2FA OTP)</span>
                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Garantiza un 0% de tasa de rebote en notificaciones críticas y recordatorios sanitarios.</span>
              </label>
            </div>
          </div>

          {/* Action Triggers Rules */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-400" /> Disparadores de Acciones Automáticas
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Reglas que se ejecutan automáticamente al recibir las respuestas del paciente.</p>
              </div>
              <button
                type="button"
                onClick={handleAddActionRule}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 transition-all"
              >
                <Plus size={14} /> Agregar Regla
              </button>
            </div>

            {actions.map((act, idx) => (
              <div key={idx} className="p-4 bg-slate-950/40 border border-white/5 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Si la Pregunta</label>
                  <select
                    value={act.questionId}
                    onChange={e => handleActionChange(idx, 'questionId', e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-xs"
                  >
                    {selectedTemplate?.questions?.map(q => (
                      <option key={q.id} value={q.id} className="bg-slate-900">{q.text}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Condición</label>
                  <div className="flex gap-2 mt-1">
                    <select
                      value={act.conditionOperator}
                      onChange={e => handleActionChange(idx, 'conditionOperator', e.target.value)}
                      className="px-2 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-xs"
                    >
                      <option value="equals">Es igual a</option>
                      <option value="greater_than">Es mayor a</option>
                      <option value="less_than">Es menor a</option>
                      <option value="contains">Contiene</option>
                    </select>
                    <input
                      type="text"
                      value={act.conditionValue}
                      onChange={e => handleActionChange(idx, 'conditionValue', e.target.value)}
                      className="w-20 px-2 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Disparar Acción</label>
                  <select
                    value={act.actionType}
                    onChange={e => handleActionChange(idx, 'actionType', e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-xs"
                  >
                    <option value="medical_alert">⚠️ Alerta Médica Prioritaria</option>
                    <option value="recommend_appointment">🩺 Invitación a Turno Preventivo</option>
                    <option value="tag_risk_group">🏷️ Etiquetar Grupo de Riesgo</option>
                  </select>
                </div>

                <div className="flex justify-end pt-4 md:pt-0">
                  <button
                    type="button"
                    onClick={() => handleRemoveActionRule(idx)}
                    className="text-slate-500 hover:text-red-400 p-2"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-8 py-4 rounded-xl flex items-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>Crear Campaña (Borrador)</span>
            </Button>
          </div>
        </form>
      )}

      {/* Campaigns List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-1">Campañas Registradas</h3>
        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando campañas...</div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/20 border border-dashed border-white/10 rounded-3xl text-slate-500">
            No hay campañas registradas. Hacé clic en "Nueva Campaña" para iniciar un censo.
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map(c => (
              <div key={c.id} className="p-6 bg-slate-900/40 border border-white/5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-blue-500/20 transition-all">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${
                      c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      c.status === 'completed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {c.status === 'active' ? '● Activa' : c.status === 'completed' ? 'Finalizada' : 'Borrador'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">Encuesta: {c.templateTitle}</span>
                  </div>
                  <h4 className="text-xl font-bold text-white tracking-tight">{c.title}</h4>
                  {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                </div>

                <div className="flex items-center gap-4">
                  {c.status === 'draft' && (
                    <button
                      onClick={() => handleActivateCampaign(c.id)}
                      className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
                    >
                      <Play size={14} /> Activar Campaña
                    </button>
                  )}
                  {c.status === 'active' && (
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-4 py-3 rounded-xl border border-emerald-500/20">
                      <CheckCircle2 size={16} /> En Progreso
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Campaigns;
