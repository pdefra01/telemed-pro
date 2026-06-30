import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, Search, Filter, 
  Activity, Star, Clock, AlertCircle, 
  User as UserIcon, ShieldCheck, Stethoscope,
  Key
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { doctorRepository } from '../../repositories/DoctorRepository';
import { Doctor } from '../../types';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal';

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
  const [resetPasswordDoc, setResetPasswordDoc] = useState<Doctor | null>(null);
  const [activeTab, setActiveTab] = useState<'personal' | 'accreditation' | 'contract' | 'agenda'>('personal');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    specialty: 'Clínica Médica',
    password: '',
    licenseNumber: '',
    provincialLicense: '',
    cuit: '',
    phone: '',
    university: '',
    graduationYear: new Date().getFullYear(),
    consultationFee: 0,
    contractStartDate: '',
    contractEndDate: '',
    availability: [] as string[]
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
    setActiveTab('personal');
    setFormData({
      name: '',
      email: '',
      specialty: 'Clínica Médica',
      password: '',
      licenseNumber: '',
      provincialLicense: '',
      cuit: '',
      phone: '',
      university: '',
      graduationYear: new Date().getFullYear(),
      consultationFee: 0,
      contractStartDate: '',
      contractEndDate: '',
      availability: []
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editId) {
        await doctorRepository.updateDoctor(editId, formData);
        toast(`Ficha del Dr. ${formData.name} actualizada`, "success");
      } else {
        await doctorRepository.createDoctor(formData);
        toast(`Ficha del Dr. ${formData.name} registrada`, "success");
      }
      setShowModal(false);
      loadDoctors();
    } catch (error) {
      toast("Error al guardar ficha del médico", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (doctor: Doctor) => {
    setEditId(doctor.id);
    setActiveTab('personal');
    setFormData({
      name: doctor.name || '',
      email: doctor.email || '',
      specialty: doctor.specialty || 'Clínica Médica',
      password: '',
      licenseNumber: doctor.licenseNumber || '',
      provincialLicense: doctor.provincialLicense || '',
      cuit: doctor.cuit || '',
      phone: doctor.phone || '',
      university: doctor.university || '',
      graduationYear: doctor.graduationYear || new Date().getFullYear(),
      consultationFee: doctor.consultationFee || 0,
      contractStartDate: doctor.contractStartDate || '',
      contractEndDate: doctor.contractEndDate || '',
      availability: doctor.availability || []
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
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Recursos Humanos / Médico</h2>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tighter">Cuerpo <span className="text-slate-500 font-light italic">Profesional</span></h1>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative group flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Buscar por nombre o especialidad..."
              className="pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none text-white text-sm w-full sm:w-72 transition-all group-hover:border-white/20"
            />
            <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
          </div>
          <button 
            onClick={handleNewDoctor}
            className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-[#020617] px-5 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)] w-full sm:w-auto"
          >
            <Plus size={20} />
            <span>Nuevo Médico</span>
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
                <th className="px-6 py-5">Especialidad & Licencias</th>
                <th className="px-6 py-5">Relación Laboral</th>
                <th className="px-6 py-5 text-center">Calificación</th>
                <th className="px-8 py-5 text-right">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-500 italic animate-pulse">Sincronizando cuerpo médico...</td></tr>
              ) : doctors.length === 0 ? (
                <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-500 italic">No se encontraron profesionales registrados.</td></tr>
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
                        <div className="text-[11px] text-slate-500 mt-0.5">{doc.email} {doc.phone ? `• ${doc.phone}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm font-semibold text-slate-300">{doc.specialty}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {doc.licenseNumber && (
                        <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {doc.licenseNumber}
                        </span>
                      )}
                      {doc.provincialLicense && (
                        <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          {doc.provincialLicense}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-xs font-bold text-slate-300">
                      {doc.contractStartDate ? `Alta: ${doc.contractStartDate}` : 'Alta: Pendiente'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {doc.contractEndDate ? `Fin: ${doc.contractEndDate}` : 'Contrato Indefinido'}
                    </div>
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
                        onClick={() => setResetPasswordDoc(doc)} 
                        className="p-2 bg-white/5 hover:bg-amber-500/20 text-amber-500 rounded-xl transition-colors border border-white/5"
                        title="Restablecer Contraseña"
                      >
                        <Key size={16} />
                      </button>
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

      {/* Premium Modal ABM (Ficha Médica Integral) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 w-full max-w-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden max-h-[90vh] flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500"></div>
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">
                Ficha Médica Integral — <span className="text-emerald-400">{editId ? 'Editar Legajo' : 'Nuevo Alta'}</span>
              </h3>
            </div>

            {/* Modal Tabs */}
            <div className="flex p-1 bg-slate-950/80 rounded-2xl border border-white/10 mb-6 gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all min-w-[80px] ${
                  activeTab === 'personal' ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
                }`}
              >
                1. Datos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('accreditation')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all min-w-[80px] ${
                  activeTab === 'accreditation' ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
                }`}
              >
                2. Licencias
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('contract')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all min-w-[80px] ${
                  activeTab === 'contract' ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
                }`}
              >
                3. Contrato
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('agenda')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all min-w-[80px] ${
                  activeTab === 'agenda' ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
                }`}
              >
                4. Agenda
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6 flex-1 overflow-y-auto pr-2">
              {/* TAB 1: DATOS PERSONALES */}
              {activeTab === 'personal' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Nombre y Apellido Completo</label>
                    <input
                      type="text" required
                      placeholder="Ej: Dr. Alejandro Magno"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Email Profesional</label>
                      <input
                        type="email" required
                        placeholder="medico@medinex.com.ar"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Teléfono Móvil Contacto</label>
                      <input
                        type="text"
                        placeholder="+54 9 387 123-4567"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">CUIT / CUIL Fiscal</label>
                      <input
                        type="text"
                        placeholder="20-34567890-9"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                        value={formData.cuit}
                        onChange={e => setFormData({ ...formData, cuit: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Especialidad Principal</label>
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
                        <option value="Neurología" className="bg-[#0f172a]">Neurología</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: LICENCIAS Y FORMACIÓN */}
              {activeTab === 'accreditation' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-emerald-400 ml-1">Matrícula Nacional (MN)</label>
                      <input
                        type="text"
                        placeholder="Ej: MN 142.890"
                        className="w-full bg-white/5 border border-emerald-500/30 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                        value={formData.licenseNumber}
                        onChange={e => setFormData({ ...formData, licenseNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-blue-400 ml-1">Matrícula Provincial (MP)</label>
                      <input
                        type="text"
                        placeholder="Ej: MP 8.412 (Salta)"
                        className="w-full bg-white/5 border border-blue-500/30 rounded-2xl p-3.5 text-white outline-none focus:border-blue-500 transition-colors font-mono"
                        value={formData.provincialLicense}
                        onChange={e => setFormData({ ...formData, provincialLicense: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Universidad de Egreso</label>
                      <input
                        type="text"
                        placeholder="Ej: Universidad Nacional de Córdoba (UNC)"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                        value={formData.university}
                        onChange={e => setFormData({ ...formData, university: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Año Titulación</label>
                      <input
                        type="number"
                        placeholder="2015"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                        value={formData.graduationYear}
                        onChange={e => setFormData({ ...formData, graduationYear: parseInt(e.target.value) || 2020 })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: VÍNCULO LABORAL Y HONORARIOS */}
              {activeTab === 'contract' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-emerald-400 ml-1">Fecha Inicio Relación Laboral</label>
                      <input
                        type="date"
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                        value={formData.contractStartDate}
                        onChange={e => setFormData({ ...formData, contractStartDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-amber-400 ml-1">Fecha Fin Relación Laboral (Opcional)</label>
                      <input
                        type="date"
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-amber-500/50 transition-colors"
                        value={formData.contractEndDate}
                        onChange={e => setFormData({ ...formData, contractEndDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Honorario por Consulta ($ ARS)</label>
                    <input
                      type="number" step="100"
                      placeholder="Ej: 15000"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors font-mono"
                      value={formData.consultationFee}
                      onChange={e => setFormData({ ...formData, consultationFee: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  {/* Contraseña solo al crear */}
                  {!editId && (
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-rose-400 ml-1">Contraseña Temporal de Acceso</label>
                      <input
                        type="password"
                        required={!editId}
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full bg-white/5 border border-rose-500/30 rounded-2xl p-3.5 text-white outline-none focus:border-rose-500 transition-colors placeholder-slate-600"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: DISPONIBILIDAD / AGENDA */}
              {activeTab === 'agenda' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-white/5 border border-white/10 p-5 rounded-3xl">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-relaxed">
                      Definí los horarios de atención telefónica o video consulta disponibles para este profesional. Los pacientes verán y podrán agendar turnos únicamente en los bloques seleccionados.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Grilla de Horarios (08:00 - 00:00 hs)</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allSlots = Array.from({ length: 17 }, (_, i) => {
                              const hour = 8 + i;
                              return hour === 24 ? '00:00' : `${hour.toString().padStart(2, '0')}:00`;
                            });
                            setFormData({ ...formData, availability: allSlots });
                          }}
                          className="px-2.5 py-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-all uppercase tracking-wider"
                        >
                          Marcar Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const originalSlots = Array.from({ length: 17 }, (_, i) => {
                              const hour = 8 + i;
                              return hour === 24 ? '00:00' : `${hour.toString().padStart(2, '0')}:00`;
                            });
                            setFormData({ ...formData, availability: originalSlots });
                          }}
                          className="px-2.5 py-1 text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-all uppercase tracking-wider"
                        >
                          Originales
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, availability: [] })}
                          className="px-2.5 py-1 text-[9px] font-bold text-slate-400 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition-all uppercase tracking-wider"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 bg-slate-950/30 p-4 rounded-3xl border border-white/5">
                      {Array.from({ length: 17 }, (_, i) => {
                        const hour = 8 + i;
                        const slot = hour === 24 ? '00:00' : `${hour.toString().padStart(2, '0')}:00`;
                        const isSelected = formData.availability.includes(slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              const current = [...formData.availability];
                              if (current.includes(slot)) {
                                setFormData({ ...formData, availability: current.filter(s => s !== slot) });
                              } else {
                                setFormData({ ...formData, availability: [...current, slot].sort() });
                              }
                            }}
                            className={`py-3 text-xs font-bold rounded-xl border transition-all ${
                              isSelected 
                                ? 'bg-emerald-500 text-[#020617] border-emerald-500 shadow-lg shadow-emerald-500/20' 
                                : 'bg-white/5 border-white/5 text-slate-400 hover:border-emerald-500/30'
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center space-x-4 pt-6 border-t border-white/10 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors text-xs uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-8 py-3.5 rounded-2xl font-bold transition-all disabled:opacity-50 text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20"
                >
                  {isSubmitting ? 'Guardando Legajo...' : 'Guardar Ficha Médica'}
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

      {/* Reset Password Modal */}
      {resetPasswordDoc && (
        <ResetPasswordModal
          userId={resetPasswordDoc.id}
          userName={resetPasswordDoc.name}
          userRole="doctor"
          onClose={() => setResetPasswordDoc(null)}
        />
      )}
    </div>
  );
};

export default Doctors;
