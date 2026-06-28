import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, Trash2, CheckCircle2, AlertCircle, 
  HelpCircle, ListPlus, ToggleLeft, Hash, AlignLeft, Loader2, Save
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SurveyTemplate, QuestionType } from '../../types';
import { surveyRepository } from '../../repositories/SurveyRepository';

interface NewQuestion {
  text: string;
  type: QuestionType;
  options: string[];
  isRequired: boolean;
}

export const SurveyBuilder: React.FC = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<NewQuestion[]>([
    { text: '', type: 'single_choice', options: ['Sí', 'No'], isRequired: true }
  ]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await surveyRepository.getAllTemplates();
      setTemplates(data);
    } catch (err) {
      console.error(err);
      toast('Error al cargar plantillas de encuestas', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleAddQuestion = () => {
    setQuestions([...questions, { text: '', type: 'single_choice', options: ['Opción 1', 'Opción 2'], isRequired: true }]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length === 1) {
      toast('La encuesta debe tener al menos una pregunta', 'warning');
      return;
    }
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, field: keyof NewQuestion, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const handleAddOption = (qIndex: number) => {
    const updated = [...questions];
    updated[qIndex].options.push(`Opción ${updated[qIndex].options.length + 1}`);
    setQuestions(updated);
  };

  const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
  };

  const handleRemoveOption = (qIndex: number, oIndex: number) => {
    const updated = [...questions];
    if (updated[qIndex].options.length <= 2) {
      toast('Se requieren al menos 2 opciones', 'warning');
      return;
    }
    updated[qIndex].options = updated[qIndex].options.filter((_, i) => i !== oIndex);
    setQuestions(updated);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast('Ingresá el título de la encuesta', 'error');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].text.trim()) {
        toast(`La pregunta #${i + 1} no tiene texto`, 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      await surveyRepository.createTemplate(
        title.trim(),
        description.trim(),
        questions.map(q => ({
          text: q.text.trim(),
          type: q.type,
          options: ['single_choice', 'multiple_choice'].includes(q.type) ? q.options : undefined,
          isRequired: q.isRequired,
          orderIndex: 0
        }))
      );
      toast('Plantilla de encuesta creada con éxito', 'success');
      setTitle('');
      setDescription('');
      setQuestions([{ text: '', type: 'single_choice', options: ['Sí', 'No'], isRequired: true }]);
      setShowForm(false);
      fetchTemplates();
    } catch (err) {
      console.error(err);
      toast('Error al guardar la plantilla', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar esta plantilla de encuesta?')) return;
    try {
      await surveyRepository.deleteTemplate(id);
      toast('Plantilla eliminada', 'success');
      fetchTemplates();
    } catch (err) {
      console.error(err);
      toast('Error al eliminar la plantilla', 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <FileText size={20} />
            </div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.25em]">Censos Epidemiológicos</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Diseñador de Encuestas</h1>
          <p className="text-slate-400 text-sm mt-1">Creá plantillas de cuestionarios para censar patologías crónicas.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="relative z-10 px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus size={18} />
          <span>{showForm ? 'Cancelar' : 'Nueva Encuesta'}</span>
        </button>
      </div>

      {/* Form Editor */}
      {showForm && (
        <form onSubmit={handleSaveTemplate} className="bg-slate-900/60 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-emerald-500/30 shadow-3xl space-y-8 animate-in slide-in-from-top duration-300">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <ListPlus size={22} className="text-emerald-400" />
            Configuración de la Encuesta
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              id="title"
              label="Título de la Encuesta *"
              placeholder="Ej: Censo de Diabetes e Hipertensión 2026"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="bg-slate-950/60 border-white/10 text-white"
            />
            <Input
              id="description"
              label="Descripción / Objetivo"
              placeholder="Ej: Relevamiento anual para detección de factores de riesgo..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-slate-950/60 border-white/10 text-white"
            />
          </div>

          {/* Questions list */}
          <div className="space-y-6 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Preguntas de la Encuesta ({questions.length})</h4>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 transition-all"
              >
                <Plus size={14} /> Agregar Pregunta
              </button>
            </div>

            {questions.map((q, qIdx) => (
              <div key={qIdx} className="p-6 bg-slate-950/40 border border-white/5 rounded-2xl space-y-4 relative group">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-lg">
                    Pregunta #{qIdx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(qIdx)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-2"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 pl-1">Enunciado de la Pregunta *</label>
                    <input
                      type="text"
                      placeholder="Ej: ¿Presenta antecedentes de hipertensión arterial en su familia?"
                      value={q.text}
                      onChange={e => handleQuestionChange(qIdx, 'text', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 pl-1">Tipo de Respuesta</label>
                    <select
                      value={q.type}
                      onChange={e => handleQuestionChange(qIdx, 'type', e.target.value as QuestionType)}
                      className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="single_choice">Opción Única</option>
                      <option value="multiple_choice">Opción Múltiple</option>
                      <option value="boolean">Sí / No</option>
                      <option value="numeric">Valor Numérico</option>
                      <option value="text">Texto Libre</option>
                    </select>
                  </div>
                </div>

                {/* Options config for choice questions */}
                {['single_choice', 'multiple_choice'].includes(q.type) && (
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Opciones de Respuesta</label>
                    <div className="space-y-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={e => handleOptionChange(qIdx, oIdx, e.target.value)}
                            className="flex-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(qIdx, oIdx)}
                            className="text-slate-600 hover:text-red-400 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleAddOption(qIdx)}
                        className="text-xs text-emerald-400 font-bold hover:underline flex items-center gap-1 pt-1"
                      >
                        <Plus size={12} /> Agregar Opción
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-4 rounded-xl flex items-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>Guardar Encuesta</span>
            </Button>
          </div>
        </form>
      )}

      {/* Templates List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-1">Plantillas Existentes</h3>
        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando encuestas...</div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/20 border border-dashed border-white/10 rounded-3xl text-slate-500">
            No hay encuestas diseñadas aún. Hacé clic en "Nueva Encuesta" para crear la primera.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map(t => (
              <div key={t.id} className="p-6 bg-slate-900/40 border border-white/5 hover:border-emerald-500/20 rounded-3xl space-y-4 transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">{t.title}</h4>
                    {t.description && <p className="text-xs text-slate-400 mt-1">{t.description}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteTemplate(t.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors p-2"
                    title="Eliminar encuesta"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-white/5">
                  <span>{t.questions?.length || 0} Preguntas</span>
                  <span>Creada: {new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SurveyBuilder;
