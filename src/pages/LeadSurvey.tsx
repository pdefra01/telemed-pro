import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, DollarSign, Loader2, MessageCircle, Sparkles } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { leadSurveyRepository } from '../repositories/LeadSurveyRepository';
import logoMedinex from '../logo_medinex.jpeg';

// Glass Container — same visual family as AdhesionForm's GlassCard.
const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl ${className}`}>
    {children}
  </div>
);

const PAIN_POINT_OPTIONS = [
  'Esperar mucho tiempo',
  'No conseguir turno',
  'Tener que trasladarte',
  'Perder horas de trabajo',
];

const WHO_GETS_SICK_OPTIONS = ['Los niños', 'Los adultos', 'Ambos'];

const OptionGrid: React.FC<{
  options: string[];
  value: string;
  onChange: (value: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {options.map((opt) => (
      <button
        type="button"
        key={opt}
        onClick={() => onChange(opt)}
        className={`text-left border rounded-2xl p-4 text-sm font-semibold transition-all cursor-pointer ${
          value === opt
            ? 'border-emerald-400 bg-emerald-500/10 text-white shadow-[0_0_15px_rgba(16,185,129,0.1)]'
            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
      >
        {opt}
      </button>
    ))}
  </div>
);

const YesNoToggle: React.FC<{ value: boolean | null; onChange: (value: boolean) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 gap-3">
    {[{ label: 'Sí', val: true }, { label: 'No', val: false }].map(({ label, val }) => (
      <button
        type="button"
        key={label}
        onClick={() => onChange(val)}
        className={`text-center border rounded-2xl p-4 text-sm font-bold transition-all cursor-pointer ${
          value === val
            ? 'border-emerald-400 bg-emerald-500/10 text-white shadow-[0_0_15px_rgba(16,185,129,0.1)]'
            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

export const LeadSurvey: React.FC = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const promoterCode = searchParams.get('promoter') || '';

  const [painPoint, setPainPoint] = useState('');
  const [whoGetsSickMore, setWhoGetsSickMore] = useState('');
  const [knewRemoteCare, setKnewRemoteCare] = useState<boolean | null>(null);
  const [interestedInEasierAccess, setInterestedInEasierAccess] = useState<boolean | null>(null);
  const [fairMonthlyValue, setFairMonthlyValue] = useState('');

  const [age, setAge] = useState('');
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [consentContact, setConsentContact] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!painPoint || !whoGetsSickMore || knewRemoteCare === null || interestedInEasierAccess === null) {
      toast('Por favor respondé todas las preguntas de la encuesta.', 'warning');
      return;
    }

    const monthlyValueNumber = Number(fairMonthlyValue);
    if (!fairMonthlyValue || Number.isNaN(monthlyValueNumber) || monthlyValueNumber <= 0) {
      toast('Ingresá un valor mensual válido.', 'warning');
      return;
    }

    if (!fullName.trim() || !whatsapp.trim()) {
      toast('Completá tu nombre y WhatsApp para poder contactarte.', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      await leadSurveyRepository.submitResponse({
        promoterCode: promoterCode || undefined,
        fullName: fullName.trim(),
        age: age ? Number(age) : undefined,
        whatsapp: whatsapp.trim(),
        painPoint,
        whoGetsSickMore,
        knewRemoteCare,
        interestedInEasierAccess,
        fairMonthlyValue: monthlyValueNumber,
        consentContact,
      });
      setSubmitted(true);
      toast('¡Gracias por tu opinión!', 'success');
    } catch (err: any) {
      toast(err.message || 'Error al enviar la encuesta. Reintentá.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 relative">
      {/* Ambient background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[130px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-500/10 blur-[130px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-3xl mx-auto px-6 py-8 flex items-center gap-3">
        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center p-1.5 shadow-xl border border-white/10">
          <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="font-extrabold text-2xl tracking-[0.05em] bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            MED<span className="text-[#0dbda9]">IN</span>EX
          </h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-bold">Encuesta de Opinión</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10 w-full max-w-3xl mx-auto px-6 py-8 flex items-center justify-center">
        {!submitted ? (
          <GlassCard className="w-full animate-in fade-in zoom-in duration-300">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-2">¿Podés ayudarnos con tu opinión?</h2>
            <p className="text-slate-400 text-sm mb-8">Sólo te llevará 30 segundos.</p>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Q1 */}
              <div>
                <label className="block text-slate-200 text-sm font-bold mb-3">
                  1. Cuando necesitás una atención médica, ¿qué es lo que más te agobia del proceso?
                </label>
                <OptionGrid options={PAIN_POINT_OPTIONS} value={painPoint} onChange={setPainPoint} />
              </div>

              {/* Q2 */}
              <div>
                <label className="block text-slate-200 text-sm font-bold mb-3">
                  2. En tu casa, ¿quiénes se suelen enfermar más?
                </label>
                <OptionGrid options={WHO_GETS_SICK_OPTIONS} value={whoGetsSickMore} onChange={setWhoGetsSickMore} />
              </div>

              {/* Q3 */}
              <div>
                <label className="block text-slate-200 text-sm font-bold mb-3">
                  3. ¿Sabías que es posible recibir atención médica desde el celular?
                </label>
                <YesNoToggle value={knewRemoteCare} onChange={setKnewRemoteCare} />
              </div>

              {/* Q4 */}
              <div>
                <label className="block text-slate-200 text-sm font-bold mb-3">
                  4. ¿Te gustaría conocer una forma más simple de acceder a un médico?
                </label>
                <YesNoToggle value={interestedInEasierAccess} onChange={setInterestedInEasierAccess} />
              </div>

              {/* Q5 */}
              <div>
                <label className="block text-slate-200 text-sm font-bold mb-3">
                  5. Imaginá que existe un servicio que te brinda la tranquilidad de contar con orientación médica
                  para vos y tu familia cuando la necesites, sin largas esperas ni traslados innecesarios. ¿Qué
                  valor mensual considerarías justo para contar con ese servicio?
                </label>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 focus-within:border-emerald-400/50 transition-colors">
                  <DollarSign size={18} className="text-emerald-400 flex-shrink-0" />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="Ej: 15000"
                    className="w-full bg-transparent text-sm text-white focus:outline-none"
                    value={fairMonthlyValue}
                    onChange={(e) => setFairMonthlyValue(e.target.value)}
                  />
                </div>
              </div>

              {/* Tus Datos */}
              <div className="bg-slate-900/40 border border-white/5 p-6 rounded-3xl space-y-4">
                <h3 className="text-lg font-bold text-white">Tus Datos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Edad</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Años"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Nombre y Apellido *</label>
                    <input
                      type="text"
                      placeholder="Ej: Juan Pérez"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">WhatsApp *</label>
                    <input
                      type="tel"
                      placeholder="Ej: 3416123456"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer text-slate-300 text-xs select-none pt-2">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border border-white/20 bg-white/5 text-emerald-400 focus:ring-0 mt-0.5"
                    checked={consentContact}
                    onChange={(e) => setConsentContact(e.target.checked)}
                  />
                  <span>
                    Autorizo a recibir información, novedades y beneficios sobre el servicio a través de WhatsApp u
                    otros medios de contacto.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/30 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Enviar Respuestas
                    <CheckCircle2 size={18} />
                  </>
                )}
              </button>
            </form>
          </GlassCard>
        ) : (
          <GlassCard className="w-full text-center py-12 animate-in fade-in zoom-in duration-500 max-w-xl mx-auto">
            <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-[2rem] flex items-center justify-center text-emerald-400 mx-auto mb-8 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
              <CheckCircle2 size={40} className="stroke-[2.5]" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-4">¡Muchas gracias!</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-md mx-auto">
              Recibimos tus respuestas. Si nos dejaste tu WhatsApp, pronto un asesor se va a poner en contacto para
              contarte más sobre el servicio.
            </p>
            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 text-left flex items-start gap-3">
              <MessageCircle size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300 leading-relaxed flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-400 flex-shrink-0" />
                ¡Gracias por ayudarnos a mejorar!
              </p>
            </div>
          </GlassCard>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-3xl mx-auto px-6 py-6 text-center text-xs text-slate-600 border-t border-white/5 mt-8">
        <p>© 2026 MEDINEX. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
};

export default LeadSurvey;
