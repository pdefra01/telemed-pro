import React, { useState } from 'react';
import { User, Role } from '../types';
import { MOCK_PATIENT, MOCK_DOCTORS } from '../constants';
import { Phone, CreditCard, Mail, Lock, ArrowRight, ShieldCheck, Stethoscope, Building, UserCircle, AlertCircle, User as UserIcon, Briefcase } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { dniSchema, phoneSchema } from '../utils/validation';
import { z } from 'zod';
import { authRepository } from '../repositories/AuthRepository';
import { isEmailLike, toLegacyPatientEmail } from '../utils/patientIdentifier';
import { getBranding } from '../config/branding';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const branding = getBranding();
  const [isRegistering, setIsRegistering] = useState(false);
  const [method, setMethod] = useState<'phone' | 'dni' | 'email' | 'google'>('dni');
  const [role, setRole] = useState<Role>('patient');
  
  const [fullName, setFullName] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [patientDni, setPatientDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setError('');
    setInputValue('');
    setPatientDni('');
    setIsRegistering(false); // Force login-only mode for doctors and admins
    if (newRole === 'patient') {
      setMethod('dni'); // Default to DNI for patients
    } else {
      setMethod('email'); // Doctors and Admins use email
    }
  };

  const handleMethodChange = (newMethod: 'phone' | 'dni' | 'email' | 'google') => {
    setMethod(newMethod);
    setError('');
    setInputValue('');
    setPatientDni('');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (role === 'patient' && !isRegistering) {
        // D6: bounded patient-login sequence — resolve exactly ONE auth
        // email (real email as typed, or the legacy DNI/phone mapping) and
        // attempt login exactly once, no retry.
        if (password.length < 6) {
          throw new Error("La contraseña debe tener al menos 6 caracteres");
        }

        const emailAsTyped = isEmailLike(inputValue);
        const authEmail = emailAsTyped ? inputValue : toLegacyPatientEmail(inputValue);

        try {
          const userResult = await authRepository.login(authEmail, password, role);
          onLogin(userResult);
        } catch (err: any) {
          if (!emailAsTyped && err.code === 'invalid_credentials') {
            throw new Error('No encontramos una cuenta con ese documento. Si tu afiliación fue aprobada, iniciá sesión con tu correo electrónico.');
          }
          throw err;
        }
      } else {
        // 1. Validaciones de UI
        const isEmailReal = role !== 'patient' || inputValue.includes('@');

        if (role === 'patient') {
          if (!isEmailReal) {
            if (inputValue.length > 8) {
              phoneSchema.parse(inputValue);
            } else {
              dniSchema.parse(inputValue);
            }
          } else {
            // Si usa correo real para registrarse, el DNI es obligatorio
            if (isRegistering) {
              dniSchema.parse(patientDni);
            }
          }
        }
        if (password.length < 6) {
          throw new Error("La contraseña debe tener al menos 6 caracteres");
        }
        if (isRegistering && !fullName.trim()) {
          throw new Error("Por favor, ingresá tu nombre completo");
        }

        // 2. Magia de la Opción C: Transformar DNI/Tel en Email Falso
        let authEmail = inputValue;
        let targetDni = undefined;

        if (role === 'patient') {
          if (!isEmailReal) {
            if (inputValue.length > 8) { // Mapeo de celular
              const cleanPhone = inputValue.replace(/\D/g, ''); // Quita espacios/guiones
              authEmail = `${cleanPhone}@medinex-paciente.com`;
              targetDni = cleanPhone;
            } else { // Mapeo de DNI
              authEmail = `${inputValue}@medinex-paciente.com`;
              targetDni = inputValue;
            }
          } else {
            // Usa correo real
            authEmail = inputValue;
            targetDni = isRegistering ? patientDni : undefined;
          }
        }

        // 3. Llamar a la Capa de Repositorio (Clean Architecture)
        let userResult: User;
        if (isRegistering) {
          userResult = await authRepository.registerPatient(authEmail, password, fullName, role, targetDni);
        } else {
          userResult = await authRepository.login(authEmail, password, role);
        }

        onLogin(userResult);
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else {
        setError(err.message || "Ocurrió un error inesperado.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getPortalTitle = () => {
    switch (role) {
      case 'patient': return 'Portal del Paciente';
      case 'doctor': return 'Acceso Profesionales';
      case 'admin': return 'Administración';
      case 'advisor': return 'Portal del Asesor';
    }
  };

  const getPortalDescription = () => {
    switch (role) {
      case 'patient': return isRegistering ? 'Crea tu cuenta para gestionar tu salud' : 'Ingresa para gestionar turnos y recetas';
      case 'doctor': return 'Accede a tu agenda y pacientes';
      case 'admin': return 'Gestión integral de la plataforma';
      case 'advisor': return 'Accede a tu consola comercial y comisiones';
    }
  };

  return (
    <div className={`min-h-screen ${branding.id === 'cosegurototal' ? 'bg-gradient-to-br from-[#003366] via-[#002244] to-[#0a1128]' : 'bg-gradient-to-br from-teal-500 to-cyan-700'} flex items-center justify-center p-4`}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex overflow-hidden min-h-[650px]">

        {/* Left Side: Branding & Info */}
        <div className="hidden md:flex w-5/12 bg-gray-50 p-12 flex-col justify-between relative overflow-hidden">
          <img
            src={role === 'doctor'
              ? "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1350&q=80" 
              : "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" 
            }
            alt="Medical Context"
            className="absolute inset-0 w-full h-full object-cover opacity-15 transition-opacity duration-500"
          />

          <div className="relative z-10 text-center flex flex-col items-center">
            <div className="flex flex-col items-center space-y-4 mb-8">
              <div className="w-48 h-48 bg-white rounded-[2.5rem] shadow-xl border border-gray-100 flex items-center justify-center p-4 hover:scale-105 transition-transform duration-500 select-none">
                <img src={branding.logo} alt={`${branding.name} Logo`} className="w-full h-full object-contain" />
              </div>
              {branding.id === 'cosegurototal' ? (
                <div className="text-center">
                  <h1 className="text-3xl font-black tracking-tight text-[#003366]">
                    COSEGURO <span className="text-[#d90429]">TOTAL</span>
                  </h1>
                  <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mt-1">
                    {branding.tagline}
                  </p>
                </div>
              ) : (
                <h1 className="text-4xl font-extrabold tracking-[0.05em] text-[#002f54]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  MED<span className="text-[#0dbda9]">IN</span>EX
                </h1>
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4 leading-tight">
              {role === 'patient' && (branding.id === 'cosegurototal' ? branding.subTagline : "Tu salud, en tus manos.")}
              {role === 'doctor' && "Optimiza tu práctica médica."}
              {role === 'admin' && "Gestión eficiente y segura."}
              {role === 'advisor' && "Hacé crecer tu cartera de afiliados."}
            </h2>
            <p className="text-gray-600 text-sm max-w-sm">
              {role === 'patient' && "Atención médica de calidad desde la comodidad de tu hogar."}
              {role === 'doctor' && "Historia clínica digital, videoconsultas y gestión de turnos simplificada."}
              {role === 'admin' && "Control total de afiliados, prestadores y métricas de rendimiento."}
              {role === 'advisor' && "Compartí tu enlace, sumá afiliados y seguí tus comisiones en tiempo real."}
            </p>
          </div>

          <div className="relative z-10 space-y-4 flex justify-center w-full">
            <div className="flex items-center space-x-3 text-teal-700 justify-center">
              <ShieldCheck className="w-6 h-6" />
              <span className="font-medium text-sm">Plataforma Segura (Supabase)</span>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full md:w-7/12 p-8 md:p-12 flex flex-col">

          {/* Logo on Mobile */}
          <div className="md:hidden flex flex-col items-center mb-6">
            <div className="w-20 h-20 bg-white rounded-2xl shadow-md border border-gray-100 flex items-center justify-center p-2">
              <img src={branding.logo} alt={`${branding.name} Logo`} className="w-full h-full object-contain" />
            </div>
            {branding.id === 'cosegurototal' ? (
              <span className="text-2xl font-black tracking-tight text-[#003366] mt-2">
                COSEGURO <span className="text-[#d90429]">TOTAL</span>
              </span>
            ) : (
              <span className="text-3xl font-extrabold tracking-[0.05em] text-[#002f54] mt-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                MED<span className="text-[#0dbda9]">IN</span>EX
              </span>
            )}
          </div>

          {/* Role Tabs */}
          <div className="flex p-1 bg-gray-100 rounded-xl mb-8 self-center w-full max-w-lg">
            <button
              type="button"
              onClick={() => handleRoleChange('patient')}
              aria-label="Pacientes"
              className={`flex-1 flex items-center justify-center py-2 px-1 sm:px-2 rounded-lg text-sm font-semibold transition-all duration-200 ${role === 'patient' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <UserCircle size={16} className="shrink-0" aria-hidden="true" /> <span className="hidden sm:inline ml-1.5">Pacientes</span>
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('doctor')}
              aria-label="Médicos"
              className={`flex-1 flex items-center justify-center py-2 px-1 sm:px-2 rounded-lg text-sm font-semibold transition-all duration-200 ${role === 'doctor' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <Stethoscope size={16} className="shrink-0" aria-hidden="true" /> <span className="hidden sm:inline ml-1.5">Médicos</span>
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('admin')}
              aria-label="Admin"
              className={`flex-1 flex items-center justify-center py-2 px-1 sm:px-2 rounded-lg text-sm font-semibold transition-all duration-200 ${role === 'admin' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <Building size={16} className="shrink-0" aria-hidden="true" /> <span className="hidden sm:inline ml-1.5">Admin</span>
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('advisor')}
              aria-label="Asesores"
              className={`flex-1 flex items-center justify-center py-2 px-1 sm:px-2 rounded-lg text-sm font-semibold transition-all duration-200 ${role === 'advisor' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <Briefcase size={16} className="shrink-0" aria-hidden="true" /> <span className="hidden sm:inline ml-1.5">Asesores</span>
            </button>
          </div>

          <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2 transition-all">{getPortalTitle()}</h2>
              <p className="text-gray-500">{getPortalDescription()}</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              
              {isRegistering && (
                <div className="mb-4 animate-fade-in">
                  <Input
                    label="Nombre Completo"
                    type="text"
                    placeholder="Juan Pérez"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setError('');
                    }}
                    icon={<UserIcon size={18} />}
                    labelClassName="!text-gray-700 font-bold"
                    className="!text-slate-900 !bg-white !border-gray-300 focus:!border-teal-500 focus:!ring-teal-500/20 font-semibold placeholder:!text-gray-400"
                  />
                </div>
              )}

              {/* Dynamic Input Field */}
              <div className="mb-4">
                <Input
                  id="auth-identifier"
                  label={role === 'patient'
                    ? (isRegistering ? 'Celular N°' : 'Correo Electrónico')
                    : 'Correo Electrónico'
                  }
                  type={role === 'patient' ? 'text' : 'text'}
                  placeholder={
                    role === 'patient'
                      ? (isRegistering ? 'Ej: 3876123899' : 'nombre@ejemplo.com')
                      : 'nombre@ejemplo.com'
                  }
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setError('');
                  }}
                  error={error && !error.includes('contraseña') && !(role === 'patient' && !isRegistering) ? error : undefined}
                  icon={
                    role === 'patient'
                      ? (inputValue.includes('@') ? <Mail size={18} /> : <CreditCard size={18} />)
                      : <Mail size={18} />
                  }
                  labelClassName="!text-gray-700 font-bold"
                  className="!text-slate-900 !bg-white !border-gray-300 focus:!border-teal-500 focus:!ring-teal-500/20 font-semibold placeholder:!text-gray-400"
                />
              </div>

              {/* Conditional DNI for Email Patient Registration */}
              {role === 'patient' && isRegistering && inputValue.includes('@') && (
                <div className="mb-4 animate-fade-in">
                  <Input
                    label="DNI / Documento (Obligatorio para cobertura)"
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Sin puntos (ej: 32111222)"
                    value={patientDni}
                    onChange={(e) => {
                      setPatientDni(e.target.value);
                      setError('');
                    }}
                    icon={<CreditCard size={18} />}
                    labelClassName="!text-gray-700 font-bold"
                    className="!text-slate-900 !bg-white !border-gray-300 focus:!border-teal-500 focus:!ring-teal-500/20 font-semibold placeholder:!text-gray-400"
                  />
                </div>
              )}

              <div className="mb-6">
                <Input
                  id="auth-password"
                  label="Contraseña"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={18} />}
                  error={error && error.includes('contraseña') ? error : undefined}
                  labelClassName="!text-gray-700 font-bold"
                  className="!text-slate-900 !bg-white !border-gray-300 focus:!border-teal-500 focus:!ring-teal-500/20 font-semibold placeholder:!text-gray-400"
                />
              </div>

              {error && (
                <div className="flex items-start space-x-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm animate-fade-in">
                  <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                icon={<ArrowRight size={20} />}
                className={`w-full ${branding.id === 'cosegurototal' ? 'bg-[#003366] hover:bg-[#002244] focus:ring-[#003366] shadow-[#003366]/20' : ''}`}
                disabled={isLoading}
              >
                {isLoading ? 'Cargando...' : (isRegistering ? 'Registrarse' : 'Ingresar')}
              </Button>
            </form>

            {role === 'patient' && (
              <div className="mt-8 text-center animate-fade-in">
                <p className="text-gray-600">
                  ¿Sos nuevo?
                  <a
                    href="#/adhesion?promoter=LANDING"
                    className="ml-2 text-teal-600 font-bold hover:underline"
                  >
                    Adherite al servicio
                  </a>
                </p>
              </div>
            )}

            {role === 'admin' && (
              <div className="mt-8 text-center animate-fade-in">
                <p className="text-gray-600">
                  {isRegistering ? '¿Ya tenés cuenta?' : '¿Sos nuevo?'}
                  <button
                    type="button"
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="ml-2 text-teal-600 font-bold hover:underline"
                  >
                    {isRegistering ? 'Iniciá sesión' : 'Registrate'}
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;