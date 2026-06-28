import React, { useState, useEffect } from 'react';
import { contactVerificationRepository } from '../../repositories/ContactVerificationRepository';
import { ShieldCheck, Smartphone, Mail, X, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';

interface ContactValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  channel: 'phone' | 'email';
  contactValue: string;
  onSuccess: () => void;
}

export const ContactValidationModal: React.FC<ContactValidationModalProps> = ({
  isOpen,
  onClose,
  userId,
  channel,
  contactValue,
  onSuccess
}) => {
  const [otpCode, setOtpCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  const [resendTimer, setResendTimer] = useState<number>(60);
  const [simulatedCode, setSimulatedCode] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      handleSendChallenge();
    }
  }, [isOpen]);

  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendChallenge = async () => {
    setLoading(true);
    setError('');
    try {
      const challenge = await contactVerificationRepository.createChallenge(userId, channel, contactValue);
      setSimulatedCode(challenge.otpCode);
      setResendTimer(60);
    } catch (err: any) {
      setError(err.message || "Error al solicitar código OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length < 6) {
      setError("Ingresá el código completo de 6 dígitos.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const isOk = await contactVerificationRepository.verifyOtp(userId, channel, otpCode);
      if (isOk) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setError("Código incorrecto. Verificá los 6 dígitos e intentá de nuevo.");
      }
    } catch (err: any) {
      setError(err.message || "Error al verificar el código.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl animate-scale-up">
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5 text-slate-100 font-bold text-base">
            {channel === 'phone' ? <Smartphone className="text-teal-400" size={20} /> : <Mail className="text-teal-400" size={20} />}
            <span>Verificación en Dos Pasos (2FA)</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8 space-y-3 animate-fade-in">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full mx-auto flex items-center justify-center">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-lg font-bold text-slate-100">¡Canal Verificado con Éxito!</h3>
            <p className="text-xs text-slate-400">Tu {channel === 'phone' ? 'celular' : 'correo'} ha sido validado correctamente.</p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="text-center space-y-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-md border border-teal-500/20">
                <ShieldCheck size={14} /> Código enviado a {contactValue}
              </span>
              <p className="text-xs text-slate-400">
                Ingresá el PIN de 6 dígitos que te enviamos para confirmar la propiedad del canal.
              </p>
              
              {/* Demo banner visualizer */}
              {simulatedCode && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-teal-500/30 text-[11px] font-mono text-teal-300">
                  ⚡ [Modo Demo] Código generado: <span className="font-bold text-white tracking-widest">{simulatedCode}</span>
                </div>
              )}
            </div>

            <div>
              <input
                type="text"
                maxLength={6}
                placeholder="0 0 0 0 0 0"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full py-3.5 text-center text-2xl font-mono font-extrabold tracking-[0.4em] bg-slate-950 border border-slate-700 rounded-2xl text-slate-100 focus:outline-none focus:border-teal-500 placeholder:tracking-normal placeholder:text-slate-600"
              />
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              variant="primary"
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full py-3 text-sm font-bold"
            >
              {loading ? 'Verificando PIN...' : 'Confirmar y Validar Canal'}
            </Button>

            <div className="text-center pt-2">
              <button
                type="button"
                disabled={resendTimer > 0 || loading}
                onClick={handleSendChallenge}
                className="text-xs text-slate-400 hover:text-teal-300 disabled:opacity-40 transition flex items-center justify-center gap-1.5 mx-auto"
              >
                <RefreshCw size={14} />
                <span>{resendTimer > 0 ? `Reenviar código en ${resendTimer}s` : 'Solicitar un nuevo código'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
