import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, Search, Filter, 
  Activity, Star, Clock, AlertCircle, 
  User as UserIcon, ShieldCheck, Stethoscope
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { doctorRepository } from '../../repositories/DoctorRepository';
import { Doctor } from '../../types';

// Glass Card for Table Container
const GlassTableContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
    {children}
  </div>
);

const Doctors: React.FC = () => {
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    specialty: 'Clínica Médica'
  });

  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctors = async () => {
    try {
      setIsLoading(true);
      const data = await doctorRepository.getAllDoctors();
      setDoctors(data);
    } catch (error) {
      toast("Error cargando médicos", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewDoctor = () => {
    setEditId(null);
    setFormData({
      name: '',
      email: '',
      specialty: 'Clínica Médica'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editId) {
        await doctorRepository.updateDoctor(editId, formData);
        toast(`Dr. ${formData.name} actualizado`, "success");
      } else {
        await doctorRepository.createDoctor(formData);
        toast(`Dr. ${formData.name} registrado`, "success");
      }
      setShowModal(false);
      loadDoctors();
    } catch (error) {
      toast("Error al guardar médico", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (doctor: Doctor) => {
    setEditId(doctor.id);
    setFormData({
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.specialty
    });
    setShowModal(true);
  };

  const handleDeactivate = async (id: string) => {
    setIsSubmitting(true);
    try {
      await doctorRepository.deactivateDoctor(id);
      toast("Médico dado de baja", "success");
      setDeleteConfirmId(null);
      loadDoctors();
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
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Recursos Humanos / Médico</h2>
          <h1 className="text-4xl font-bold text-white tracking-tighter">Cuerpo <span className="text-slate-500 font-light italic">Profesional</span></h1>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative group">
            <input
              type="text"
              placeholder="Buscar por nombre o especialidad..."
              className="pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none text-white text-sm w-full md:w-72 transition-all group-hover:border-white/20"
            />
            <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
          </div>
          <button 
            onClick={handleNewDoctor}
            className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-[#020617] px-5 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            <Plus size={20} />
            <span className="hidden md:inline">Nuevo Médico</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4 transition-all hover:border-emerald-500/30">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <UserIcon size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Médicos Activos</p>
            <h4 className="text-xl font-bold text-white">{doctors.length}</h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4 transition-all hover:border-blue-500/30">
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Atenciones Hoy</p>
            <h4 className="text-xl font-bold text-white">124</h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4 transition-all hover:border-amber-500/30">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
            <Star size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Satisfacción Media</p>
            <h4 className="text-xl font-bold text-white">4.9/5.0</h4>
          </div>
        </div>
      </div>

      <GlassTableContainer>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                <th className="px-8 py-5">Profesional</th>
                <th className="px-6 py-5">Especialidad</th>
                <th className="px-6 py-5 text-center">Calificación</th>
                <th className="px-8 py-5 text-right">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-500 italic animate-pulse">Sincronizando cuerpo médico...</td></tr>
              ) : doctors.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-500 italic">No se encontraron profesionales registrados.</td></tr>
              ) : doctors.map((doc) => (
                <tr key={doc.id} className="group hover:bg-white/5 transition-all duration-200">
                  <td className="px-8 py-5">
                    <div className="flex items-center">
                      <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 font-bold text-lg transition-transform group-hover:scale-110 overflow-hidden">
                        {doc.avatarUrl ? (
                          <img src={doc.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          doc.name.charAt(0)
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{doc.name}</div>
                        <div className="text-[11px] text-slate-500 mt-1">{doc.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm font-semibold text-slate-300">{doc.specialty}</div>
                    <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-tighter">Verificado</div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <div className="inline-flex items-center bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-xl">
                      <Star size={12} className="text-amber-500 mr-1.5" fill="currentColor" />
                      <span className="text-amber-400 font-bold text-xs">{doc.rating || '5.0'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end space-x-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button 
                        onClick={() => handleEdit(doc)} 
                        className="p-2 bg-white/5 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-colors border border-white/5"
                        title="Editar Perfil"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmId(doc.id)} 
                        className="p-2 bg-white/5 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors border border-white/5"
                        title="Baja Médica"
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
            
            <h3 className="text-2xl font-bold text-white mb-6">
              {editId ? 'Editar' : 'Registrar'} <span className="text-emerald-500">Médico</span>
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Nombre Completo</label>
                <input
                  type="text" required
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Email Profesional</label>
                <input
                  type="email" required
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Especialidad Principal</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors appearance-none"
                  value={formData.specialty}
                  onChange={e => setFormData({ ...formData, specialty: e.target.value })}
                >
                  <option value="Clínica Médica" className="bg-[#0f172a]">Clínica Médica</option>
                  <option value="Pediatría" className="bg-[#0f172a]">Pediatría</option>
                  <option value="Cardiología" className="bg-[#0f172a]">Cardiología</option>
                  <option value="Dermatología" className="bg-[#0f172a]">Dermatología</option>
                  <option value="Ginecología" className="bg-[#0f172a]">Ginecología</option>
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
                  className="bg-emerald-500 hover:bg-emerald-400 text-[#020617] px-8 py-3 rounded-2xl font-bold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Procesando...' : 'Guardar Médico'}
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
            <h3 className="text-xl font-bold text-white mb-2">¿Confirmar Baja?</h3>
            <p className="text-sm text-slate-400 mb-8 font-medium">El profesional no podrá atender más consultas ni acceder al Clinical Hub.</p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeactivate(deleteConfirmId)}
                disabled={isSubmitting}
                className="px-6 py-3 bg-rose-500 text-white rounded-2xl font-bold hover:bg-rose-600 transition-all"
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

export default Doctors;
