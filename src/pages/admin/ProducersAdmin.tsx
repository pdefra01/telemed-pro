import React, { useState, useEffect } from 'react';
import { Producer } from '../../types';
import { producerRepository } from '../../repositories/ProducerRepository';
import { supabase } from '../../services/supabase';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal';
import {
  Building2, Plus, Users, Award, DollarSign, CheckCircle, Search, Mail, Phone, TrendingUp, Key, Pencil
} from 'lucide-react';

export const ProducersAdmin: React.FC = () => {
  const [producers, setProducers] = useState<Producer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dni, setDni] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [resetPasswordProducer, setResetPasswordProducer] = useState<Producer | null>(null);

  // Edit form state
  const [editingProducer, setEditingProducer] = useState<Producer | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDni, setEditDni] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCode, setEditCode] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  useEffect(() => {
    loadProducers();
  }, []);

  const loadProducers = async () => {
    setLoading(true);
    try {
      const sups = await producerRepository.getProducers();
      setProducers(sups);
    } catch (err) {
      console.error("Error cargando productores:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProducer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      alert("La contraseña inicial es requerida.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/create-advisor', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName,
          lastName,
          promoterCode: code,
          email,
          phone,
          dni,
          address,
          password
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar la provisión del asesor.');
      }

      setToastMsg("Asesor comercial registrado y cuenta provisionada con éxito.");
      setShowModal(false);
      setFirstName('');
      setLastName('');
      setCode('');
      setEmail('');
      setPhone('');
      setDni('');
      setAddress('');
      setPassword('');
      await loadProducers();
    } catch (err: any) {
      alert(err.message || "Error al crear productor comercial.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (p: Producer) => {
    const [first, ...rest] = p.name.split(' ');
    setEditFirstName(first || '');
    setEditLastName(rest.join(' '));
    setEditEmail(p.email);
    setEditPhone(p.phone || '');
    setEditDni(p.dni || '');
    setEditAddress(p.address || '');
    setEditCode(p.producerCode);
    setEditingProducer(p);
  };

  const handleUpdateProducer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProducer) return;
    setIsSubmittingEdit(true);
    try {
      await producerRepository.updateProducer(editingProducer.id, {
        firstName: editFirstName,
        lastName: editLastName,
        email: editEmail,
        phone: editPhone,
        dni: editDni,
        address: editAddress,
        producerCode: editCode,
      });
      setToastMsg("Datos del asesor actualizados con éxito.");
      setEditingProducer(null);
      await loadProducers();
    } catch (err: any) {
      alert(err.message || "Error al actualizar el asesor.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const filteredProducers = producers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.producerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAffiliatesAllProducers = producers.reduce((sum, p) => sum + (p.totalAffiliatesReferred || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-teal-500/10 text-teal-400 rounded-2xl flex items-center justify-center font-bold border border-teal-500/20 shadow-lg shadow-teal-500/5">
            <Award size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-[0.3em]">Commercial Network</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Gestión de Productores & Asesores Comerciales</h1>
            <p className="text-xs text-slate-400 mt-0.5">Seguimiento de altas por comercial, comisiones asignadas y red de ventas.</p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2 active:scale-95 cursor-pointer"
        >
          <Plus size={16} /> Nuevo Asesor Comercial
        </button>
      </div>

      {toastMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-emerald-400 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg('')} className="hover:text-white">✕</button>
        </div>
      )}

      {/* HUD Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-slate-900/40 border border-white/5 p-6 rounded-3xl backdrop-blur-xl relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Asesores Activos</span>
          <div className="text-3xl font-extrabold text-white font-mono">{producers.length}</div>
        </div>

        <div className="bg-slate-900/40 border border-teal-500/30 p-6 rounded-3xl backdrop-blur-xl relative overflow-hidden">
          <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block mb-1">Altas Referidas por Red</span>
          <div className="text-3xl font-extrabold text-white font-mono">{totalAffiliatesAllProducers} <span className="text-xs text-slate-400 font-normal">afiliados</span></div>
        </div>
      </div>

      {/* Search & List */}
      <div className="space-y-4">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder="Buscar por nombre, código o email de asesor..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/60 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-white text-xs focus:outline-none focus:border-teal-500/50"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducers.map(p => (
            <div key={p.id} className="bg-slate-900/40 border border-white/5 hover:border-teal-500/30 rounded-3xl p-6 space-y-4 transition-all duration-300 backdrop-blur-xl relative group">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold font-mono text-teal-400 uppercase tracking-widest px-2.5 py-1 bg-teal-500/10 rounded-full border border-teal-500/20 inline-block mb-2">
                    {p.producerCode}
                  </span>
                  <h3 className="text-lg font-bold text-white tracking-tight">{p.name}</h3>
                  <p className="text-xs text-slate-400">{p.email}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-bold uppercase border border-emerald-500/20">
                    {p.status}
                  </span>
                  {p.hasAccount && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 bg-white/5 hover:bg-teal-500/20 text-teal-400 rounded-xl transition-colors border border-white/5"
                        title="Editar Datos"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setResetPasswordProducer(p)}
                        className="p-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-500 rounded-xl transition-colors border border-white/5"
                        title="Restablecer Contraseña"
                      >
                        <Key size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-white/5 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Afiliados Traídos</span>
                  <span className="font-mono font-bold text-teal-400 text-lg">{p.totalAffiliatesReferred || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Crear Productor */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-xl font-bold text-white">Alta de Asesor Comercial / Productor</h3>
            <form onSubmit={handleSaveProducer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nombre:</label>
                  <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ej. Carlos" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Apellido:</label>
                  <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ej. Gómez" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">N° DNI:</label>
                  <input type="text" required value={dni} onChange={e => setDni(e.target.value.replace(/\D/g, ''))} placeholder="Sin puntos" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">N° Celular:</label>
                  <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej. 3416123456" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Correo Personal:</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Ej. carlos@gmail.com" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Código Único Comercial:</label>
                <input type="text" required value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ej. PROD-103" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Domicilio Particular:</label>
                <input type="text" required value={address} onChange={e => setAddress(e.target.value)} placeholder="Ej. Av. Pellegrini 1234, Rosario" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Contraseña Inicial Acceso Portal:</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Ej. ClaveFuerte123" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 bg-white/5 text-slate-400 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-teal-500 text-slate-950 rounded-xl text-xs font-bold">{isSubmitting ? 'Guardando...' : 'Guardar Productor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Asesor */}
      {editingProducer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-xl font-bold text-white">Editar Asesor: {editingProducer.name}</h3>
            <form onSubmit={handleUpdateProducer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nombre:</label>
                  <input type="text" required value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Apellido:</label>
                  <input type="text" required value={editLastName} onChange={e => setEditLastName(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">N° DNI:</label>
                  <input type="text" required value={editDni} onChange={e => setEditDni(e.target.value.replace(/\D/g, ''))} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">N° Celular:</label>
                  <input type="tel" required value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Correo Personal:</label>
                <input type="email" required value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Domicilio Particular:</label>
                <input type="text" required value={editAddress} onChange={e => setEditAddress(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Código Único Comercial:</label>
                <input type="text" required value={editCode} onChange={e => setEditCode(e.target.value.toUpperCase())} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditingProducer(null)} className="px-6 py-3 bg-white/5 text-slate-400 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={isSubmittingEdit} className="px-6 py-3 bg-teal-500 text-slate-950 rounded-xl text-xs font-bold">{isSubmittingEdit ? 'Guardando...' : 'Guardar Cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordProducer && (
        <ResetPasswordModal
          userId={resetPasswordProducer.id}
          userName={resetPasswordProducer.name}
          userRole="advisor"
          onClose={() => setResetPasswordProducer(null)}
        />
      )}
    </div>
  );
};

export default ProducersAdmin;
