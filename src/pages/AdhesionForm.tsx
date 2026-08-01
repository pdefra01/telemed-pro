import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, CreditCard, Users, HeartPulse, FileText, CheckCircle2, 
  ArrowLeft, ArrowRight, Plus, Trash2, ShieldAlert, Sparkles, Loader2, RefreshCw 
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { adhesionRepository, AdhesionRequest } from '../repositories/AdhesionRepository';
import { planRepository } from '../repositories/PlanRepository';
import { Plan } from '../types';
import logoMedinex from '../logo_medinex.jpeg';

// Toggle to suspend email OTP verification without removing the feature.
// Mirrored by EMAIL_VERIFICATION_REQUIRED in server.js — flip both together.
const EMAIL_VERIFICATION_REQUIRED = false;

// Glass Container for Step Card
const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl ${className}`}>
    {children}
  </div>
);

export const AdhesionForm: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [promoterCode, setPromoterCode] = useState(searchParams.get('promoter') || '');
  const isPromoterLocked = !!searchParams.get('promoter');

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [titular, setTitular] = useState({
    firstName: '',
    lastName: '',
    dni: '',
    cuil: '',
    birthDate: '',
    address: '',
    locality: '',
    neighborhood: '',
    email: '',
    phone: '',
    civilStatus: 'Soltero/a',
    healthInsurance: '',
  });

  const [activePlan, setActivePlan] = useState<Plan | null>(null);

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const plans = await planRepository.getAll();
        const defaultOrMedinex = plans.find(p => p.isDefault) || plans.find(p => p.name === 'Plan Familiar Medinex') || plans[0];
        if (defaultOrMedinex) {
          setActivePlan(defaultOrMedinex);
        }
      } catch (err) {
        console.warn("Could not load plans dynamically from DB, using fallback values", err);
      }
    };
    loadPlan();
  }, []);

  const baseMonthlyCost = activePlan ? activePlan.monthlyCost : 25000;
  const maxFamilyMembersCount = activePlan ? activePlan.maxFamilyMembers : 4;
  const planDisplayName = activePlan ? activePlan.name : 'Plan Familiar Medinex';
  const debitMonthlyCost = Math.round(baseMonthlyCost * 0.8);
  const prepaid6TotalCost = debitMonthlyCost * 6;
  const prepaid12TotalCost = debitMonthlyCost * 12;

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-AR')}`;

  const [plan, setPlan] = useState({
    type: 'Plan Familiar Medinex',
    paymentMethod: 'debit', // 'monthly' | 'debit' | 'prepaid_6' | 'prepaid_12'
    paymentDetail: 'Tarjeta de Crédito',
  });

  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [newFamilyMember, setNewFamilyMember] = useState({
    firstName: '',
    lastName: '',
    dni: '',
    cuil: '',
    birthDate: '',
    parentesco: 'cónyuge',
    sexo: 'Femenino',
  });

  const [medical, setMedical] = useState({
    history: [] as string[],
    historyOther: '',
    discoverySource: 'Vendedor',
    discoveryOther: '',
    preferredContactTime: 'Cualquier horario',
    recommendedFriendPhone: '',
  });

  const [consents, setConsents] = useState({
    dataTreatment: false,
    promotions: false,
  });

  // Email verification OTP states
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Canvas ref for signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  // MP Preapproval link for debit subscriptions
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null);

  // Countdown timer para el reenvío de OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendEmailOtp = async () => {
    if (!titular.email || !titular.email.includes('@')) {
      toast("Ingresá un correo electrónico válido primero.", "warning");
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await fetch('/api/email-verification/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: titular.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setOtpSent(true);
      setCountdown(60);
      toast("Código de verificación enviado a tu correo.", "success");
    } catch (error: any) {
      toast(error.message || "Error al enviar el código de verificación.", "error");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const verifyEmailOtp = async () => {
    if (!otpCode || otpCode.length < 6) {
      toast("Ingresá el código de 6 dígitos.", "warning");
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const res = await fetch('/api/email-verification/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: titular.email, code: otpCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setIsEmailVerified(true);
      toast("¡Correo electrónico verificado exitosamente!", "success");
    } catch (error: any) {
      toast(error.message || "Código de verificación inválido.", "error");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const medicalOptions = [
    'Ninguno', 'Diabetes', 'Obesidad', 'Cardiopatía',
    'Hipertensión Arterial', 'Hipotiroidismo', 'Alergias', 'Diálisis',
    'Celiaquía', 'EPOC', 'Problemas Renales', 'Enfermedades Autoinmunes',
    'Dolores Crónicos', 'Asma', 'Embarazo', 'Medicación Permanente',
    'Discapacidad'
  ];

  // Initialize Canvas listeners
  useEffect(() => {
    if (step === 5 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#34d399'; // Emerald-400
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [step]);

  // Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      // Check if canvas is not blank
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        setHasSigned(true);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (e.type === 'mousedown' || e.type === 'touchstart') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSigned(false);
    }
  };

  const toggleMedicalOption = (opt: string) => {
    if (opt === 'Ninguno') {
      setMedical(prev => ({ ...prev, history: ['Ninguno'] }));
      return;
    }

    setMedical(prev => {
      let nextHistory = prev.history.filter(h => h !== 'Ninguno');
      if (nextHistory.includes(opt)) {
        nextHistory = nextHistory.filter(h => h !== opt);
      } else {
        nextHistory.push(opt);
      }
      return { ...prev, history: nextHistory };
    });
  };

  const addFamilyMember = () => {
    if (!newFamilyMember.firstName || !newFamilyMember.lastName || !newFamilyMember.dni || !newFamilyMember.cuil || !newFamilyMember.birthDate) {
      toast("Completá todos los campos del integrante familiar", "warning");
      return;
    }

    // CUIL must normalize to 11 numeric digits, with or without dashes (NN-DDDDDDDD-C)
    if (!/^\d{11}$/.test(newFamilyMember.cuil.replace(/\D/g, ''))) {
      toast("El CUIL del familiar debe tener 11 dígitos, con o sin guiones (formato NN-DDDDDDDD-C)", "warning");
      return;
    }

    if (familyMembers.length >= maxFamilyMembersCount) {
      toast(`El ${planDisplayName} incluye hasta ${maxFamilyMembersCount} integrantes adicionales al titular`, "warning");
      return;
    }

    // Guardar familiar mapeando nombres divididos y también full name para compatibilidad
    const mappedMember = {
      firstName: newFamilyMember.firstName,
      lastName: newFamilyMember.lastName,
      first_name: newFamilyMember.firstName,
      last_name: newFamilyMember.lastName,
      name: `${newFamilyMember.firstName} ${newFamilyMember.lastName}`.trim(),
      dni: newFamilyMember.dni,
      cuil: newFamilyMember.cuil,
      birthDate: newFamilyMember.birthDate,
      parentesco: newFamilyMember.parentesco,
      sexo: newFamilyMember.sexo
    };

    setFamilyMembers(prev => [...prev, mappedMember]);
    setNewFamilyMember({
      firstName: '',
      lastName: '',
      dni: '',
      cuil: '',
      birthDate: '',
      parentesco: 'cónyuge',
      sexo: 'Femenino',
    });
    toast("Familiar agregado al grupo", "success");
  };

  const removeFamilyMember = (index: number) => {
    setFamilyMembers(prev => prev.filter((_, i) => i !== index));
  };

  const handleNextStep = () => {
    // Validations
    if (step === 1) {
      if (!titular.firstName || !titular.lastName || !titular.dni || !titular.cuil || !titular.birthDate || !titular.address || !titular.locality || !titular.neighborhood || !titular.email || !titular.phone) {
        toast("Por favor completá todos los campos obligatorios del titular", "warning");
        return;
      }
      // DNI must be 7 or 8 numeric digits only (B-6)
      if (!/^\d{7,8}$/.test(titular.dni.trim())) {
        toast("El DNI debe contener entre 7 y 8 dígitos numéricos sin espacios ni puntos", "warning");
        return;
      }
      // CUIL must normalize to 11 numeric digits, with or without dashes (NN-DDDDDDDD-C)
      if (!/^\d{11}$/.test(titular.cuil.replace(/\D/g, ''))) {
        toast("El CUIL debe tener 11 dígitos, con o sin guiones (formato NN-DDDDDDDD-C)", "warning");
        return;
      }
      if (!titular.email.includes('@')) {
        toast("Ingresá un correo electrónico válido", "warning");
        return;
      }
      if (EMAIL_VERIFICATION_REQUIRED && !isEmailVerified) {
        toast("Por favor verificá tu correo electrónico antes de avanzar", "warning");
        return;
      }
    }

    setStep(prev => prev + 1);
  };

  const handleSubmit = async () => {
    if (!consents.dataTreatment) {
      toast("Debés autorizar el tratamiento de datos personales para afiliarte", "warning");
      return;
    }

    if (!hasSigned || !canvasRef.current) {
      toast("Por favor dibujá tu firma en el panel", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const signature_base64 = canvasRef.current.toDataURL();
      
      const payload: AdhesionRequest = {
        titular_first_name: titular.firstName,
        titular_last_name: titular.lastName,
        titular_name: `${titular.firstName} ${titular.lastName}`.trim(),
        titular_dni: titular.dni,
        titular_cuil: titular.cuil,
        titular_birth_date: titular.birthDate,
        titular_address: titular.address,
        titular_locality: titular.locality,
        titular_neighborhood: titular.neighborhood,
        titular_email: titular.email,
        titular_phone: titular.phone,
        titular_civil_status: titular.civilStatus,
        titular_health_insurance: titular.healthInsurance,
        discovery_source: medical.discoverySource,
        discovery_other: medical.discoveryOther,
        preferred_contact_time: medical.preferredContactTime,
        plan_type: plan.type,
        payment_method: plan.paymentMethod,
        payment_detail: plan.paymentDetail,
        family_members: familyMembers,
        medical_history: medical.history,
        medical_history_other: medical.historyOther,
        recommended_friend_phone: medical.recommendedFriendPhone,
        consent_data_treatment: consents.dataTreatment,
        consent_promotions: consents.promotions,
        signature_base64,
        promoter_id: promoterCode,
        email_verified: EMAIL_VERIFICATION_REQUIRED ? isEmailVerified : true
      };

      const { id: adhesionRequestId } = await adhesionRepository.submitApplication(payload);

      // Débito automático: best-effort MP preapproval creation. On failure
      // the form still completes (Resolved Decision #5) — enrollment is
      // best-effort, adhesion approval is not blocked by it. The manual/
      // Checkout Pro payment path remains available regardless.
      if (plan.paymentMethod === 'debit') {
        try {
          const preapprovalRes = await fetch('/api/adhesion/preapproval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adhesionRequestId })
          });
          const preapprovalResult = await preapprovalRes.json().catch(() => ({ ok: false }));
          if (!preapprovalResult.ok) {
            console.warn('[AdhesionForm] No se pudo crear la suscripción de débito automático en Mercado Pago; la solicitud continúa.');
          } else if (preapprovalResult.initPoint) {
            setMpInitPoint(preapprovalResult.initPoint);
          }
        } catch (mpError) {
          console.warn('[AdhesionForm] Error al contactar el servicio de Mercado Pago; la solicitud continúa.', mpError);
        }
      }

      setStep(6); // Success screen
      toast("Solicitud de adhesión enviada con éxito!", "success");
    } catch (err: any) {
      toast(err.message || "Error al procesar la solicitud. Reintentá.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getPaymentMethodLabel = () => {
    switch (plan.paymentMethod) {
      case 'monthly': return 'Pago Mensual ($50.000/mes)';
      case 'debit': return 'Débito Automático TC ($40.000/mes - 20% OFF)';
      case 'prepaid_6': return 'Prepago 6 meses (Pago Único - Cobertura 7 meses)';
      case 'prepaid_12': return 'Prepago 12 meses (Pago Único - Cobertura 14 meses)';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 relative">
      {/* Ambient background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[130px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-500/10 blur-[130px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between items-center border-b border-white/5 gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center p-1.5 shadow-xl border border-white/10">
            <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="font-extrabold text-2xl tracking-[0.05em] bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              MED<span className="text-[#0dbda9]">IN</span>EX
            </h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-bold">Solicitud de Adhesión</p>
          </div>
        </div>
        {step < 6 && (
          <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-400 backdrop-blur-md">
            <span>Paso {step} de 5</span>
            <div className="w-20 bg-slate-800 h-1.5 rounded-full overflow-hidden ml-2 border border-white/5">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${(step / 5) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10 w-full max-w-4xl mx-auto px-6 py-12 flex items-center justify-center">
        {step === 1 && (
          <GlassCard className="w-full animate-in fade-in zoom-in duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                <User size={24} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white">1. Datos del Titular</h2>
            </div>
            <p className="text-slate-400 text-sm mb-8">Completá la información del afiliado titular de la cuenta.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Nombre *</label>
                  <input 
                    type="text" 
                    placeholder="Juan"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                    value={titular.firstName}
                    onChange={(e) => setTitular({ ...titular, firstName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Apellido *</label>
                  <input 
                    type="text" 
                    placeholder="Pérez"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                    value={titular.lastName}
                    onChange={(e) => setTitular({ ...titular, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">DNI *</label>
                <input
                  type="number"
                  placeholder="Sin puntos ni espacios"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={titular.dni}
                  onChange={(e) => setTitular({ ...titular, dni: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">CUIL *</label>
                <input
                  type="text"
                  placeholder="Ej: 20-12345678-9"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={titular.cuil}
                  onChange={(e) => setTitular({ ...titular, cuil: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">F. Nacimiento *</label>
                <input 
                  type="date" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={titular.birthDate}
                  onChange={(e) => setTitular({ ...titular, birthDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Estado Civil *</label>
                <select 
                  className="w-full bg-[#0f172a] border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={titular.civilStatus}
                  onChange={(e) => setTitular({ ...titular, civilStatus: e.target.value })}
                >
                  <option value="Soltero/a">Soltero/a</option>
                  <option value="Casado/a">Casado/a</option>
                  <option value="Unión convivencial">Unión convivencial</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Domicilio *</label>
                <input 
                  type="text" 
                  placeholder="Ej: Av. Belgrano 1234, Piso 2 A"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={titular.address}
                  onChange={(e) => setTitular({ ...titular, address: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Localidad *</label>
                  <input 
                    type="text" 
                    placeholder="Rosario"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                    value={titular.locality}
                    onChange={(e) => setTitular({ ...titular, locality: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Barrio *</label>
                  <input 
                    type="text" 
                    placeholder="Centro"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                    value={titular.neighborhood}
                    onChange={(e) => setTitular({ ...titular, neighborhood: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="md:col-span-2 bg-slate-900/40 border border-white/5 p-6 rounded-3xl">
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Correo Electrónico *</label>
                <div className="flex gap-4 items-center">
                  <input 
                    type="email" 
                    placeholder="nombre@ejemplo.com"
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    value={titular.email}
                    onChange={(e) => setTitular({ ...titular, email: e.target.value })}
                    disabled={isEmailVerified || otpSent}
                    required
                  />
                  {EMAIL_VERIFICATION_REQUIRED && (
                    isEmailVerified ? (
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm bg-emerald-500/10 px-4 py-2.5 rounded-2xl border border-emerald-500/20">
                        <CheckCircle2 size={16} />
                        Verificado
                      </div>
                    ) : (
                      !otpSent && (
                        <button
                          type="button"
                          onClick={sendEmailOtp}
                          disabled={isSendingOtp || !titular.email.includes('@')}
                          className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3.5 px-6 rounded-2xl transition-all text-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                        >
                          {isSendingOtp && <Loader2 size={16} className="animate-spin" />}
                          Validar Correo
                        </button>
                      )
                    )
                  )}
                </div>

                {EMAIL_VERIFICATION_REQUIRED && otpSent && !isEmailVerified && (
                  <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-2xl animate-in slide-in-from-top duration-300">
                    <label className="block text-slate-300 text-xs font-semibold mb-2">Ingresá el código de 6 dígitos enviado:</label>
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        maxLength={6}
                        placeholder="Ej: 123456"
                        className="w-32 bg-slate-950 border border-white/10 rounded-xl py-2 px-3 text-center text-white tracking-widest text-lg font-bold focus:outline-none focus:border-emerald-400/50"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      />
                      <button
                        type="button"
                        onClick={verifyEmailOtp}
                        disabled={isVerifyingOtp || otpCode.length < 6}
                        className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2 px-5 rounded-xl transition-all text-sm active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                      >
                        {isVerifyingOtp && <Loader2 size={16} className="animate-spin" />}
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={sendEmailOtp}
                        disabled={countdown > 0 || isSendingOtp}
                        className="border border-white/10 hover:bg-white/5 text-slate-300 font-bold py-2 px-4 rounded-xl transition-all text-xs flex items-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw size={12} className={isSendingOtp ? "animate-spin" : ""} />
                        {countdown > 0 ? `Reenviar en ${countdown}s` : "Reenviar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Celular *</label>
                <input 
                  type="tel" 
                  placeholder="3416123456"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={titular.phone}
                  onChange={(e) => setTitular({ ...titular, phone: e.target.value })}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Obra Social / Prepaga (Opcional)</label>
                <input 
                  type="text" 
                  placeholder="Ej: OSDE, Medicus, OSECAC o Ninguna"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={titular.healthInsurance}
                  onChange={(e) => setTitular({ ...titular, healthInsurance: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">
                  Código de Promotor / Vendedor {isPromoterLocked && <span className="text-emerald-400 font-semibold">(Asignado)</span>}
                </label>
                <input 
                  type="text" 
                  placeholder="Ej: PROMO_JUAN_123 (Opcional)"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed font-mono uppercase"
                  value={promoterCode}
                  onChange={(e) => !isPromoterLocked && setPromoterCode(e.target.value.toUpperCase())}
                  disabled={isPromoterLocked}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={handleNextStep}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
              >
                Siguiente
                <ArrowRight size={18} />
              </button>
            </div>
          </GlassCard>
        )}

        {step === 2 && (
          <GlassCard className="w-full animate-in fade-in zoom-in duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                <CreditCard size={24} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white">2. Plan Familiar y Forma de Pago</h2>
            </div>
            <p className="text-slate-400 text-sm mb-8">El {planDisplayName} cubre al titular y hasta {maxFamilyMembersCount} integrantes convivientes adicionales.</p>

            {/* Plan Info Card */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-3xl p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]">
              <div>
                <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{planDisplayName.toUpperCase()}</span>
                <h3 className="text-xl font-bold text-white mt-3">Cobertura Completa Familiar</h3>
                <p className="text-slate-400 text-sm mt-1 max-w-md">Incluye hasta {maxFamilyMembersCount + 1} integrantes convivientes en total (titular + {maxFamilyMembersCount} adicionales) con acceso a videoconsultas ilimitadas y recetas digitales.</p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs text-slate-400 font-medium">Valor Estándar</p>
                <h4 className="text-3xl font-extrabold text-white">{formatCurrency(baseMonthlyCost)}<span className="text-sm font-medium text-slate-400">/ mes</span></h4>
              </div>
            </div>

            {/* Payment Method Selector Grid */}
            <label className="block text-slate-400 text-xs font-bold uppercase mb-4">Modalidad de Pago y Promociones</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {/* Option 1: Monthly */}
              <div 
                onClick={() => setPlan({ ...plan, paymentMethod: 'monthly' })}
                className={`border rounded-3xl p-6 cursor-pointer transition-all flex flex-col justify-between ${
                  plan.paymentMethod === 'monthly'
                    ? 'border-emerald-400 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div>
                  <h4 className="font-bold text-white text-base">Pago Mensual</h4>
                  <p className="text-slate-400 text-xs mt-1">Efectivo, Rapipago, Link de Pago, Transferencia.</p>
                </div>
                <div className="mt-6 flex justify-between items-end">
                  <span className="text-xs text-slate-500 font-semibold">Mensual</span>
                  <span className="text-xl font-bold text-white">{formatCurrency(baseMonthlyCost)}</span>
                </div>
              </div>

              {/* Option 2: Automatic Debit */}
              <div 
                onClick={() => setPlan({ ...plan, paymentMethod: 'debit' })}
                className={`border rounded-3xl p-6 cursor-pointer transition-all flex flex-col justify-between relative overflow-hidden ${
                  plan.paymentMethod === 'debit'
                    ? 'border-emerald-400 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="absolute top-0 right-0 bg-emerald-400 text-slate-900 font-bold text-[9px] px-3 py-1 uppercase rounded-bl-xl tracking-wider flex items-center gap-1 shadow-md">
                  <Sparkles size={10} />
                  Recomendado
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Débito Automático (TC)</h4>
                  <p className="text-slate-400 text-xs mt-1">20% de descuento permanente sobre la cuota mensual.</p>
                </div>
                <div className="mt-6 flex justify-between items-end">
                  <span className="text-xs text-emerald-400 font-semibold">20% Descuento</span>
                  <span className="text-xl font-bold text-white">{formatCurrency(debitMonthlyCost)} <span className="text-xs font-normal text-slate-400">/ mes</span></span>
                </div>
              </div>

              {/* Option 3: Prepago 6 meses */}
              <div 
                onClick={() => setPlan({ ...plan, paymentMethod: 'prepaid_6' })}
                className={`border rounded-3xl p-6 cursor-pointer transition-all flex flex-col justify-between ${
                  plan.paymentMethod === 'prepaid_6'
                    ? 'border-emerald-400 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div>
                  <h4 className="font-bold text-white text-base">Pago Anticipado 6 meses</h4>
                  <p className="text-slate-400 text-xs mt-1">20% de descuento + 1 mes de cobertura adicional sin cargo.</p>
                </div>
                <div className="mt-6 flex justify-between items-end">
                  <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">7 Meses Cobertura</span>
                  <span className="text-xl font-bold text-white">{formatCurrency(prepaid6TotalCost)} <span className="text-xs font-normal text-slate-500">único</span></span>
                </div>
              </div>

              {/* Option 4: Prepago 12 meses */}
              <div 
                onClick={() => setPlan({ ...plan, paymentMethod: 'prepaid_12' })}
                className={`border rounded-3xl p-6 cursor-pointer transition-all flex flex-col justify-between ${
                  plan.paymentMethod === 'prepaid_12'
                    ? 'border-emerald-400 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div>
                  <h4 className="font-bold text-white text-base">Pago Anticipado 12 meses</h4>
                  <p className="text-slate-400 text-xs mt-1">20% de descuento + 2 meses de cobertura adicional sin cargo.</p>
                </div>
                <div className="mt-6 flex justify-between items-end">
                  <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">14 Meses Cobertura</span>
                  <span className="text-xl font-bold text-white">{formatCurrency(prepaid12TotalCost)} <span className="text-xs font-normal text-slate-500">único</span></span>
                </div>
              </div>
            </div>

            {/* Payment Details Input */}
            {plan.paymentMethod === 'debit' && (
              <div className="mb-8 animate-in fade-in duration-300">
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Marca / Tarjeta de Débito Automático</label>
                <select 
                  className="w-full bg-[#0f172a] border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={plan.paymentDetail}
                  onChange={(e) => setPlan({ ...plan, paymentDetail: e.target.value })}
                >
                  <option value="Tarjeta de Crédito Visa">Tarjeta de Crédito Visa</option>
                  <option value="Tarjeta de Crédito MasterCard">Tarjeta de Crédito MasterCard</option>
                  <option value="Tarjeta de Crédito American Express">Tarjeta de Crédito American Express</option>
                  <option value="Tarjeta de Débito Visa Débito">Tarjeta de Débito Visa Débito</option>
                  <option value="Tarjeta de Débito Maestro">Tarjeta de Débito Maestro</option>
                </select>
              </div>
            )}

            {plan.paymentMethod === 'monthly' && (
              <div className="mb-8 animate-in fade-in duration-300">
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Medio de Pago Mensual Elegido</label>
                <select 
                  className="w-full bg-[#0f172a] border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={plan.paymentDetail}
                  onChange={(e) => setPlan({ ...plan, paymentDetail: e.target.value })}
                >
                  <option value="Transferencia Bancaria / CBU">Transferencia Bancaria / CBU</option>
                  <option value="Link de Pago Web">Link de Pago Web</option>
                  <option value="Efectivo por Rapipago / Pago Fácil">Efectivo por Rapipago / Pago Fácil</option>
                  <option value="Código QR / Billetera Virtual">Código QR / Billetera Virtual</option>
                </select>
              </div>
            )}

            <div className="flex justify-between items-center mt-8">
              <button 
                onClick={() => setStep(1)}
                className="border border-white/10 hover:bg-white/5 text-slate-300 font-bold py-4 px-6 rounded-2xl transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={18} />
                Atrás
              </button>
              <button 
                onClick={handleNextStep}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
              >
                Siguiente
                <ArrowRight size={18} />
              </button>
            </div>
          </GlassCard>
        )}

        {step === 3 && (
          <GlassCard className="w-full animate-in fade-in zoom-in duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                <Users size={24} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white">3. Grupo Familiar Conviviente</h2>
            </div>
            <p className="text-slate-400 text-sm mb-6">Podés agregar hasta 4 integrantes convivientes adicionales para incluirlos en la cobertura familiar.</p>

            {/* List of current added family members */}
            {familyMembers.length > 0 ? (
              <div className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden mb-8">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="py-4 px-6 text-slate-300 font-bold text-xs uppercase">Nombre</th>
                      <th className="py-4 px-6 text-slate-300 font-bold text-xs uppercase">DNI</th>
                      <th className="py-4 px-6 text-slate-300 font-bold text-xs uppercase">CUIL</th>
                      <th className="py-4 px-6 text-slate-300 font-bold text-xs uppercase">Parentesco</th>
                      <th className="py-4 px-6 text-slate-300 font-bold text-xs uppercase text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {familyMembers.map((member, index) => (
                      <tr key={index} className="hover:bg-white/5 transition-colors">
                        <td className="py-4 px-6 text-white font-bold text-sm">{member.name}</td>
                        <td className="py-4 px-6 text-slate-300 text-sm">{member.dni}</td>
                        <td className="py-4 px-6 text-slate-300 text-sm">{member.cuil}</td>
                        <td className="py-4 px-6 text-sm">
                          <span className="text-xs uppercase font-bold px-2 py-1 rounded bg-teal-500/15 border border-teal-500/20 text-teal-300">
                            {member.parentesco}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button 
                            onClick={() => removeFamilyMember(index)}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 border-dashed rounded-3xl p-8 text-center text-slate-400 italic mb-8">
                No hay integrantes del grupo familiar cargados todavía. Podés agregarlos abajo.
              </div>
            )}

            {/* Add new family member form */}
            {familyMembers.length < 4 ? (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8">
                <h4 className="font-bold text-white text-base mb-4 flex items-center gap-2">
                  <Plus size={18} className="text-emerald-400" />
                  Cargar Nuevo Familiar
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="grid grid-cols-2 gap-4 md:col-span-2">
                    <div>
                      <label className="block text-slate-400 text-[10px] font-bold uppercase mb-2">Nombre *</label>
                      <input 
                        type="text" 
                        placeholder="Ej: María"
                        className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50"
                        value={newFamilyMember.firstName}
                        onChange={(e) => setNewFamilyMember({ ...newFamilyMember, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] font-bold uppercase mb-2">Apellido *</label>
                      <input 
                        type="text" 
                        placeholder="Ej: Pérez"
                        className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50"
                        value={newFamilyMember.lastName}
                        onChange={(e) => setNewFamilyMember({ ...newFamilyMember, lastName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-2">DNI *</label>
                    <input
                      type="number"
                      placeholder="Sin puntos"
                      className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50"
                      value={newFamilyMember.dni}
                      onChange={(e) => setNewFamilyMember({ ...newFamilyMember, dni: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-2">CUIL *</label>
                    <input
                      type="text"
                      placeholder="Ej: 27-31123456-4"
                      className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50"
                      value={newFamilyMember.cuil}
                      onChange={(e) => setNewFamilyMember({ ...newFamilyMember, cuil: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-2">F. Nacimiento *</label>
                    <input 
                      type="date" 
                      className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50"
                      value={newFamilyMember.birthDate}
                      onChange={(e) => setNewFamilyMember({ ...newFamilyMember, birthDate: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 text-[10px] font-bold uppercase mb-2">Parentesco *</label>
                      <select 
                        className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none"
                        value={newFamilyMember.parentesco}
                        onChange={(e) => setNewFamilyMember({ ...newFamilyMember, parentesco: e.target.value })}
                      >
                        <option value="cónyuge">Cónyuge</option>
                        <option value="hijo/a">Hijo/a</option>
                        <option value="padre/madre">Padre/Madre</option>
                        <option value="hermano/a">Hermano/a</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] font-bold uppercase mb-2">Sexo *</label>
                      <select 
                        className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none"
                        value={newFamilyMember.sexo}
                        onChange={(e) => setNewFamilyMember({ ...newFamilyMember, sexo: e.target.value })}
                      >
                        <option value="Femenino">Femenino</option>
                        <option value="Masculino">Masculino</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={addFamilyMember}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold py-3 px-6 rounded-2xl border border-emerald-500/20 w-full transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
                >
                  <Plus size={16} />
                  Agregar Familiar al Grupo
                </button>
              </div>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-3xl p-6 mb-8 flex items-center gap-3">
                <CheckCircle2 size={20} className="flex-shrink-0" />
                Alcanzaste el límite de 4 familiares adicionales para este plan.
              </div>
            )}

            <div className="flex justify-between items-center mt-8">
              <button 
                onClick={() => setStep(2)}
                className="border border-white/10 hover:bg-white/5 text-slate-300 font-bold py-4 px-6 rounded-2xl transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={18} />
                Atrás
              </button>
              <button 
                onClick={handleNextStep}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
              >
                Siguiente
                <ArrowRight size={18} />
              </button>
            </div>
          </GlassCard>
        )}

        {step === 4 && (
          <GlassCard className="w-full animate-in fade-in zoom-in duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                <HeartPulse size={24} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white">4. Antecedentes Médicos Familiares</h2>
            </div>
            <p className="text-slate-400 text-sm mb-8">Declaración jurada de antecedentes de salud relevantes en el grupo familiar.</p>

            {/* Medical Checkboxes Grid */}
            <label className="block text-slate-400 text-xs font-bold uppercase mb-4">Antecedentes en la Familia (Marcar los que correspondan)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mb-8">
              {medicalOptions.map((opt) => (
                <div 
                  key={opt}
                  onClick={() => toggleMedicalOption(opt)}
                  className={`border rounded-2xl p-4 cursor-pointer transition-all flex items-center gap-3 ${
                    medical.history.includes(opt)
                      ? 'border-emerald-400 bg-emerald-500/5 text-white'
                      : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                    medical.history.includes(opt)
                      ? 'border-emerald-400 bg-emerald-400 text-slate-900'
                      : 'border-white/20'
                  }`}>
                    {medical.history.includes(opt) && <CheckCircle2 size={12} className="stroke-[3]" />}
                  </div>
                  <span className="text-xs font-semibold leading-none">{opt}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Otros Antecedentes / Medicación Permanente</label>
                <input 
                  type="text" 
                  placeholder="Detalle de medicación u otras patologías..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={medical.historyOther}
                  onChange={(e) => setMedical({ ...medical, historyOther: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">¿Querés recomendar a un amigo?</label>
                <input 
                  type="tel" 
                  placeholder="Celular de un familiar o amigo..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={medical.recommendedFriendPhone}
                  onChange={(e) => setMedical({ ...medical, recommendedFriendPhone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">¿Cómo conociste MEDINEX?</label>
                <select 
                  className="w-full bg-[#0f172a] border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={medical.discoverySource}
                  onChange={(e) => setMedical({ ...medical, discoverySource: e.target.value })}
                >
                  <option value="Vendedor">Vendedor / Promotor QR</option>
                  <option value="Referido">Referido por familiar/amigo</option>
                  <option value="Redes sociales">Redes Sociales (IG, FB, etc.)</option>
                  <option value="Publicidad">Publicidad en vía pública</option>
                  <option value="Empresa">Convenio Corporativo</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Horario Preferido de Contacto</label>
                <select 
                  className="w-full bg-[#0f172a] border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-colors"
                  value={medical.preferredContactTime}
                  onChange={(e) => setMedical({ ...medical, preferredContactTime: e.target.value })}
                >
                  <option value="Cualquier horario">Cualquier horario</option>
                  <option value="Mañana (8 a 12 hs)">Mañana (8 a 12 hs)</option>
                  <option value="Tarde (12 a 18 hs)">Tarde (12 a 18 hs)</option>
                  <option value="Noche (18 a 22 hs)">Noche (18 a 22 hs)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center mt-8">
              <button 
                onClick={() => setStep(3)}
                className="border border-white/10 hover:bg-white/5 text-slate-300 font-bold py-4 px-6 rounded-2xl transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <ArrowLeft size={18} />
                Atrás
              </button>
              <button 
                onClick={handleNextStep}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
              >
                Siguiente
                <ArrowRight size={18} />
              </button>
            </div>
          </GlassCard>
        )}

        {step === 5 && (
          <GlassCard className="w-full animate-in fade-in zoom-in duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                <FileText size={24} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white">5. Condiciones, Consentimiento y Firma</h2>
            </div>
            <p className="text-slate-400 text-sm mb-6">Por favor, lee las condiciones y firma en el recuadro inferior para completar tu solicitud.</p>

            {/* Scrollable Terms & Conditions Box */}
            <div className="bg-slate-950 border border-white/10 rounded-2xl p-5 text-slate-400 text-xs h-40 overflow-y-auto mb-6 leading-relaxed custom-scrollbar select-none">
              <h5 className="font-bold text-white mb-2">1. OBJETO DEL SERVICIO</h5>
              <p className="mb-4">MEDINEX brinda orientación médica mediante consultas por videollamada con profesionales habilitados. El médico podrá emitir recetas electrónicas, certificados médicos y órdenes para estudios cuando lo considere necesario.</p>
              
              <h5 className="font-bold text-white mb-2">2. IMPORTANTE</h5>
              <p className="mb-4">Las órdenes para estudios (análisis, radiografías, ecografías, electrocardiogramas, pruebas de laboratorio, endoscopías, espirometrías, densitometrías óseas, entre otros) Sí están incluidas en el servicio. Únicamente NO están incluidas las tomografías computadas (TAC) ni las resonancias magnéticas.</p>
              
              <h5 className="font-bold text-white mb-2">3. LIMITACIONES Y DECLARACIÓN</h5>
              <p className="mb-4">MEDINEX NO reemplaza a las guardias médicas, servicios de emergencia (como SAME o ambulancias) ni la atención presencial cuando esta sea necesaria. Declaro que los datos consignados son verdaderos y que recibí información suficiente sobre el servicio.</p>
              
              <h5 className="font-bold text-white mb-2">4. CONDICIONES ECONÓMICAS Y FACTURACIÓN</h5>
              <p className="mb-4">El valor del Plan Familiar es de $50.000 mensuales cuando el pago se realiza mediante transferencia, QR, Link de Pago, Pago Fácil o Rapipago. Quienes adhieran al Débito Automático con Tarjeta de Crédito obtendrán un 20% de descuento permanente, abonando $40.000 mensuales. Los cobros se procesan del 1 al 10 de cada mes.</p>
            </div>

            {/* Consent checkboxes */}
            <div className="space-y-3.5 mb-6">
              <label className="flex items-start gap-3 cursor-pointer text-slate-300 text-sm select-none">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded border border-white/20 bg-white/5 text-emerald-400 focus:ring-0 mt-0.5"
                  checked={consents.dataTreatment}
                  onChange={(e) => setConsents({ ...consents, dataTreatment: e.target.checked })}
                />
                <span>Autorizo el tratamiento de mis datos personales y de salud para la correcta prestación del servicio, conforme a la Ley 25.326. *</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer text-slate-300 text-sm select-none">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded border border-white/20 bg-white/5 text-emerald-400 focus:ring-0 mt-0.5"
                  checked={consents.promotions}
                  onChange={(e) => setConsents({ ...consents, promotions: e.target.checked })}
                />
                <span>Autorizo a recibir información, novedades, promociones y recordatorios por WhatsApp, SMS o correo electrónico.</span>
              </label>
            </div>

            {/* Signature Area */}
            <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Firma del Titular (Dibujá tu firma en el recuadro)</label>
            <div className="bg-slate-950 border border-white/10 rounded-2xl overflow-hidden mb-8 relative">
              <canvas
                ref={canvasRef}
                width={700}
                height={200}
                className="w-full h-[200px] cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <button
                onClick={clearCanvas}
                type="button"
                className="absolute bottom-4 right-4 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-400 font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <RefreshCw size={12} />
                Limpiar Firma
              </button>
            </div>

            <div className="flex justify-between items-center mt-8">
              <button 
                onClick={() => setStep(4)}
                disabled={isLoading}
                className="border border-white/10 hover:bg-white/5 text-slate-300 font-bold py-4 px-6 rounded-2xl transition-all flex items-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft size={18} />
                Atrás
              </button>
              <button 
                onClick={handleSubmit}
                disabled={isLoading || !consents.dataTreatment || !hasSigned}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/30 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] min-w-[150px] active:scale-95 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Enviar Solicitud
                    <CheckCircle2 size={18} />
                  </>
                )}
              </button>
            </div>
          </GlassCard>
        )}

        {step === 6 && (
          <GlassCard className="w-full text-center py-12 animate-in fade-in zoom-in duration-500 max-w-xl">
            <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-[2rem] flex items-center justify-center text-emerald-400 mx-auto mb-8 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
              <CheckCircle2 size={40} className="stroke-[2.5]" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-4">¡Solicitud Enviada!</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-md mx-auto">
              Muchas gracias, <span className="text-white font-bold">{titular.name}</span>. Hemos recibido tu solicitud para el <span className="text-white font-bold">{plan.type}</span> pagando vía <span className="text-white font-bold">{getPaymentMethodLabel()}</span>.
            </p>

            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 text-left mb-8 space-y-4">
              <h4 className="font-bold text-white text-sm uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sparkles size={16} />
                Próximos pasos:
              </h4>
              <ol className="list-decimal list-inside text-xs text-slate-300 space-y-2 leading-relaxed">
                <li>Nuestro equipo administrativo revisará los datos cargados.</li>
                <li>Una vez aprobada tu afiliación, te llegará un correo de confirmación.</li>
                <li>Podrás descargar la App de <strong>MEDINEX</strong> y loguearte directamente usando tu DNI (<span className="text-white font-bold">{titular.dni}</span>) como usuario y contraseña temporal.</li>
              </ol>
            </div>

            {mpInitPoint && (
              <div className="mb-8">
                <a
                  href={mpInitPoint}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#009ee3] hover:bg-[#0089c7] text-white font-bold py-4 px-8 rounded-2xl transition-all inline-flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,158,227,0.25)] active:scale-95 cursor-pointer w-full max-w-sm"
                >
                  <svg viewBox="0 0 452 355" fill="none" className="w-6 h-6 mr-1" xmlns="http://www.w3.org/2000/svg">
                    <path d="M129.563 325.326L48.2435 244.02C40.9419 236.717 40.9419 224.877 48.2435 217.574L199.167 66.6631C206.469 59.3615 218.31 59.3615 225.612 66.6631L332.617 173.668V21.4392C332.617 11.1176 340.985 2.75 351.306 2.75H433.311C443.633 2.75 452.001 11.1176 452.001 21.4392V333.684C452.001 344 443.633 352.368 433.311 352.368H351.306C340.985 352.368 332.617 344 332.617 333.684V202.973L254.918 280.672C247.617 287.973 235.776 287.973 228.474 280.672L129.563 325.326Z" fill="white"/>
                    <path d="M128.272 322.956L18.6892 213.373C3.5975 198.281 3.5975 173.813 18.6892 158.721L156.401 21.0093C171.493 5.91761 195.961 5.91761 211.053 21.0093L235.534 45.49L128.272 322.956Z" fill="white"/>
                  </svg>
                  Adherir Tarjeta en Mercado Pago
                </a>
                <p className="text-slate-500 text-[10px] mt-3">Serás redirigido a la plataforma segura de Mercado Pago.</p>
              </div>
            )}

            <button 
              onClick={() => {
                // Clear fields and go back to step 1
                setStep(1);
                setTitular({
                  name: '',
                  dni: '',
                  cuil: '',
                  birthDate: '',
                  address: '',
                  locality: '',
                  neighborhood: '',
                  email: '',
                  phone: '',
                  civilStatus: 'Soltero/a',
                  healthInsurance: '',
                });
                setFamilyMembers([]);
                setConsents({ dataTreatment: false, promotions: false });
                setHasSigned(false);
              }}
              className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm text-slate-300 font-bold transition-all active:scale-98 cursor-pointer"
            >
              Completar otra solicitud
            </button>
          </GlassCard>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 text-center text-xs text-slate-600 border-t border-white/5 mt-8">
        <p>© 2026 MEDINEX. Todos los derechos reservados. Servicio prestado por CRISAL SAS. Ley de Protección de Datos Personales N° 25.326.</p>
      </footer>
    </div>
  );
};
