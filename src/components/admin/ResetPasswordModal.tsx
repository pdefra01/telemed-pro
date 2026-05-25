import React, { useState } from 'react';
import { Eye, EyeOff, Key, AlertCircle, RefreshCw } from 'lucide-react';
import { authRepository } from '../../repositories/AuthRepository';
import { useToast } from '../../context/ToastContext';

interface ResetPasswordModalProps {
  userId: string;
  userName: string;
  userRole: 'doctor' | 'patient' | 'admin';
  userDni?: string;
  onClose: () => void;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  userId,
  userName,
  userRole,
  userDni,
  onClose,
}) => {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await authRepository.resetPasswordFromAdmin(userId, password);
      toast(`Contraseña restablecida con éxito para ${userName}`, 'success');
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al restablecer la contraseña en el servidor.');
      toast('Error al actualizar contraseña', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDniDefault = () => {
    if (userDni) {
      setPassword(userDni.trim());
      setError(null);
      toast('Contraseña seteada al DNI por defecto.', 'info');
    } else {
      toast('El usuario no posee un DNI registrado.', 'error');
    }
  };

  const handleGenerateRandom = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let generated = '';
    for (let i = 0; i < 8; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(generated);
    setShowPassword(true);
    setError(null);
    toast('Contraseña aleatoria temporal generada.', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#0f172a]/95 border border-white/10 rounded-[2.5rem] p-6 sm:p-8 w-full max-w-md shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-500 to-emerald-500"></div>

        <div className="flex items-center space-x-4 mb-6">
          <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Key size={22} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Soporte Técnico</h3>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">Restablecer Contraseña</p>
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-6">
          <div className="text-xs text-slate-400 font-medium">Usuario Activo:</div>
          <div className="text-sm font-bold text-white mt-1">{userName}</div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 mt-1 bg-emerald-500/10 inline-block px-2 py-0.5 rounded-md">
            {userRole === 'doctor' ? 'Médico' : userRole === 'patient' ? 'Afiliado (Paciente)' : 'Administrador'}
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs rounded-2xl p-3.5 flex items-start space-x-3 mb-6 animate-in slide-in-from-top-2 duration-300">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span className="font-medium leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 relative">
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Nueva Contraseña Temporal</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-4 pr-12 py-3.5 text-white outline-none focus:border-amber-500/50 transition-all font-mono text-sm tracking-widest placeholder:text-slate-600 focus:ring-2 focus:ring-amber-500/10"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
              />
              <button
                type="button"
                className="absolute right-4 top-3.5 text-slate-500 hover:text-white transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            {userRole === 'patient' && userDni && (
              <button
                type="button"
                onClick={handleSetDniDefault}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl border border-white/5 transition-all"
              >
                <span>Usar DNI como clave</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleGenerateRandom}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl border border-white/5 transition-all"
            >
              <RefreshCw size={12} />
              <span>Autogenerar clave</span>
            </button>
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-500 hover:bg-amber-400 text-[#020617] px-8 py-3 rounded-2xl font-bold transition-all disabled:opacity-50 text-sm shadow-[0_0_20px_rgba(245,158,11,0.2)]"
            >
              {isSubmitting ? 'Procesando...' : 'Confirmar Cambio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordModal;
