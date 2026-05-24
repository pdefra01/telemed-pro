import React, { useState, useEffect } from 'react';
import { Shield, Camera, Mic, Wifi, Activity, CheckCircle2, Lock } from 'lucide-react';

interface WaitingExperienceProps {
  patientName: string;
  onReady: () => void;
  onCancel?: () => void;
}

export const WaitingExperience: React.FC<WaitingExperienceProps> = ({ patientName, onReady, onCancel }) => {
  const [steps, setSteps] = useState([
    { id: 'perms', label: 'Verificando Permisos Biométricos', status: 'loading', icon: Shield },
    { id: 'media', label: 'Sincronizando Cámara y Micrófono', status: 'pending', icon: Camera },
    { id: 'network', label: 'Optimizando Túnel de Red', status: 'pending', icon: Wifi },
    { id: 'encryption', label: 'Estableciendo Cifrado de Punto a Punto', status: 'pending', icon: Lock },
  ]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (currentStepIndex < steps.length) {
      const timer = setTimeout(() => {
        setSteps(prev => prev.map((step, idx) => {
          if (idx === currentStepIndex) return { ...step, status: 'complete' };
          if (idx === currentStepIndex + 1) return { ...step, status: 'loading' };
          return step;
        }));
        setCurrentStepIndex(prev => prev + 1);
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      const finalTimer = setTimeout(onReady, 800);
      return () => clearTimeout(finalTimer);
    }
  }, [currentStepIndex, steps.length, onReady]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
            <Shield size={14} className="text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">Protocolo de Seguridad Activo</span>
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Hola, {patientName}</h2>
          <p className="text-slate-400 text-sm font-medium">Estamos preparando su sala de consulta privada.</p>
        </div>

        {/* Steps Container */}
        <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-6 group">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                step.status === 'complete' ? 'bg-emerald-500/20 text-emerald-500' : 
                step.status === 'loading' ? 'bg-teal-500/20 text-teal-400 scale-110 shadow-[0_0_20px_rgba(20,184,166,0.2)]' : 
                'bg-white/5 text-slate-600'
              }`}>
                <step.icon size={20} className={step.status === 'loading' ? 'animate-pulse' : ''} />
              </div>
              
              <div className="flex-1">
                <p className={`text-sm font-bold transition-colors duration-500 ${
                  step.status === 'complete' ? 'text-white' : 
                  step.status === 'loading' ? 'text-teal-400' : 
                  'text-slate-600'
                }`}>
                  {step.label}
                </p>
                <div className="h-1 w-full bg-white/5 rounded-full mt-2 overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ease-out ${
                    step.status === 'complete' ? 'w-full bg-emerald-500' : 
                    step.status === 'loading' ? 'w-1/2 bg-teal-500 animate-[shimmer_2s_infinite]' : 
                    'w-0'
                  }`}></div>
                </div>
              </div>

              {step.status === 'complete' && (
                <CheckCircle2 size={18} className="text-emerald-500 animate-in zoom-in duration-300" />
              )}
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="flex items-center gap-6 opacity-40">
             <Activity size={16} className="text-slate-400" />
             <div className="w-px h-4 bg-white/20"></div>
             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.4em]">MEDINEX Zen v1.0</span>
          </div>
          {onCancel && (
            <button 
              onClick={onCancel}
              className="text-slate-600 hover:text-emerald-400 transition-colors text-[10px] font-bold uppercase tracking-[0.25em] bg-white/5 border border-white/5 px-6 py-2.5 rounded-xl hover:bg-white/10 active:scale-95"
            >
              Cancelar y Volver
            </button>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}} />
    </div>
  );
};
