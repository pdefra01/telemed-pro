import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  User as UserIcon, Mail, Phone, MapPin, Heart,
  CreditCard, Shield, ArrowLeft, Loader2, Save,
  Plus, Trash2, Users, Calendar, ChevronDown,
  AlertCircle, CheckCircle2, Edit2, X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Patient, FamilyMember } from '../../types';
import { affiliateRepository } from '../../repositories/AffiliateRepository';
import { familyMemberRepository } from '../../repositories/FamilyMemberRepository';
import { ContactValidationModal } from '../../components/ui/ContactValidationModal';

interface ProfileProps {
  user: Patient;
  onLogin: (updatedUser: Patient) => void;
}

type ExtendedFamilyMember = FamilyMember & { dni?: string; birthDate?: string };

const RELATION_OPTIONS = ['cónyuge', 'hijo/a', 'padre/madre', 'hermano/a', 'otro'] as const;
const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const Profile: React.FC<ProfileProps> = ({ user, onLogin }) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Titular state ──────────────────────────────────────────────────────────
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [address, setAddress] = useState(user.address || '');
  const [bloodType, setBloodType] = useState(user.bloodType || '');
  const [birthDate, setBirthDate] = useState(user.birthDate || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ── OTP Validation state ───────────────────────────────────────────────────
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [otpChannel, setOtpChannel] = useState<'phone' | 'email'>('phone');
  const [otpContactValue, setOtpContactValue] = useState('');

  // ── Family state ───────────────────────────────────────────────────────────
  const [familyMembers, setFamilyMembers] = useState<ExtendedFamilyMember[]>([]);
  const [isFetchingFamily, setIsFetchingFamily] = useState(true);
  const [familyGroupId, setFamilyGroupId] = useState<string | null>(user.familyGroupId || null);

  // New member form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRelation, setNewMemberRelation] = useState<string>('hijo/a');
  const [newMemberBirthDate, setNewMemberBirthDate] = useState('');
  const [newMemberDni, setNewMemberDni] = useState('');
  const [isSavingMember, setIsSavingMember] = useState(false);

  // Remove confirm
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Deep-link to open the add-family form (HashRouter and BrowserRouter compatible)
  useEffect(() => {
    const hash = window.location.hash;
    const searchIndex = hash.indexOf('?');
    if (searchIndex !== -1) {
      const queryParams = new URLSearchParams(hash.substring(searchIndex));
      if (queryParams.get('addFamily') === 'true') {
        setShowAddForm(true);
        window.location.hash = hash.substring(0, searchIndex);
      }
    } else {
      const queryParams = new URLSearchParams(window.location.search);
      if (queryParams.get('addFamily') === 'true') {
        setShowAddForm(true);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // ── Load family members ────────────────────────────────────────────────────
  useEffect(() => {
    const loadFamily = async () => {
      setIsFetchingFamily(true);
      try {
        if (familyGroupId) {
          const members = await familyMemberRepository.getByFamilyGroup(familyGroupId);
          setFamilyMembers(members);
        }
      } catch (err) {
        console.error('Error loading family members:', err);
      } finally {
        setIsFetchingFamily(false);
      }
    };
    loadFamily();
  }, [familyGroupId]);

  // ── Save titular profile ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('El nombre completo no puede estar vacío', 'error');
      return;
    }
    setIsSavingProfile(true);
    try {
      const updatedUser = await affiliateRepository.updateAffiliate(user.id, {
        name,
        phone,
        address,
        bloodType: bloodType || undefined,
        birthDate: birthDate || undefined,
      });
      onLogin(updatedUser);
      localStorage.setItem('medinex_user', JSON.stringify(updatedUser));
      toast('Perfil actualizado con éxito', 'success');
      navigate('/');
    } catch (error: any) {
      console.error('Error al actualizar el perfil:', error);
      toast(error.message || 'Error al guardar los cambios', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ── Add family member ──────────────────────────────────────────────────────
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      toast('El nombre del familiar es requerido', 'error');
      return;
    }
    setIsSavingMember(true);
    try {
      // Ensure family group exists (creates one if needed)
      const groupId = await familyMemberRepository.ensureFamilyGroup(user.id);
      if (groupId !== familyGroupId) setFamilyGroupId(groupId);

      const member = await familyMemberRepository.addMember(groupId, {
        fullName: newMemberName.trim(),
        relation: newMemberRelation,
        birthDate: newMemberBirthDate || undefined,
        dni: newMemberDni.trim() || undefined,
      });

      setFamilyMembers(prev => [...prev, member]);
      setNewMemberName('');
      setNewMemberRelation('hijo/a');
      setNewMemberBirthDate('');
      setNewMemberDni('');
      setShowAddForm(false);
      toast('Familiar agregado con éxito', 'success');
    } catch (error: any) {
      console.error('Error adding family member:', error);
      toast(error.message || 'Error al agregar familiar', 'error');
    } finally {
      setIsSavingMember(false);
    }
  };

  // ── Remove family member ───────────────────────────────────────────────────
  const handleRemoveMember = async (memberId: string) => {
    setRemovingId(memberId);
    try {
      await familyMemberRepository.removeMember(memberId);
      setFamilyMembers(prev => prev.filter(m => m.id !== memberId));
      toast('Familiar eliminado', 'success');
    } catch (error: any) {
      console.error('Error removing family member:', error);
      toast(error.message || 'Error al eliminar familiar', 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 sm:p-6 md:p-8 space-y-8 relative overflow-hidden pb-20 max-w-3xl mx-auto">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 space-y-10">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link
            to="/"
            className="w-12 h-12 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl flex items-center justify-center transition-all flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-1">Mi Ecosistema</h2>
            <h1 className="text-4xl font-bold text-white tracking-tight">Mi Perfil</h1>
          </div>
        </div>

        {/* ══ SECTION 1: Datos del Titular ══════════════════════════════════════ */}
        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {/* Avatar + name */}
          <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 pb-8 border-b border-white/10 mb-8">
            <div className="relative">
              <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-[2rem] overflow-hidden border-2 border-white/20 shadow-2xl flex items-center justify-center">
                <img
                  src={user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=10b981&color=fff`}
                  alt="Profile Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center border-2 border-slate-900 text-white shadow-md">
                <Shield size={12} />
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-bold text-white tracking-tight">{user.name}</h2>
              <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest mt-1">Afiliado Titular</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Read-only identity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 bg-black/20 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 mb-2">
              <p className="md:col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Datos de Identidad (no editables)</p>
              <Input
                id="dni"
                label="DNI"
                value={user.dni || ''}
                readOnly
                disabled
                icon={<CreditCard size={18} />}
                className="bg-white/5 border-white/5 text-slate-400 cursor-not-allowed"
              />
              <Input
                id="email"
                label="Correo Electrónico"
                value={user.email || ''}
                readOnly
                disabled
                icon={<Mail size={18} />}
                className="bg-white/5 border-white/5 text-slate-400 cursor-not-allowed"
              />
              <div className="md:col-span-2">
                <Input
                  id="planName"
                  label="Plan de Cobertura"
                  value={user.planName || 'Sin plan asignado'}
                  readOnly
                  disabled
                  icon={<Shield size={18} />}
                  className="bg-white/5 border-white/5 text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Editable contact */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Datos de Contacto</p>
              <Input
                id="name"
                label="Nombre Completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Juan Pérez"
                required
                icon={<UserIcon size={18} />}
                className="bg-white/5 border-white/10 text-white focus:border-emerald-500 focus:ring-emerald-500/20"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <Input
                  id="phone"
                  label="Teléfono"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: +54 9 11 1234-5678"
                  icon={<Phone size={18} />}
                  className="bg-white/5 border-white/10 text-white focus:border-emerald-500 focus:ring-emerald-500/20"
                />
                <Input
                  id="address"
                  label="Dirección"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ej: Av. Siempre Viva 742"
                  icon={<MapPin size={18} />}
                  className="bg-white/5 border-white/10 text-white focus:border-emerald-500 focus:ring-emerald-500/20"
                />
              </div>

              {/* Verificación en Dos Pasos (2FA) Badges */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Shield size={14} className="text-teal-400" /> Estado de Canales de Comunicación
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/5 p-3.5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <Phone size={18} className="text-teal-400" />
                    <div>
                      <span className="text-xs font-bold text-white block">Celular: {phone || 'Sin registrar'}</span>
                      <span className="text-[10px] text-slate-400">Notificaciones de turnos y recetas por WhatsApp</span>
                    </div>
                  </div>
                  {user.phoneVerified ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                      <CheckCircle2 size={14} /> Verificado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOtpChannel('phone');
                        setOtpContactValue(phone || '+5493875123456');
                        setIsOtpModalOpen(true);
                      }}
                      className="text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/30 transition"
                    >
                      Validar con PIN
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Medical data */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Datos Médicos</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Blood type select */}
                <div className="space-y-2">
                  <label htmlFor="bloodType" className="block text-xs font-semibold text-slate-400 pl-1">
                    Grupo Sanguíneo
                  </label>
                  <div className="relative">
                    <Heart size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <select
                      id="bloodType"
                      value={bloodType}
                      onChange={(e) => setBloodType(e.target.value)}
                      className="w-full pl-11 pr-10 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-slate-900">Sin especificar</option>
                      {BLOOD_TYPE_OPTIONS.map(bt => (
                        <option key={bt} value={bt} className="bg-slate-900">{bt}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                {/* Birth date */}
                <div className="space-y-2">
                  <label htmlFor="birthDate" className="block text-xs font-semibold text-slate-400 pl-1">
                    Fecha de Nacimiento
                  </label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input
                      id="birthDate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-end items-center gap-4">
              <Link
                to="/"
                className="px-6 py-4 text-slate-400 font-bold hover:text-white transition-colors w-full sm:w-auto text-center order-2 sm:order-1"
              >
                Cancelar
              </Link>
              <Button
                type="submit"
                disabled={isSavingProfile}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 px-8 rounded-2xl shadow-xl shadow-emerald-500/20 disabled:bg-slate-800 disabled:text-slate-600 flex items-center justify-center gap-2 w-full sm:w-auto order-1 sm:order-2"
              >
                {isSavingProfile ? (
                  <><Loader2 size={16} className="animate-spin" /><span>Procesando...</span></>
                ) : (
                  <><Save size={16} /><span>Guardar Cambios</span></>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* ══ SECTION 2: Grupo Familiar ══════════════════════════════════════════ */}
        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                <Users size={20} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Grupo Familiar</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                  Dependientes cubiertos por tu plan
                </p>
              </div>
            </div>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95"
              >
                <Plus size={14} />
                Agregar
              </button>
            )}
          </div>

          {/* Add member form */}
          {showAddForm && (
            <form
              onSubmit={handleAddMember}
              className="mb-6 p-5 bg-slate-900/80 border border-emerald-500/30 rounded-2xl space-y-4 animate-in slide-in-from-top duration-300 shadow-xl"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-emerald-400">Nuevo Familiar</p>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-white transition-colors p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    id="newMemberName"
                    label="Nombre Completo *"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Ej: María García"
                    required
                    icon={<UserIcon size={16} />}
                    className="bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Relation select */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300 pl-1">Relación *</label>
                  <div className="relative">
                    <Heart size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <select
                      value={newMemberRelation}
                      onChange={(e) => setNewMemberRelation(e.target.value)}
                      required
                      className="w-full pl-10 pr-8 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none cursor-pointer font-medium"
                    >
                      {RELATION_OPTIONS.map(r => (
                        <option key={r} value={r} className="bg-slate-900 text-slate-100 py-2">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Birth date */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300 pl-1">Fecha de Nacimiento</label>
                  <div className="relative">
                    <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      value={newMemberBirthDate}
                      onChange={(e) => setNewMemberBirthDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark] font-medium"
                    />
                  </div>
                </div>

                {/* DNI */}
                <div className="sm:col-span-2">
                  <Input
                    id="newMemberDni"
                    label="DNI (opcional)"
                    value={newMemberDni}
                    onChange={(e) => setNewMemberDni(e.target.value)}
                    placeholder="Ej: 30123456"
                    icon={<CreditCard size={16} />}
                    className="bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-5 py-2.5 text-slate-400 font-bold hover:text-white transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingMember || !newMemberName.trim()}
                  className="px-6 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center gap-2"
                >
                  {isSavingMember ? (
                    <><Loader2 size={14} className="animate-spin" /><span>Guardando...</span></>
                  ) : (
                    <><Plus size={14} /><span>Agregar Familiar</span></>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Members list */}
          {isFetchingFamily ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mr-3" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cargando familiares...</p>
            </div>
          ) : familyMembers.length === 0 ? (
            <div className="py-14 text-center border-2 border-dashed border-slate-800/60 rounded-2xl bg-slate-950/20">
              <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-400">
                <Users size={24} />
              </div>
              <p className="text-slate-400 font-bold mb-1">Sin familiares registrados</p>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                Agregá los dependientes cubiertos por tu plan
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {familyMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 hover:border-blue-500/20 rounded-2xl transition-all group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 text-sm font-bold flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{member.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest px-2 py-0.5 bg-blue-500/10 rounded-full">
                          {member.relation}
                        </span>
                        {member.age > 0 && (
                          <span className="text-[10px] font-bold text-slate-500">{member.age} años</span>
                        )}
                        {member.dni && (
                          <span className="text-[10px] font-mono text-slate-600">DNI: {member.dni}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={removingId === member.id}
                    title="Eliminar familiar"
                    className="ml-4 w-9 h-9 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 flex-shrink-0 disabled:opacity-40"
                  >
                    {removingId === member.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ContactValidationModal
        isOpen={isOtpModalOpen}
        onClose={() => setIsOtpModalOpen(false)}
        userId={user.id}
        channel={otpChannel}
        contactValue={otpContactValue}
        onSuccess={() => {
          onLogin({ ...user, phoneVerified: true, phone: otpContactValue });
          toast('¡Canal de contacto verificado con éxito!', 'success');
        }}
      />
    </div>
  );
};

export default Profile;
