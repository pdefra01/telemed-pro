import React, { useState, useEffect } from 'react';
import { 
  Percent, Plus, Trash2, Save, 
  AlertTriangle, Globe, MapPin, 
  CheckCircle2, XCircle, ShieldAlert,
  Clock, ShieldX, Settings2
} from 'lucide-react';
import { taxRepository } from '../../repositories/TaxRepository';
import { systemSettingsRepository } from '../../repositories/SystemSettingsRepository';
import { officeLocationRepository } from '../../repositories/OfficeLocationRepository';
import { useToast } from '../../context/ToastContext';
import { TaxConfiguration, OfficeLocation } from '../../types';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTax, setNewTax] = useState({
    name: '',
    rate: 0,
    scope: 'local' as 'national' | 'local'
  });

  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [newOffice, setNewOffice] = useState({ name: '', latitude: 0, longitude: 0, radiusMeters: 150 });

  const [sessionPolicy, setSessionPolicy] = useState<{
    [role: string]: { timeoutMinutes: number; persistent: boolean };
  }>({
    admin: { timeoutMinutes: 15, persistent: false },
    doctor: { timeoutMinutes: 30, persistent: false },
    advisor: { timeoutMinutes: 30, persistent: false },
    patient: { timeoutMinutes: 0, persistent: true }
  });
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [taxesData, policy, officesData, sessionPolicyData] = await Promise.all([
          taxRepository.getAll(),
          systemSettingsRepository.getByKey('delinquency_policy'),
          officeLocationRepository.getAllOffices(),
          systemSettingsRepository.getByKey('session_security_policy')
        ]);
        setTaxes(taxesData);
        if (policy) setDelinquencyPolicy(policy);
        setOffices(officesData);
        if (sessionPolicyData) setSessionPolicy(sessionPolicyData);
      } catch (error) {
        console.error("Error loading settings", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSaveSessionPolicy = async () => {
    setIsSavingPolicy(true);
    try {
      await systemSettingsRepository.update('session_security_policy', sessionPolicy);
      const policyStr = JSON.stringify(sessionPolicy);
      localStorage.setItem('medinex_session_policy', policyStr);
      sessionStorage.setItem('medinex_session_policy', policyStr);
      toast("Políticas de sesión actualizadas correctamente", 'success');
    } catch (error) {
      toast("Error al actualizar políticas de sesión", 'error');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsDetectingLocation(true);
    setLocationError('');
    try {
      const { latitude, longitude } = await officeLocationRepository.getCurrentPosition();
      setNewOffice(prev => ({ ...prev, latitude, longitude }));
      toast(`Ubicación detectada: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, 'success');
    } catch (err: any) {
      setLocationError(err.message || 'No pudimos obtener tu ubicación.');
      toast(err.message || 'No pudimos obtener tu ubicación.', 'error');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleAddOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await officeLocationRepository.createOffice(newOffice.name, newOffice.latitude, newOffice.longitude, newOffice.radiusMeters);
      setOffices([created, ...offices]);
      setIsOfficeModalOpen(false);
      setNewOffice({ name: '', latitude: 0, longitude: 0, radiusMeters: 150 });
      toast(`Oficina '${created.name}' registrada exitosamente`, 'success');
    } catch (err) {
      toast("Error al registrar oficina", 'error');
    }
  };

  const handleToggleOffice = async (office: OfficeLocation) => {
    try {
      await officeLocationRepository.toggleOfficeStatus(office.id, !office.isActive);
      setOffices(offices.map(o => o.id === office.id ? { ...o, isActive: !o.isActive } : o));
      toast(`Sucursal ${office.name} ${!office.isActive ? 'activada' : 'desactivada'}`, 'success');
    } catch (err) {
      toast("Error al actualizar sucursal", 'error');
    }
  };

  const handleDeleteOffice = async (id: string) => {
    try {
      await officeLocationRepository.deleteOffice(id);
      setOffices(offices.filter(o => o.id !== id));
      toast("Sucursal eliminada", 'success');
    } catch (err) {
      toast("Error al eliminar sucursal", 'error');
    }
  };

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

  const handleAddTax = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await taxRepository.create({
        ...newTax,
        isActive: true
      });
      setTaxes([...taxes, created]);
      setIsModalOpen(false);
      setNewTax({ name: '', rate: 0, scope: 'provincial' });
      toast("Impuesto creado exitosamente", 'success');
    } catch (error) {
      toast("Error al crear impuesto", 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-blue-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">System Config</h2>
          <h1 className="text-4xl font-bold text-white tracking-tighter">
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

          <h3 className="text-xl font-bold text-white flex items-center pt-2">
            <Settings2 size={20} className="mr-2 text-emerald-500" />
            Seguridad y Sesiones
          </h3>
          <GlassCard className="p-6">
            <p className="text-slate-400 text-sm mb-6 italic">
              Configurá la expiración por inactividad y persistencia de las sesiones según el rol.
            </p>
            
            <div className="space-y-6">
              {(['admin', 'doctor', 'advisor', 'patient'] as const).map((role) => {
                const roleConfig = sessionPolicy[role] || { timeoutMinutes: 0, persistent: true };
                const roleLabel = role === 'admin' ? 'Administrador' : role === 'doctor' ? 'Médico' : role === 'advisor' ? 'Asesor' : 'Paciente';
                
                return (
                  <div key={role} className="border-b border-white/5 pb-4 last:border-b-0 last:pb-0">
                    <h4 className="font-bold text-sm text-white mb-2 capitalize">{roleLabel}</h4>
                    
                    <div className="space-y-2.5">
                      <label className="flex items-center text-xs text-slate-400 select-none cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={roleConfig.persistent}
                          onChange={(e) => {
                            setSessionPolicy({
                              ...sessionPolicy,
                              [role]: { ...roleConfig, persistent: e.target.checked }
                            });
                          }}
                          className="mr-2 rounded border-white/10 bg-white/5 text-emerald-500 focus:ring-emerald-500/20"
                        />
                        Persistir sesión al cerrar navegador
                      </label>

                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-400">Timeout:</span>
                        <input 
                          type="number"
                          min={0}
                          value={roleConfig.timeoutMinutes}
                          onChange={(e) => {
                            setSessionPolicy({
                              ...sessionPolicy,
                              [role]: { ...roleConfig, timeoutMinutes: parseInt(e.target.value) || 0 }
                            });
                          }}
                          className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-mono text-center focus:outline-none focus:border-emerald-500/50"
                        />
                        <span className="text-xs text-slate-400">min de inactividad (0 = desact.)</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleSaveSessionPolicy}
                disabled={isSavingPolicy}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50 mt-2"
              >
                <Save size={16} />
                <span>{isSavingPolicy ? 'Guardando...' : 'Guardar Políticas'}</span>
              </button>
            </div>
          </GlassCard>
        </div>

        {/* Tax Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white flex items-center">
              <Percent size={20} className="mr-2 text-amber-500" />
              Impuestos y Alícuotas
            </h3>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition-colors"
            >
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
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{tax.scope}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">{tax.rate}%</p>
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
                  La carga impositiva actual detectada es del <span className="text-white font-bold">{taxes.filter(t => t.isActive).reduce((acc, curr) => acc + curr.rate, 0)}%</span>.
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

      {/* Red de Oficinas Autorizadas (IP Whitelist) */}
      <div className="space-y-6 pt-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center">
              <Globe size={20} className="mr-2 text-emerald-500" />
              Red de Oficinas Autorizadas (Geocerca GPS)
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              Las coordenadas y el radio registrados aquí permiten a los médicos fichar el ingreso a su jornada laboral estando físicamente dentro del área de la sucursal.
            </p>
          </div>
          <button 
            onClick={() => setIsOfficeModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors shadow-lg shadow-emerald-500/5"
          >
            <Plus size={14} />
            <span>Nueva Sucursal</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offices.map((office) => (
            <GlassCard key={office.id} className={`p-6 border-l-4 ${office.isActive ? 'border-l-emerald-500' : 'border-l-slate-700'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-base font-bold text-white tracking-tight">{office.name}</h4>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 mt-1 inline-block">
                    📍 Radio: {office.radiusMeters}m · {office.latitude.toFixed(5)}, {office.longitude.toFixed(5)}
                  </span>
                </div>
                <button 
                  onClick={() => handleDeleteOffice(office.id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Eliminar sucursal"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${office.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {office.isActive ? 'Activa / Permitida' : 'Inactiva'}
                </span>
                <button 
                  onClick={() => handleToggleOffice(office)}
                  className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${office.isActive ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${office.isActive ? 'left-5.5' : 'left-0.5'}`}></div>
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Add Office Modal */}
      {isOfficeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOfficeModalOpen(false)}></div>
          <GlassCard className="relative w-full max-w-md p-8 animate-in zoom-in duration-300">
            <h3 className="text-2xl font-bold text-white mb-6">Registrar Sucursal / Oficina</h3>
            <form onSubmit={handleAddOffice} className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Nombre de la Sucursal</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Oficina Central Salta, Consultorio Belgrano"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  value={newOffice.name}
                  onChange={(e) => setNewOffice({...newOffice, name: e.target.value})}
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500">Ubicación GPS</label>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={isDetectingLocation}
                    className="text-[10px] font-bold text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {isDetectingLocation ? 'Detectando...' : '📍 Usar mi ubicación actual'}
                  </button>
                </div>
                {locationError && (
                  <p className="text-[10px] text-red-400 mb-2">{locationError}</p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-1">Latitud</label>
                    <input
                      type="number"
                      required
                      step="any"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                      value={newOffice.latitude}
                      onChange={(e) => setNewOffice({...newOffice, latitude: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-1">Longitud</label>
                    <input
                      type="number"
                      required
                      step="any"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                      value={newOffice.longitude}
                      onChange={(e) => setNewOffice({...newOffice, longitude: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Radio (metros)</label>
                <input
                  type="number"
                  required
                  min={1}
                  step="1"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                  value={newOffice.radiusMeters}
                  onChange={(e) => setNewOffice({...newOffice, radiusMeters: parseInt(e.target.value, 10)})}
                />
              </div>
              <div className="flex space-x-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsOfficeModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-white/5 text-slate-400 rounded-xl font-bold hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  Guardar Sucursal
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Add Tax Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <GlassCard className="relative w-full max-w-md p-8 animate-in zoom-in duration-300">
            <h3 className="text-2xl font-bold text-white mb-6">Nuevo Impuesto</h3>
            <form onSubmit={handleAddTax} className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Nombre del Impuesto</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: IVA, IIBB, Ganancias"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  value={newTax.name}
                  onChange={(e) => setNewTax({...newTax, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Alícuota (%)</label>
                  <input 
                    type="number" 
                    required
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                    value={newTax.rate}
                    onChange={(e) => setNewTax({...newTax, rate: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Alcance</label>
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 appearance-none"
                    value={newTax.scope}
                    onChange={(e) => setNewTax({...newTax, scope: e.target.value as any})}
                  >
                    <option value="national" className="bg-[#0f172a]">Nacional</option>
                    <option value="local" className="bg-[#0f172a]">Local</option>
                  </select>
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-white/5 text-slate-400 rounded-xl font-bold hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  Crear Impuesto
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default OCCSettings;
