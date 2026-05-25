import React, { useState } from 'react';
import { User, Role } from '../types';
import { MOCK_PATIENT, MOCK_DOCTORS } from '../constants';
import { Phone, CreditCard, Mail, Lock, ArrowRight, ShieldCheck, Stethoscope, Building, UserCircle, AlertCircle, User as UserIcon } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { dniSchema, phoneSchema } from '../utils/validation';
import { z } from 'zod';
import { authRepository } from '../repositories/AuthRepository';
import logoMedinex from '../logo_medinex.jpeg';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
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
    }
  };

  const getPortalDescription = () => {
    switch (role) {
      case 'patient': return isRegistering ? 'Crea tu cuenta para gestionar tu salud' : 'Ingresa para gestionar turnos y recetas';
      case 'doctor': return 'Accede a tu agenda y pacientes';
      case 'admin': return 'Gestión integral de la plataforma';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center p-4">
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
                <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-[0.05em] text-[#002f54]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                MED<span className="text-[#0dbda9]">IN</span>EX
              </h1>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4 leading-tight">
              {role === 'patient' && "Tu salud, en tus manos."}
              {role === 'doctor' && "Optimiza tu práctica médica."}
              {role === 'admin' && "Gestión eficiente y segura."}
            </h2>
            <p className="text-gray-600 text-sm max-w-sm">
              {role === 'patient' && "Atención médica de calidad desde la comodidad de tu hogar."}
              {role === 'doctor' && "Historia clínica digital, videoconsultas y gestión de turnos simplificada."}
              {role === 'admin' && "Control total de afiliados, prestadores y métricas de rendimiento."}
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
            <div className="w-16 h-16 bg-white rounded-2xl shadow-md border border-gray-100 flex items-center justify-center p-1.5">
              <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-2xl font-extrabold tracking-[0.05em] text-[#002f54] mt-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              MED<span className="text-[#0dbda9]">IN</span>EX
            </span>
          </div>

          {/* Role Tabs */}
          <div className="flex p-1 bg-gray-100 rounded-xl mb-8 self-center w-full max-w-md">
            <button
              type="button"
              onClick={() => handleRoleChange('patient')}
              className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${role === 'patient' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <UserCircle size={18} className="mr-2" /> Pacientes
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('doctor')}
              className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${role === 'doctor' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <Stethoscope size={18} className="mr-2" /> Médicos
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('admin')}
              className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${role === 'admin' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <Building size={18} className="mr-2" /> Admin
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
                  />
                </div>
              )}

              {/* Dynamic Input Field */}
              <div className="mb-4">
                <Input
                  label={role === 'patient'
                    ? 'DNI, Celular o Correo Electrónico'
                    : 'Correo Electrónico'
                  }
                  type={role === 'patient' ? 'text' : 'text'}
                  placeholder={
                    role === 'patient'
                      ? 'Ej: 32111222 o juan@gmail.com'
                      : 'nombre@ejemplo.com'
                  }
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setError('');
                  }}
                  error={error && !error.includes('contraseña') ? error : undefined}
                  icon={
                    role === 'patient'
                      ? (inputValue.includes('@') ? <Mail size={18} /> : <CreditCard size={18} />)
                      : <Mail size={18} />
                  }
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
                  />
                </div>
              )}

              <div className="mb-6">
                <Input
                  label="Contraseña"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={18} />}
                  error={error && error.includes('contraseña') ? error : undefined}
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
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Cargando...' : (isRegistering ? 'Registrarse' : 'Ingresar')}
              </Button>
            </form>

            <div className="mt-8 text-center">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;