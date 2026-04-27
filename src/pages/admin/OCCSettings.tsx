import React, { useState, useEffect } from 'react';
import { 
  Percent, Plus, Trash2, Save, 
  AlertTriangle, Globe, MapPin, 
  CheckCircle2, XCircle, ShieldAlert,
  Clock, ShieldX, Settings2
} from 'lucide-react';
import { taxRepository } from '../../repositories/TaxRepository';
import { systemSettingsRepository } from '../../repositories/SystemSettingsRepository';
import { useToast } from '../../context/ToastContext';
import { TaxConfiguration } from '../../types';

const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 ${className}`}>
    {children}
  </div>
);

const OCCSettings: React.FC = () => {
  const { toast } = useToast();
  const [taxes, setTaxes] = useState<TaxConfiguration[]>([]);
  const [delinquencyPolicy, setDelinquencyPolicy] = useState<'block' | 'grace_period'>('grace_period');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [taxesData, policy] = await Promise.all([
          taxRepository.getAll(),
          systemSettingsRepository.getByKey('delinquency_policy')
        ]);
        setTaxes(taxesData);
        if (policy) setDelinquencyPolicy(policy);
      } catch (error) {
        console.error("Error loading settings", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleToggleActive = async (tax: TaxConfiguration) => {
    try {
      const updated = await taxRepository.update(tax.id, { isActive: !tax.isActive });
      setTaxes(taxes.map(t => t.id === tax.id ? updated : t));
      toast(`${tax.name} ${updated.isActive ? 'activado' : 'desactivado'}`, 'success');
    } catch (error) {
      toast("Error al actualizar impuesto", 'error');
    }
  };

  const handlePolicyChange = async (newPolicy: 'block' | 'grace_period') => {
    try {
      await systemSettingsRepository.update('delinquency_policy', newPolicy);
      setDelinquencyPolicy(newPolicy);
      toast(`Política de morosidad: ${newPolicy === 'block' ? 'Bloqueo Inmediato' : 'Periodo de Gracia'}`, 'success');
    } catch (error) {
      toast("Error al actualizar política", 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-blue-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">System Config</h2>
          <h1 className="text-4xl font-black text-white tracking-tighter">
            OCC <span className="text-slate-500 font-light italic">Settings</span> Center
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Policy Section */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center">
            <ShieldAlert size={20} className="mr-2 text-rose-500" />
            Políticas de Acceso
          </h3>
          <GlassCard className="p-6">
            <p className="text-slate-400 text-sm mb-6 italic">
              Define el comportamiento del sistema ante la falta de pago de los afiliados.
            </p>
            
            <div className="space-y-4">
              <button 
                onClick={() => handlePolicyChange('grace_period')}
                className={`w-full flex items-center p-4 rounded-2xl border transition-all duration-300 ${
                  delinquencyPolicy === 'grace_period' 
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                <div className={`p-2 rounded-xl mr-4 ${delinquencyPolicy === 'grace_period' ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
                  <Clock size={20} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Periodo de Gracia</p>
                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Permitir acceso limitado</p>
                </div>
                {delinquencyPolicy === 'grace_period' && <CheckCircle2 size={18} className="ml-auto" />}
              </button>

              <button 
                onClick={() => handlePolicyChange('block')}
                className={`w-full flex items-center p-4 rounded-2xl border transition-all duration-300 ${
                  delinquencyPolicy === 'block' 
                    ? 'bg-rose-500/10 border-rose-500/50 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]' 
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                <div className={`p-2 rounded-xl mr-4 ${delinquencyPolicy === 'block' ? 'bg-rose-500/20' : 'bg-white/5'}`}>
                  <ShieldX size={20} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Bloqueo Inmediato</p>
                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Restringir acceso total</p>
                </div>
                {delinquencyPolicy === 'block' && <CheckCircle2 size={18} className="ml-auto" />}
              </button>
            </div>
          </GlassCard>

          <GlassCard className="p-6 bg-blue-500/5 border-blue-500/20">
            <h4 className="text-sm font-bold text-blue-400 mb-2">Detección Automática</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              El motor de facturación (Billing Engine) escanea diariamente los estados de pago y aplica estas políticas en tiempo real sobre el `planStatus` de cada perfil.
            </p>
          </GlassCard>
        </div>

        {/* Tax Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white flex items-center">
              <Percent size={20} className="mr-2 text-amber-500" />
              Impuestos y Alícuotas
            </h3>
            <button className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition-colors">
              <Plus size={14} />
              <span>Añadir</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <GlassCard key={i} className="h-24 animate-pulse" />
              ))
            ) : taxes.map((tax) => (
              <GlassCard key={tax.id} className={`p-5 border-l-4 ${tax.isActive ? 'border-l-emerald-500' : 'border-l-slate-700'}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-xl ${tax.scope === 'national' ? 'bg-blue-500/10 text-blue-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                      {tax.scope === 'national' ? <Globe size={18} /> : <MapPin size={18} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase">{tax.name}</h4>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{tax.scope}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-lg font-black text-white">{tax.rate}%</p>
                    </div>
                    <button 
                      onClick={() => handleToggleActive(tax)}
                      className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${tax.isActive ? 'bg-emerald-500' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${tax.isActive ? 'left-5.5' : 'left-0.5'}`}></div>
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          <GlassCard className="p-8 bg-amber-500/5 border-amber-500/20">
            <div className="flex items-start space-x-4">
              <AlertTriangle className="text-amber-500 flex-shrink-0" size={24} />
              <div>
                <h4 className="text-lg font-bold text-amber-400 mb-1">Impacto Fiscal Consolidado</h4>
                <p className="text-sm text-slate-400 mb-4">
                  La carga impositiva actual detectada es del <span className="text-white font-black">{taxes.filter(t => t.isActive).reduce((acc, curr) => acc + curr.rate, 0)}%</span>.
                </p>
                <div className="flex space-x-4">
                  <div className="flex items-center text-[10px] font-bold text-slate-500 uppercase">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                    IVA (Nacional)
                  </div>
                  <div className="flex items-center text-[10px] font-bold text-slate-500 uppercase">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>
                    IIBB (Local)
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default OCCSettings;
