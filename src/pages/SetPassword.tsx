import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { supabase } from '../services/supabase';
import logoMedinex from '../logo_medinex.jpeg';

// D2/D5 state machine:
// verifying (on-mount verifyOtp) -> ready | invalid (expired/used/absent
// token — offers the admin manual-reset path, no self-service resend)
// ready -> submitting -> success (signOut() + redirect to /login) | error (retryable)
type Status = 'verifying' | 'ready' | 'submitting' | 'success' | 'invalid' | 'error';

const SetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  // Judgment Day finding: verifyOtp establishes a real, persisted Auth
  // session for this recovery token. If the affiliate abandons this page
  // (closes the tab, navigates away) before finishing — or before the error
  // path lets them retry — that session stayed alive indefinitely on a
  // possibly-shared device. Tracks whether we owe a signOut() on unmount;
  // cleared once handleSubmit's own signOut() (success path) has run.
  const sessionEstablishedRef = useRef(false);

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');

    if (!tokenHash) {
      setStatus('invalid');
      return;
    }

    let cancelled = false;

    (async () => {
      const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
      if (cancelled) return;
      if (!error) sessionEstablishedRef.current = true;
      setStatus(error ? 'invalid' : 'ready');
    })();

    return () => {
      cancelled = true;
      if (sessionEstablishedRef.current) {
        sessionEstablishedRef.current = false;
        supabase.auth.signOut();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Las contraseñas no coinciden.');
      return;
    }

    setStatus('submitting');

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setFormError(error.message || 'Error al actualizar la contraseña.');
      setStatus('error');
      return;
    }

    setStatus('success');
    sessionEstablishedRef.current = false;
    await supabase.auth.signOut();
    navigate('/login');
  };

  const showForm = status === 'ready' || status === 'submitting' || status === 'error';

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 md:p-12">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-md border border-gray-100 flex items-center justify-center p-2 mb-4">
            <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Activá tu cuenta</h1>
        </div>

        {status === 'verifying' && (
          <div className="flex flex-col items-center gap-3 text-gray-500 py-6">
            <Loader2 className="animate-spin" size={28} />
            <p>Verificando enlace...</p>
          </div>
        )}

        {status === 'invalid' && (
          <div className="flex items-start space-x-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>
              El enlace de activación no es válido o venció. Contactate con administración
              para que te restablezcan la contraseña.
            </span>
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-start space-x-2 text-teal-700 bg-teal-50 p-4 rounded-lg text-sm">
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
            <span>Contraseña creada correctamente. Redirigiendo al inicio de sesión...</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="set-password-new"
              label="Nueva Contraseña"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={18} />}
              labelClassName="!text-gray-700 font-bold"
              className="!text-slate-900 !bg-white !border-gray-300 focus:!border-teal-500 focus:!ring-teal-500/20 font-semibold placeholder:!text-gray-400"
            />
            <Input
              id="set-password-confirm"
              label="Confirmar Contraseña"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              icon={<Lock size={18} />}
              labelClassName="!text-gray-700 font-bold"
              className="!text-slate-900 !bg-white !border-gray-300 focus:!border-teal-500 focus:!ring-teal-500/20 font-semibold placeholder:!text-gray-400"
            />

            {formError && (
              <div className="flex items-start space-x-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              icon={<ShieldCheck size={20} />}
              className="w-full"
              disabled={status === 'submitting'}
              isLoading={status === 'submitting'}
            >
              Crear Contraseña
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SetPassword;
