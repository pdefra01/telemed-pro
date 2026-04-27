import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, AlertCircle, Shield, User as UserIcon, Building2, Filter } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { affiliateRepository } from '../../repositories/AffiliateRepository';
import { Patient } from '../../types';

// Glass Card for Table Container
const GlassTableContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
    {children}
  </div>
);

const Affiliates: React.FC = () => {
  const { toast } = useToast();
  const [affiliates, setAffiliates] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    dni: '',
    planName: 'Plan Básico',
    planStatus: 'active' as const
  });

  useEffect(() => {
    loadAffiliates();
  }, []);

  const loadAffiliates = async () => {
    try {
      setIsLoading(true);
      const data = await affiliateRepository.getAllAffiliates();
      setAffiliates(data);
    } catch (error) {
      toast("Error cargando afiliados", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewAffiliate = () => {
    setEditId(null);
    setFormData({
      name: '',
      email: '',
      dni: '',
      planName: 'Plan Básico',
      planStatus: 'active'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editId) {
        await affiliateRepository.updateAffiliate(editId, formData);
        toast(`Afiliado ${formData.name} actualizado`, "success");
      } else {
        await affiliateRepository.createAffiliate(formData);
        toast(`Afiliado ${formData.name} registrado`, "success");
      }
      setShowModal(false);
      loadAffiliates();
    } catch (error) {
      toast("Error al guardar afiliado", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (patient: Patient) => {
    setEditId(patient.id);
    setFormData({
      name: patient.name,
      email: patient.email,
      dni: patient.dni || '',
      planName: patient.planName || 'Plan Básico',
      planStatus: (patient.planStatus as any) || 'active'
    });
    setShowModal(true);
  };

  const handleDeactivate = async (id: string) => {
    setIsSubmitting(true);
    try {
      await affiliateRepository.deactivateAffiliate(id);
      toast("Afiliado desactivado", "success");
      setDeleteConfirmId(null);
      loadAffiliates();
    } catch (error) {
      toast("Error al desactivar", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Comercial / CRM</h2>
          <h1 className="text-4xl font-black text-white tracking-tighter">Padrón de <span className="text-slate-500 font-light italic">Afiliados</span></h1>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative group">
            <input
              type="text"
              placeholder="Buscar por DNI o Nombre..."
              className="pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none text-white text-sm w-full md:w-72 transition-all group-hover:border-white/20"
            />
            <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
          </div>
          <button 
            onClick={handleNewAffiliate}
            className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-[#020617] px-5 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            <Plus size={20} />
            <span className="hidden md:inline">Nuevo Afiliado</span>
          </button>
        </div>
      </div>

      {/* Stats Summary for Affiliates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400">
            <UserIcon size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Individuos</p>
            <h4 className="text-xl font-bold text-white">{affiliates.length}</h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
            <Building2 size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Altas del Mes</p>
            <h4 className="text-xl font-bold text-white">42</h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Estado Cartera</p>
            <h4 className="text-xl font-bold text-emerald-400">98.2% Saludable</h4>
          </div>
        </div>
      </div>

      <GlassTableContainer>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                <th className="px-8 py-5">Identidad</th>
                <th className="px-6 py-5">Plan / Cobertura</th>
                <th className="px-6 py-5 text-center">Estado de Pago</th>
                <th className="px-8 py-5 text-right">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-500 italic animate-pulse">Sincronizando padrón de afiliados...</td></tr>
              ) : affiliates.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-500 italic">No se encontraron registros en la base de datos.</td></tr>
              ) : affiliates.map((patient) => (
                <tr key={patient.id} className="group hover:bg-white/5 transition-all duration-200">
                  <td className="px-8 py-5">
                    <div className="flex items-center">
                      <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 font-black text-lg transition-transform group-hover:scale-110">
                        {patient.name.charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{patient.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center mt-1">
                          <span className="bg-slate-800 px-1.5 py-0.5 rounded mr-2 font-mono">DNI {patient.dni}</span>
                          {patient.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm font-semibold text-slate-300">{patient.planName}</div>
                    <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Premium Network</div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                      ${patient.planStatus === 'active' 
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full mr-2 ${patient.planStatus === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                      {patient.planStatus === 'active' ? 'Al Día' : 'En Mora'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end space-x-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button 
                        onClick={() => handleEdit(patient)} 
                        className="p-2 bg-white/5 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-colors border border-white/5"
                        title="Editar Perfil"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmId(patient.id)} 
                        className="p-2 bg-white/5 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors border border-white/5"
                        title="Suspender"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassTableContainer>

      {/* Premium Modal ABM */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-[2.5rem] p-8 w-full max-w-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500"></div>
            
            <h3 className="text-2xl font-black text-white mb-6">
              {editId ? 'Editar' : 'Registrar'} <span className="text-emerald-500">Afiliado</span>
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-1">Nombre Completo</label>
                <input
                  type="text" required
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-1">DNI</label>
                  <input
                    type="text" required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                    value={formData.dni}
                    onChange={e => setFormData({ ...formData, dni: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-1">Email Corporativo</label>
                  <input
                    type="email" required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-1">Nivel de Cobertura</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors appearance-none"
                  value={formData.planName}
                  onChange={e => setFormData({ ...formData, planName: e.target.value })}
                >
                  <option value="Plan Básico" className="bg-[#0f172a]">Plan Básico (Esencial)</option>
                  <option value="Plan Premium" className="bg-[#0f172a]">Plan Premium (Recomendado)</option>
                  <option value="Plan Platino" className="bg-[#0f172a]">Plan Platino (Full Coverage)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-emerald-500 hover:bg-emerald-400 text-[#020617] px-8 py-3 rounded-2xl font-black transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Procesando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-rose-500/20 rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-3xl bg-rose-500/10 mb-6 border border-rose-500/20">
              <AlertCircle className="h-8 w-8 text-rose-500" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">¿Confirmar Suspensión?</h3>
            <p className="text-sm text-slate-400 mb-8 font-medium">El acceso a los servicios de TeleMed será revocado inmediatamente.</p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors"
              >
                Ignorar
              </button>
              <button
                onClick={() => handleDeactivate(deleteConfirmId)}
                disabled={isSubmitting}
                className="px-6 py-3 bg-rose-500 text-white rounded-2xl font-black hover:bg-rose-600 transition-all"
              >
                {isSubmitting ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Affiliates;
