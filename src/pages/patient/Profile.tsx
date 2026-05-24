import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  User as UserIcon, Mail, Phone, MapPin, 
  CreditCard, Shield, ArrowLeft, Loader2, Save
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Patient } from '../../types';
import { affiliateRepository } from '../../repositories/AffiliateRepository';

interface ProfileProps {
  user: Patient;
  onLogin: (updatedUser: Patient) => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onLogin }) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [address, setAddress] = useState(user.address || '');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast('El nombre completo no puede estar vacío', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const updatedUser = await affiliateRepository.updateAffiliate(user.id, {
        name,
        phone,
        address,
      });

      // Update both Context State and LocalStorage so active layouts refresh immediately
      onLogin(updatedUser);
      localStorage.setItem('medinex_user', JSON.stringify(updatedUser));
      
      toast('Perfil actualizado con éxito', 'success');
      navigate('/');
    } catch (error: any) {
      console.error('Error al actualizar el perfil:', error);
      toast(error.message || 'Error al guardar los cambios', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 sm:p-6 md:p-8 space-y-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 relative overflow-hidden shadow-3xl animate-in fade-in duration-700 pb-20 max-w-3xl mx-auto">
      {/* Background Decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 space-y-10">
        {/* Header section */}
        <div className="flex items-center space-x-4">
          <Link 
            to="/" 
            className="w-12 h-12 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl flex items-center justify-center transition-all flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-1">Mi Ecosistema</h2>
            <h1 className="text-4xl font-bold text-white tracking-tight">Editar Perfil</h1>
          </div>
        </div>

      {/* Glassmorphic card */}
      <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
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
            <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest mt-1">Afiliado Certificado</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Read-Only Identity Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 bg-black/20 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 mb-8">
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
                value={user.planName || 'Plan Base'}
                readOnly
                disabled
                icon={<Shield size={18} />}
                className="bg-white/5 border-white/5 text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Editable Contact Fields */}
          <div className="space-y-6">
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
                label="Número de Teléfono"
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
          </div>

          {/* Save Button */}
          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-end items-center gap-4 sm:space-x-4">
            <Link 
              to="/" 
              className="px-6 py-4 text-slate-400 font-bold hover:text-white transition-colors w-full sm:w-auto text-center order-2 sm:order-1"
            >
              Cancelar
            </Link>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 px-8 rounded-2xl shadow-xl shadow-emerald-500/20 disabled:bg-slate-800 disabled:text-slate-600 flex items-center justify-center gap-2 w-full sm:w-auto order-1 sm:order-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar Cambios</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
};

export default Profile;
