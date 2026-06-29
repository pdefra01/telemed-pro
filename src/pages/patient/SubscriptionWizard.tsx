import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { producerRepository } from '../../repositories/ProducerRepository';
import { subscriptionRepository } from '../../repositories/SubscriptionRepository';
import { Producer, LegalTerm } from '../../types';
import { 
  ShieldCheck, CheckCircle, ArrowRight, ArrowLeft, CreditCard, 
  FileText, UserCheck, Mail, Lock, Sparkles, AlertCircle, Loader2, Award
} from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const SubscriptionWizard: React.FC = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Selection
  const [selectedPlan, setSelectedPlan] = useState<'individual' | 'familiar' | 'premium'>('familiar');
  const [producerCodeInput, setProducerCodeInput] = useState<string>('PROD-101');
  const [boundProducer, setBoundProducer] = useState<Producer | null>(null);
  const [producerError, setProducerError] = useState<string>('');

  // Legal
  const [legalTerm, setLegalTerm] = useState<LegalTerm | null>(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean>(false);
  const [showLegalModal, setShowLegalModal] = useState<boolean>(false);

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [completedSuccess, setCompletedSuccess] = useState<boolean>(false);

  useEffect(() => {
    initWizard();
  }, []);

  const initWizard = async () => {
    setLoading(true);
    try {
      const term = await subscriptionRepository.getActiveLegalTerms();
      setLegalTerm(term);
      // Validar código inicial si existe
      if (producerCodeInput) {
        const prod = await producerRepository.getProducerByCode(producerCodeInput);
        if (prod) setBoundProducer(prod);
      }
    } catch (err) {
      console.error("Error al inicializar wizard:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateProducerCode = async () => {
    setProducerError('');
    if (!producerCodeInput.trim()) {
      setBoundProducer(null);
      return;
    }
    try {
      const prod = await producerRepository.getProducerByCode(producerCodeInput);
      if (prod) {
        setBoundProducer(prod);
      } else {
        setBoundProducer(null);
        setProducerError('Código de asesor no encontrado. Se asignará ingreso directo.');
      }
    } catch (err) {
      setProducerError('Error al validar código.');
    }
  };

  const handleConfirmSubscription = async () => {
    if (!user || !hasAcceptedTerms || !legalTerm) return;
    setIsSubmitting(true);
    try {
      // 1. Registrar auditoría legal con IP y timestamp
      const ip = '190.210.45.12';
      await subscriptionRepository.recordLegalAcceptance(user.id, legalTerm.version, ip);

      // 2. Vincular productor y activar plan
      const planNames = {
        individual: 'MEDINEX Cobertura Individual',
        familiar: 'MEDINEX Cobertura Familiar Integral',
        premium: 'MEDINEX Platinum VIP'
      };
      await subscriptionRepository.completeSubscription(user.id, boundProducer?.id || null, planNames[selectedPlan]);

      setCompletedSuccess(true);
      setStep(3);
    } catch (err) {
      alert("Error al procesar la suscripción.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (completedSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-6 text-center space-y-6 animate-in zoom-in-95 duration-500">
        <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-3xl mx-auto flex items-center justify-center border border-emerald-500/30 shadow-2xl shadow-emerald-500/10">
          <CheckCircle size={44} />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-[0.3em]">¡Suscripción Confirmada!</span>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">¡Bienvenido a MEDINEX!</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Hemos enviado el **Contrato Digital y la Credencial Institucional** a tu correo electrónico verificado (<span className="text-white font-bold">{user?.email}</span>).
          </p>
        </div>

        <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/10 text-left space-y-3 max-w-md mx-auto">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Titular:</span>
            <span className="font-bold text-white">{user?.name}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Asesor Comercial:</span>
            <span className="font-bold text-teal-400">{boundProducer ? boundProducer.name : 'Ingreso Directo'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Auditoría Legal IP:</span>
            <span className="font-mono text-slate-300">190.210.45.12 • {new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        <button
          onClick={() => window.location.href = '/history'}
          className="px-8 py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-teal-500/20"
        >
          Ir a Mi Bóveda Médica
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-500">
      {/* Step Indicator */}
      <div className="flex justify-between items-center max-w-lg mx-auto relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -z-10" />
        
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs transition-all ${step >= 1 ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
          1
        </div>
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs transition-all ${step >= 2 ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
          2
        </div>
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs transition-all ${step >= 3 ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
          3
        </div>
      </div>

      {/* STEP 1: PLAN Y ASESOR */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Elegí tu Plan y Vinculá a tu Asesor</h1>
            <p className="text-xs text-slate-400">Seleccioná la cobertura adecuada para vos y tu grupo familiar.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              onClick={() => setSelectedPlan('individual')}
              className={`p-6 rounded-3xl border transition-all duration-300 cursor-pointer space-y-4 relative ${
                selectedPlan === 'individual' ? 'bg-teal-500/10 border-teal-500 shadow-2xl shadow-teal-500/10' : 'bg-slate-900/40 border-white/5 hover:border-white/20'
              }`}
            >
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block">Plan Personal</span>
              <h3 className="text-xl font-bold text-white">Individual</h3>
              <div className="text-2xl font-extrabold font-mono text-white">$ 25.000 <span className="text-xs text-slate-500 font-normal">/mes</span></div>
              <p className="text-xs text-slate-400">Consultas digitales ilimitadas 24/7 y vademécum en red.</p>
            </div>

            <div 
              onClick={() => setSelectedPlan('familiar')}
              className={`p-6 rounded-3xl border transition-all duration-300 cursor-pointer space-y-4 relative ${
                selectedPlan === 'familiar' ? 'bg-teal-500/10 border-teal-500 shadow-2xl shadow-teal-500/10' : 'bg-slate-900/40 border-white/5 hover:border-white/20'
              }`}
            >
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block">Recomendado</span>
              <h3 className="text-xl font-bold text-white">Familiar Integral</h3>
              <div className="text-2xl font-extrabold font-mono text-white">$ 48.000 <span className="text-xs text-slate-500 font-normal">/mes</span></div>
              <p className="text-xs text-slate-400">Titular + 4 dependientes cubiertos sin copago en guardia.</p>
            </div>

            <div 
              onClick={() => setSelectedPlan('premium')}
              className={`p-6 rounded-3xl border transition-all duration-300 cursor-pointer space-y-4 relative ${
                selectedPlan === 'premium' ? 'bg-teal-500/10 border-teal-500 shadow-2xl shadow-teal-500/10' : 'bg-slate-900/40 border-white/5 hover:border-white/20'
              }`}
            >
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block">Exclusivo</span>
              <h3 className="text-xl font-bold text-white">Platinum VIP</h3>
              <div className="text-2xl font-extrabold font-mono text-white">$ 85.000 <span className="text-xs text-slate-500 font-normal">/mes</span></div>
              <p className="text-xs text-slate-400">Atención preferencial sin espera y reintegros institucionales.</p>
            </div>
          </div>

          {/* Código de Productor */}
          <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 space-y-4 max-w-xl mx-auto backdrop-blur-xl">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <UserCheck size={16} className="text-teal-400" /> Código de Asesor / Productor Comercial
            </h4>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Ej. PROD-101"
                value={producerCodeInput}
                onChange={e => setProducerCodeInput(e.target.value.toUpperCase())}
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none"
              />
              <button
                onClick={handleValidateProducerCode}
                className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-all"
              >
                Validar
              </button>
            </div>
            {boundProducer && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle size={16} />
                <span>Asesor Asignado: <strong>{boundProducer.name}</strong> ({boundProducer.producerCode})</span>
              </div>
            )}
            {producerError && (
              <div className="text-amber-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{producerError}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setStep(2)}
              className="px-8 py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2"
            >
              Siguiente: Aceptación Legal <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: ACEPACIÓN LEGAL T&C Y CONFIRMACIÓN */}
      {step === 2 && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Condiciones del Servicio & Auditoría Legal</h2>
            <p className="text-xs text-slate-400">Revise y acepte las condiciones institucionales antes de activar su plan.</p>
          </div>

          <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/10 space-y-4 backdrop-blur-xl">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-teal-400" />
                <span className="text-xs font-bold text-white">{legalTerm?.title || 'Términos y Condiciones v2.0'}</span>
              </div>
              <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-full border border-teal-500/20">
                Versión {legalTerm?.version || 'v2.0-2026'}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto pr-2 custom-scrollbar text-xs text-slate-300 space-y-3 bg-slate-950/50 p-4 rounded-2xl border border-white/5 font-sans leading-relaxed">
              <p><strong>1. Objeto del Contrato:</strong> MEDINEX brinda cobertura asistencial médica digital y presencial para el titular y su grupo familiar designado.</p>
              <p><strong>2. Auditoría Criptográfica:</strong> Las recetas y órdenes médicas emitidas cuentan con firma electrónica avanzada basada en certificados ECDSA.</p>
              <p><strong>3. Secreto Médico y Datos:</strong> La información clínica queda resguardada bajo los estándares internacionales HIPAA y secreto profesional.</p>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAcceptedTerms}
                  onChange={e => setHasAcceptedTerms(e.target.checked)}
                  className="w-5 h-5 rounded-lg bg-slate-950 border-white/20 text-teal-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-xs text-slate-200">
                  Acepto expresamente los Términos y Condiciones del Servicio en representación de mi grupo familiar.
                </span>
              </label>
            </div>
          </div>

          <div className="bg-slate-900/40 p-5 rounded-2xl border border-white/5 space-y-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Correo de Notificación Verificado:</span>
              <span className="text-white font-bold">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span>Asesor de Venta:</span>
              <span className="text-teal-400 font-bold">{boundProducer ? boundProducer.name : 'Asignación Directa'}</span>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs rounded-2xl transition-all flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Volver
            </button>
            <button
              onClick={handleConfirmSubscription}
              disabled={!hasAcceptedTerms || isSubmitting}
              className={`px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 ${
                !hasAcceptedTerms ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 cursor-pointer'
              }`}
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
              Confirmar & Activar Cobertura
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionWizard;
