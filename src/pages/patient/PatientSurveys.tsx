import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FileText, ArrowLeft, CheckCircle2, AlertCircle, 
  Send, Loader2, Calendar, ClipboardList, HelpCircle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Patient, CampaignAssignment, SurveyTemplate } from '../../types';
import { campaignRepository } from '../../repositories/CampaignRepository';
import { surveyRepository } from '../../repositories/SurveyRepository';

interface Props {
  user: Patient;
}

type PendingItem = CampaignAssignment & { campaignTitle: string; templateId: string };

export const PatientSurveys: React.FC<Props> = ({ user }) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [pendingAssignments, setPendingAssignments] = useState<PendingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active survey responder state
  const [selectedAssignment, setSelectedAssignment] = useState<PendingItem | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<SurveyTemplate | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPending = async () => {
    setIsLoading(true);
    try {
      const data = await campaignRepository.getMyPendingAssignments(user.id);
      setPendingAssignments(data);
    } catch (err) {
      console.error(err);
      toast('Error al cargar encuestas pendientes', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, [user.id]);

  const handleStartSurvey = async (item: PendingItem) => {
    setSelectedAssignment(item);
    setIsLoading(true);
    try {
      const template = await surveyRepository.getTemplateById(item.templateId);
      setActiveTemplate(template);
      // Init empty responses
      const initResp: Record<string, string> = {};
      template.questions?.forEach(q => {
        initResp[q.id] = q.type === 'boolean' ? 'No' : '';
      });
      setResponses(initResp);
    } catch (err) {
      console.error(err);
      toast('Error al cargar las preguntas de la encuesta', 'error');
      setSelectedAssignment(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResponseChange = (questionId: string, value: string) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !activeTemplate) return;

    // Validate required questions
    for (const q of activeTemplate.questions || []) {
      if (q.isRequired && (!responses[q.id] || !responses[q.id].trim())) {
        toast(`Por favor completá la pregunta: "${q.text}"`, 'warning');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = Object.entries(responses).map(([questionId, responseValue]) => ({
        questionId,
        responseValue
      }));

      await surveyRepository.submitSurveyResponses(
        selectedAssignment.id,
        selectedAssignment.campaignId,
        user.id,
        payload
      );

      toast('¡Gracias por responder el censo de salud!', 'success');
      setSelectedAssignment(null);
      setActiveTemplate(null);
      fetchPending();
    } catch (err) {
      console.error(err);
      toast('Error al enviar las respuestas', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 sm:p-6 md:p-8 space-y-8 relative overflow-hidden pb-20 max-w-4xl mx-auto">
      {/* Background Decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 space-y-8">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link
            to="/"
            className="w-12 h-12 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl flex items-center justify-center transition-all flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-1">Prevención & Salud</h2>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Censos Epidemiológicos</h1>
          </div>
        </div>

        {/* Survey Responder View */}
        {selectedAssignment && activeTemplate ? (
          <form onSubmit={handleSubmit} className="bg-slate-900/40 backdrop-blur-3xl border border-emerald-500/30 rounded-[2.5rem] p-6 sm:p-10 shadow-3xl space-y-8 animate-in fade-in duration-300">
            <div className="border-b border-white/10 pb-6">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                Respondiendo Censo
              </span>
              <h2 className="text-2xl font-bold text-white mt-3">{selectedAssignment.campaignTitle}</h2>
              {activeTemplate.description && <p className="text-sm text-slate-400 mt-1">{activeTemplate.description}</p>}
            </div>

            {/* Questions List */}
            <div className="space-y-8">
              {activeTemplate.questions?.map((q, idx) => (
                <div key={q.id} className="p-6 bg-black/20 border border-white/5 rounded-2xl space-y-4">
                  <label className="block text-base font-bold text-white">
                    <span className="text-emerald-400 mr-2">#{idx + 1}</span>
                    {q.text} {q.isRequired && <span className="text-red-400">*</span>}
                  </label>

                  {/* Question Inputs by Type */}
                  {q.type === 'single_choice' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {q.options?.map(opt => (
                        <label
                          key={opt}
                          className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                            responses[q.id] === opt
                              ? 'bg-emerald-500/20 border-emerald-500 text-white font-bold'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            value={opt}
                            checked={responses[q.id] === opt}
                            onChange={() => handleResponseChange(q.id, opt)}
                            className="hidden"
                          />
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${responses[q.id] === opt ? 'border-emerald-400 bg-emerald-400' : 'border-slate-500'}`}>
                            {responses[q.id] === opt && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                          </div>
                          <span className="text-sm">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'boolean' && (
                    <div className="flex gap-4 pt-2">
                      {['Sí', 'No'].map(opt => (
                        <button
                          type="button"
                          key={opt}
                          onClick={() => handleResponseChange(q.id, opt)}
                          className={`flex-1 py-3.5 rounded-xl font-bold text-sm border transition-all ${
                            responses[q.id] === opt
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === 'numeric' && (
                    <input
                      type="number"
                      placeholder="Ingrese valor numérico..."
                      value={responses[q.id] || ''}
                      onChange={e => handleResponseChange(q.id, e.target.value)}
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  )}

                  {q.type === 'text' && (
                    <textarea
                      rows={3}
                      placeholder="Escriba su respuesta detallada..."
                      value={responses[q.id] || ''}
                      onChange={e => handleResponseChange(q.id, e.target.value)}
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 resize-none"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSelectedAssignment(null)}
                className="px-6 py-3.5 text-slate-400 font-bold hover:text-white transition-colors text-sm"
              >
                Cancelar
              </button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-4 rounded-2xl flex items-center gap-2 shadow-xl shadow-emerald-500/20 cursor-pointer"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                <span>Enviar Censo</span>
              </Button>
            </div>
          </form>
        ) : (
          /* Assignments Pending List */
          <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-6 sm:p-10 shadow-3xl space-y-6">
            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <ClipboardList size={22} className="text-emerald-400" /> Censos Pendientes
            </h3>

            {isLoading ? (
              <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <Loader2 size={24} className="animate-spin text-emerald-500" />
                <span>Buscando censos asignados...</span>
              </div>
            ) : pendingAssignments.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-950/20 space-y-3">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 size={28} />
                </div>
                <p className="text-white font-bold text-lg">¡Estás al día!</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">No tenés censos o encuestas de salud pendientes en este momento.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingAssignments.map(item => (
                  <div key={item.id} className="p-6 bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all group">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full">
                        Requerido
                      </span>
                      <h4 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors pt-1">{item.campaignTitle}</h4>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar size={12} /> Asignado: {new Date(item.assignedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      onClick={() => handleStartSurvey(item)}
                      className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex-shrink-0"
                    >
                      <span>Responder Censo</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientSurveys;
