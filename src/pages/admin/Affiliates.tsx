import React, { useState, useEffect } from 'react';
import {
  Search, Plus, Edit2, Trash2, AlertCircle, Shield, User as UserIcon,
  Building2, Filter, Key, ShieldCheck, Mail, Phone, MapPin,
  Calendar, Award, XCircle, Heart, CreditCard, Users, Loader2, CheckCircle2, RefreshCw, FileText
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { affiliateRepository, PlanAssignmentFailedError, ProfileFieldsUpdateFailedError } from '../../repositories/AffiliateRepository';
import { adhesionRepository, AdhesionRequest } from '../../repositories/AdhesionRepository';
import { AffiliateLedgerModal } from './AffiliateLedgerModal';
import { planRepository } from '../../repositories/PlanRepository';
import { Patient, Plan } from '../../types';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal';

// Glass Card for Table Container
const GlassTableContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
    {children}
  </div>
);

/**
 * Decide si mostrar la acción "Renovar cobertura" para un afiliado: sólo
 * cuando tiene un plan asignado Y su cobertura se sabe explícitamente vencida
 * (`coverageActive === false`). Si el estado todavía no se cargó (entrada
 * ausente en el mapa), NUNCA se asume vencida — evita ofrecer una renovación
 * sobre datos que no se verificaron.
 */
export function shouldShowRenewCoverage(patient: Patient, coverageActiveMap: Record<string, boolean>): boolean {
  return !!patient.planId && coverageActiveMap[patient.id] === false;
}

const Affiliates: React.FC = () => {
  const { toast } = useToast();
  const [affiliates, setAffiliates] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [resetPasswordPatient, setResetPasswordPatient] = useState<Patient | null>(null);
  // Ledger state
  const [selectedLedgerPatient, setSelectedLedgerPatient] = useState<string | null>(null);
  // Mapa patientId -> coverageActive, poblado tras cargar el padrón. Ausencia
  // de entrada (no `false`) significa "todavía no verificado" — nunca se
  // asume vencida sin haber leído el estado real.
  const [coverageActiveMap, setCoverageActiveMap] = useState<Record<string, boolean>>({});
  // Fila individual en curso de renovación — separado de `isSubmitting` para
  // no deshabilitar el botón "Renovar cobertura" de TODAS las filas mientras
  // se renueva (o edita) una sola.
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    email: '',
    dni: '',
    cuil: '',
    phone: '',
    birthDate: '',
    address: '',
    locality: '',
    neighborhood: '',
    planId: '',
    planStatus: 'active' as const
  });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);

  // Solicitudes QR states
  const [activeTab, setActiveTab] = useState<'active' | 'requests'>('active');
  const [requests, setRequests] = useState<AdhesionRequest[]>([]);
  const [isRequestsLoading, setIsRequestsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AdhesionRequest | null>(null);
  const [promoterFilter, setPromoterFilter] = useState<string>('all');

  useEffect(() => {
    loadAffiliates();
    loadRequests();
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setIsLoadingPlans(true);
      const data = await planRepository.getAll();
      setPlans(data);
    } catch (error) {
      console.error("Error cargando planes disponibles:", error);
      toast("Error cargando planes disponibles", "error");
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const loadRequests = async () => {
    try {
      setIsRequestsLoading(true);
      const data = await adhesionRepository.getPendingApplications();
      setRequests(data);
    } catch (error) {
      console.error("Error cargando solicitudes pendientes:", error);
    } finally {
      setIsRequestsLoading(false);
    }
  };

  const loadAffiliates = async () => {
    try {
      setIsLoading(true);
      const data = await affiliateRepository.getAllAffiliates();
      setAffiliates(data);
      loadCoverageStatus(data);
    } catch (error) {
      toast("Error cargando afiliados", "error");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Resuelve `coverageActive` por afiliado (para decidir cuándo ofrecer
   * "Renovar cobertura"). Se corre en paralelo, sin bloquear el render del
   * padrón — si una lectura individual falla, esa entrada queda ausente del
   * mapa en lugar de asumir un estado inventado.
   */
  const loadCoverageStatus = async (patients: Patient[]) => {
    const entries = await Promise.all(
      patients
        .filter(p => p.planId)
        .map(async (p) => {
          try {
            const status = await affiliateRepository.getConsultationQuotaStatus(p.id);
            return [p.id, status.coverageActive] as const;
          } catch (error) {
            console.error(`Error obteniendo estado de cobertura de ${p.id}:`, error);
            return null;
          }
        })
    );
    setCoverageActiveMap(Object.fromEntries(entries.filter((e): e is readonly [string, boolean] => e !== null)));
  };

  const handleRenewCoverage = async (patient: Patient) => {
    setRenewingId(patient.id);
    try {
      const result = await affiliateRepository.renewCoverageWindow(patient.id);
      // Bajo modo grace_period la renovación se completa igual con saldo
      // pendiente (D7) — el admin tiene que verlo en el mismo toast, no
      // enterarse recién al mirar la cuenta corriente por separado.
      const message = result.isDelinquent
        ? `Cobertura de ${patient.name} renovada con éxito — saldo pendiente: $${result.balanceDue.toLocaleString()}`
        : `Cobertura de ${patient.name} renovada con éxito`;
      toast(message, "success");
      loadAffiliates();
    } catch (error: any) {
      toast(error?.message || "Error al renovar la cobertura", "error");
    } finally {
      setRenewingId(null);
    }
  };

  const handleNewAffiliate = () => {
    setEditId(null);
    setFormData({
      lastName: '',
      firstName: '',
      email: '',
      dni: '',
      cuil: '',
      phone: '',
      birthDate: '',
      address: '',
      locality: '',
      neighborhood: '',
      planId: plans.find(p => p.isDefault)?.id || '',
      planStatus: 'active'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const fullName = `${formData.lastName.trim()} ${formData.firstName.trim()}`.trim();
    try {
      const payload = {
        ...formData,
        name: fullName,
        planId: formData.planId || undefined
      };
      if (editId) {
        await affiliateRepository.updateAffiliate(editId, payload);
        toast(`Afiliado ${fullName} actualizado`, "success");
      } else {
        await affiliateRepository.createAffiliate(payload);
        toast(`Afiliado ${fullName} registrado`, "success");
      }
      setShowModal(false);
      loadAffiliates();
    } catch (error) {
      if (error instanceof PlanAssignmentFailedError) {
        toast(`Afiliado ${fullName} registrado, pero no se pudo asignar el plan — reintentá desde Editar.`, "error");
        setShowModal(false);
        loadAffiliates();
      } else if (error instanceof ProfileFieldsUpdateFailedError) {
        toast(`El plan de ${fullName} se actualizó, pero el resto de los datos no se guardó — reintentá.`, "error");
        setShowModal(false);
        loadAffiliates();
      } else {
        toast("Error al guardar afiliado", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (patient: Patient) => {
    setEditId(patient.id);
    const parts = patient.name.split(' ');
    const lastName = parts[0] || '';
    const firstName = parts.slice(1).join(' ') || '';
    setFormData({
      lastName,
      firstName,
      email: patient.email,
      dni: patient.dni || '',
      cuil: patient.cuil || '',
      phone: patient.phone || '',
      birthDate: patient.birthDate || '',
      address: patient.address || '',
      locality: patient.locality || '',
      neighborhood: patient.neighborhood || '',
      planId: patient.planId || '',
      planStatus: (patient.planStatus as any) || 'active'
    });
    setShowModal(true);
  };

  const handleDeactivate = async (id: string) => {
    setIsSubmitting(true);
    try {
      await affiliateRepository.deactivateAffiliate(id);
      toast("Afiliado desactivado", "success");
      setDeleteConfirmId(null);
      loadAffiliates();
    } catch (error) {
      toast("Error al desactivar", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async (id: string) => {
    setIsSubmitting(true);
    try {
      await affiliateRepository.activateAffiliate(id);
      toast("Afiliado aprobado y activado con éxito", "success");
      loadAffiliates();
    } catch (error) {
      toast("Error al aprobar afiliado", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveRequest = async (id: string) => {
    setIsSubmitting(true);
    try {
      const { activationEmailSent } = await adhesionRepository.approveApplication(id);
      if (activationEmailSent) {
        toast("Solicitud aprobada y paciente registrado con éxito!", "success");
      } else {
        // Judgment Day finding: the account was created but has no password
        // and the affiliate has no other way to set one — warn the admin
        // immediately so they know to use "Restablecer Contraseña" manually.
        toast("Afiliado registrado, pero el correo de activación no se pudo enviar. Restablecé su contraseña manualmente.", "error");
      }
      setSelectedRequest(null);
      loadRequests();
      loadAffiliates();
    } catch (error: any) {
      toast(error.message || "Error al aprobar afiliación", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectRequest = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que querés rechazar esta solicitud de adhesión?")) return;
    setIsSubmitting(true);
    try {
      await adhesionRepository.rejectApplication(id);
      toast("Solicitud rechazada con éxito", "success");
      setSelectedRequest(null);
      loadRequests();
    } catch (error: any) {
      toast(error.message || "Error al rechazar solicitud", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const promoterOptions = Array.from(
    new Set(requests.map(r => r.promoter_id?.trim().toUpperCase() || 'SIN_PROMOTOR'))
  ).sort();

  const filteredRequests = promoterFilter === 'all'
    ? requests
    : requests.filter(r => (r.promoter_id?.trim().toUpperCase() || 'SIN_PROMOTOR') === promoterFilter);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header & Search */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Comercial / CRM</h2>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tighter">Padrón de <span className="text-slate-500 font-light italic">Afiliados</span></h1>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative group flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Buscar por DNI o Nombre..."
              className="pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none text-white text-sm w-full sm:w-72 transition-all group-hover:border-white/20"
            />
            <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
          </div>
          <button 
            onClick={handleNewAffiliate}
            className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-[#020617] px-5 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)] w-full sm:w-auto"
          >
            <Plus size={20} />
            <span>Nuevo Afiliado</span>
          </button>
        </div>
      </div>

      {/* Stats Summary for Affiliates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400">
            <UserIcon size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Pacientes</p>
            <h4 className="text-xl font-bold text-white">{affiliates.length}</h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Afiliados Activos</p>
            <h4 className="text-xl font-bold text-white">
              {affiliates.filter(p => p.isActive).length}
            </h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
            <AlertCircle size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Pendientes de Aprobación</p>
            <h4 className="text-xl font-bold text-amber-400">
              {affiliates.filter(p => !p.isActive && p.planStatus !== 'suspended').length}
            </h4>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6">
        <button
          onClick={() => setActiveTab('active')}
          className={`py-4 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeTab === 'active'
              ? 'border-emerald-500 text-emerald-400 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Afiliados Activos ({affiliates.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`py-4 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer relative ${
            activeTab === 'requests'
              ? 'border-emerald-500 text-emerald-400 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Solicitudes de Adhesión (QR)
          {requests.length > 0 && (
            <span className="ml-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {requests.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'active' ? (
        <GlassTableContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                  <th className="px-8 py-5">Identidad</th>
                  <th className="px-6 py-5">Plan / Cobertura</th>
                  <th className="px-6 py-5 text-center">Estado de Cuenta</th>
                  <th className="px-8 py-5 text-right">Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-500 italic animate-pulse">Sincronizando padrón de afiliados...</td></tr>
                ) : affiliates.length === 0 ? (
                  <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-500 italic">No se encontraron registros en la base de datos.</td></tr>
                ) : affiliates.map((patient) => (
                  <tr key={patient.id} className="group hover:bg-white/5 transition-all duration-200">
                    <td className="px-8 py-5">
                      <div className="flex items-center">
                        <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 font-bold text-lg transition-transform group-hover:scale-110">
                          {patient.name.charAt(0)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{patient.name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center mt-1">
                            <span className="bg-slate-800 px-1.5 py-0.5 rounded mr-2 font-mono">DNI {patient.dni}</span>
                            {patient.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm font-semibold text-slate-300">{patient.planName}</div>
                      <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Premium Network</div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest
                        ${patient.isActive
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : patient.planStatus === 'suspended'
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full mr-2 
                          ${patient.isActive 
                            ? 'bg-emerald-500 animate-pulse' 
                            : patient.planStatus === 'suspended'
                              ? 'bg-rose-500'
                              : 'bg-amber-500 animate-bounce'
                          }`}
                        ></div>
                        {patient.isActive 
                          ? 'Activo' 
                          : patient.planStatus === 'suspended'
                            ? 'Suspendido'
                            : 'Pendiente'
                        }
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end space-x-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        {!patient.isActive && patient.planStatus !== 'suspended' && (
                          <button 
                            onClick={() => handleActivate(patient.id)} 
                            className="p-2 bg-white/5 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-colors border border-white/5"
                            title="Aprobar Afiliado"
                          >
                            <ShieldCheck size={16} />
                          </button>
                        )}
                        <button 
                          onClick={() => setResetPasswordPatient(patient)} 
                          className="p-2 bg-white/5 hover:bg-amber-500/20 text-amber-500 rounded-xl transition-colors border border-white/5"
                          title="Restablecer Contraseña"
                        >
                          <Key size={16} />
                        </button>
                        <button
                          onClick={() => handleEdit(patient)}
                          className="p-2 bg-white/5 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-colors border border-white/5"
                          title="Editar Perfil"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setSelectedLedgerPatient(patient.id)}
                          className="p-2 bg-white/5 hover:bg-indigo-500/20 text-indigo-400 rounded-xl transition-colors border border-white/5"
                          title="Ver Cuenta Corriente"
                        >
                          <FileText size={16} />
                        </button>
                        {shouldShowRenewCoverage(patient, coverageActiveMap) && (
                          <button
                            onClick={() => handleRenewCoverage(patient)}
                            disabled={renewingId === patient.id}
                            className="p-2 bg-white/5 hover:bg-teal-500/20 text-teal-400 rounded-xl transition-colors border border-white/5 disabled:opacity-50"
                            title="Renovar Cobertura"
                          >
                            <RefreshCw size={16} />
                          </button>
                        )}
                        {patient.isActive && (
                          <button 
                            onClick={() => setDeleteConfirmId(patient.id)} 
                            className="p-2 bg-white/5 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors border border-white/5"
                            title="Suspender"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassTableContainer>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <Award size={16} className="text-slate-500" />
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Promotor:</label>
            <select
              value={promoterFilter}
              onChange={(e) => setPromoterFilter(e.target.value)}
              className="bg-slate-900/80 border border-white/10 text-white rounded-xl px-4 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">Todos ({requests.length})</option>
              {promoterOptions.map(code => (
                <option key={code} value={code}>
                  {code === 'SIN_PROMOTOR' ? 'Sin promotor' : code} ({requests.filter(r => (r.promoter_id?.trim().toUpperCase() || 'SIN_PROMOTOR') === code).length})
                </option>
              ))}
            </select>
          </div>
        <GlassTableContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                  <th className="px-8 py-5">Titular</th>
                  <th className="px-6 py-5">DNI / Contacto</th>
                  <th className="px-6 py-5">Plan Solicitado</th>
                  <th className="px-6 py-5">Promotor</th>
                  <th className="px-6 py-5">Fecha</th>
                  <th className="px-8 py-5 text-right">Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isRequestsLoading ? (
                  <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500 italic animate-pulse">Sincronizando solicitudes del QR...</td></tr>
                ) : filteredRequests.length === 0 ? (
                  <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500 italic">No hay solicitudes de adhesión que coincidan con este filtro.</td></tr>
                ) : filteredRequests.map((req) => (
                  <tr key={req.id} className="group hover:bg-white/5 transition-all duration-200">
                    <td className="px-8 py-5">
                      <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {req.titular_last_name && req.titular_first_name
                          ? `${req.titular_last_name}, ${req.titular_first_name}`
                          : req.titular_name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{req.titular_email}</span>
                        {req.email_verified ? (
                          <span className="text-[8px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded flex items-center gap-0.5 uppercase tracking-wider">
                            <CheckCircle2 size={8} /> Verified
                          </span>
                        ) : (
                          <span className="text-[8px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1 py-0.2 rounded flex items-center gap-0.5 uppercase tracking-wider">
                            <AlertCircle size={8} /> Pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm text-slate-300 font-semibold">{req.titular_dni}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{req.titular_phone}</div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {req.plan_type}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      {req.promoter_id ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono">
                          {req.promoter_id}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600 italic">Sin promotor</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-slate-400 text-xs font-semibold">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => setSelectedRequest(req)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#020617] rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      >
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassTableContainer>
        </>
      )}

      {/* Premium Modal ABM */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 w-full max-w-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden max-h-[90vh] flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500"></div>

            <h3 className="text-2xl font-bold text-white mb-6 flex-shrink-0">
              {editId ? 'Editar' : 'Registrar'} <span className="text-emerald-500">Afiliado</span>
            </h3>

            <form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto custom-scrollbar pr-1">

              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Apellido *</label>
                  <input
                    type="text" required
                    placeholder="Flores"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600"
                    value={formData.lastName}
                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Nombre *</label>
                  <input
                    type="text" required
                    placeholder="Lourdes"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600"
                    value={formData.firstName}
                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
              </div>

              {/* DNI y CUIL */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">DNI *</label>
                  <input
                    type="text" required
                    placeholder="30123456"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600 font-mono"
                    value={formData.dni}
                    onChange={e => setFormData({ ...formData, dni: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">CUIL</label>
                  <input
                    type="text"
                    placeholder="27-30123456-9"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600 font-mono"
                    value={formData.cuil}
                    onChange={e => setFormData({ ...formData, cuil: e.target.value })}
                  />
                </div>
              </div>

              {/* Email y Teléfono */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Email *</label>
                  <input
                    type="email" required
                    placeholder="afiliado@ejemplo.com"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Teléfono</label>
                  <input
                    type="tel"
                    placeholder="+54 9 11 1234-5678"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              {/* Fecha de nacimiento */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Fecha de Nacimiento</label>
                <input
                  type="date"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors"
                  value={formData.birthDate}
                  onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                />
              </div>

              {/* Domicilio */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Domicilio</label>
                <input
                  type="text"
                  placeholder="Av. Corrientes 1234"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              {/* Localidad y Barrio */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Localidad</label>
                  <input
                    type="text"
                    placeholder="Buenos Aires"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600"
                    value={formData.locality}
                    onChange={e => setFormData({ ...formData, locality: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Barrio</label>
                  <input
                    type="text"
                    placeholder="Palermo"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600"
                    value={formData.neighborhood}
                    onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                  />
                </div>
              </div>

              {/* Plan */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Nivel de Cobertura</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-white outline-none focus:border-emerald-500/50 transition-colors appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.planId}
                  onChange={e => setFormData({ ...formData, planId: e.target.value })}
                  disabled={isLoadingPlans || plans.length === 0}
                >
                  {isLoadingPlans ? (
                    <option value="" className="bg-[#0f172a]">Cargando planes...</option>
                  ) : plans.length === 0 ? (
                    <option value="" className="bg-[#0f172a]">No hay planes disponibles</option>
                  ) : (
                    <>
                      <option value="" className="bg-[#0f172a]">Sin plan asignado</option>
                      {plans.map(plan => (
                        <option key={plan.id} value={plan.id} className="bg-[#0f172a]">
                          {plan.name} ({plan.isUnlimited ? '∞' : `${plan.bonifiedConsultations} consultas`})
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {!isLoadingPlans && plans.length === 0 && (
                  <p className="text-[10px] text-amber-500 mt-1 ml-1">
                    No hay planes cargados. Creá uno primero en la pestaña "Planes" de Convenios.
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-4 pt-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-emerald-500 hover:bg-emerald-400 text-[#020617] px-8 py-3 rounded-2xl font-bold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Procesando...' : 'Guardar Cambios'}
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
            <h3 className="text-xl font-bold text-white mb-2">¿Confirmar Suspensión?</h3>
            <p className="text-sm text-slate-400 mb-8 font-medium">El acceso a los servicios de MEDINEX será revocado inmediatamente.</p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors"
              >
                Ignorar
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
      {resetPasswordPatient && (
        <ResetPasswordModal
          userId={resetPasswordPatient.id}
          userName={resetPasswordPatient.name}
          userRole="patient"
          userDni={resetPasswordPatient.dni}
          onClose={() => setResetPasswordPatient(null)}
        />
      )}

      {/* Ledger Modal */}
      <AffiliateLedgerModal 
        isOpen={!!selectedLedgerPatient} 
        onClose={() => setSelectedLedgerPatient(null)} 
        patientId={selectedLedgerPatient || ''} 
      />

      {/* View Adhesion Request Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/90 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-[2.5rem] p-8 w-full max-w-3xl shadow-2xl relative my-8 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
            
            <div className="flex justify-between items-start border-b border-white/5 pb-4 mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">Revisar Solicitud de Adhesión</h3>
                <p className="text-slate-400 text-xs mt-1">Enviada el {selectedRequest.created_at ? new Date(selectedRequest.created_at).toLocaleString() : '-'}</p>
              </div>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer text-sm font-bold"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
              {/* Section 1: Titular Data */}
              <div className="space-y-4">
                <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <UserIcon size={14} />
                  1. Datos del Titular
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white/5 border border-white/5 p-5 rounded-2xl">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Nombre y Apellido</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.titular_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">DNI</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.titular_dni}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Fecha Nacimiento</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.titular_birth_date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Domicilio</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.titular_address}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Localidad (Barrio)</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.titular_locality} ({selectedRequest.titular_neighborhood})</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Estado Civil</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.titular_civil_status}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Email</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-white font-semibold break-all">{selectedRequest.titular_email}</span>
                      {selectedRequest.email_verified ? (
                        <span className="text-[8px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                          <CheckCircle2 size={8} /> Verified
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                          <AlertCircle size={8} /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Celular</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.titular_phone}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Obra Social / Prepaga</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.health_insurance || 'Ninguna'}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Plan and Payment */}
              <div className="space-y-4">
                <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard size={14} />
                  2. Plan Contratado y Pago
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white/5 border border-white/5 p-5 rounded-2xl">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Plan Elegido</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.plan_type}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Forma de Pago</span>
                    <span className="text-sm text-white font-semibold uppercase">{selectedRequest.payment_method}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Detalle de Pago</span>
                    <span className="text-sm text-white font-semibold">{selectedRequest.payment_detail || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Family Group */}
              <div className="space-y-4">
                <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} />
                  3. Grupo Familiar Conviviente ({selectedRequest.family_members?.length || 0})
                </h4>
                {selectedRequest.family_members && selectedRequest.family_members.length > 0 ? (
                  <div className="bg-slate-900/60 border border-white/5 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-white/5 text-slate-500 text-[10px] uppercase font-bold border-b border-white/10">
                          <th className="py-3 px-4">Nombre</th>
                          <th className="py-3 px-4">DNI</th>
                          <th className="py-3 px-4">F. Nacimiento</th>
                          <th className="py-3 px-4">Parentesco / Sexo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {selectedRequest.family_members.map((member: any, i: number) => (
                          <tr key={i} className="text-xs text-white">
                            <td className="py-3 px-4 font-bold">{member.name || member.fullName}</td>
                            <td className="py-3 px-4 font-mono">{member.dni}</td>
                            <td className="py-3 px-4">{member.birthDate || member.fechaNac}</td>
                            <td className="py-3 px-4 font-semibold">
                              <span className="text-teal-400 capitalize">{member.parentesco}</span> / <span className="text-slate-400">{member.sexo}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic bg-white/5 p-4 rounded-2xl">No se declararon integrantes convivientes adicionales.</p>
                )}
              </div>

              {/* Section 4: Medical History */}
              <div className="space-y-4">
                <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Heart size={14} />
                  4. Antecedentes Médicos
                </h4>
                <div className="bg-white/5 border border-white/5 p-5 rounded-2xl space-y-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1.5">Antecedentes Declarados</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedRequest.medical_history && selectedRequest.medical_history.length > 0 ? (
                        selectedRequest.medical_history.map((h: string) => (
                          <span key={h} className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
                            {h}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-slate-500/10 border border-slate-500/20 text-slate-400">
                          Ninguno
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedRequest.medical_history_other && (
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Otros Detalles / Medicación</span>
                      <span className="text-xs text-white font-medium">{selectedRequest.medical_history_other}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-3">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Recomendación (Contacto)</span>
                      <span className="text-xs text-white font-medium">{selectedRequest.recommended_friend_phone || 'Ninguna'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">¿Cómo nos conoció? (Contacto preferido)</span>
                      <span className="text-xs text-white font-medium">{selectedRequest.discovery_source} ({selectedRequest.preferred_contact_time})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5: Signature and Consents */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Award size={14} />
                    Firma Digitalizada
                  </h4>
                  <div className="bg-slate-950 border border-white/10 rounded-2xl p-4 flex items-center justify-center h-[120px]">
                    <img 
                      src={selectedRequest.signature_base64} 
                      alt="Firma del Titular" 
                      className="max-h-full max-w-full object-contain invert brightness-200" 
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    Consentimientos
                  </h4>
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl text-xs space-y-2 leading-relaxed">
                    <p className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span>Tratamiento de datos personales: <strong>Aceptado</strong> (Ley 25.326)</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${selectedRequest.consent_promotions ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                      <span>Recibir información y recordatorios: <strong>{selectedRequest.consent_promotions ? 'Aceptado' : 'No Aceptado'}</strong></span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/5 pt-6 mt-6 flex justify-between space-x-4">
              <button
                onClick={() => handleRejectRequest(selectedRequest.id!)}
                disabled={isSubmitting}
                className="px-6 py-3.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-2xl font-bold transition-all text-xs active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <XCircle size={16} />
                Rechazar
              </button>
              <button
                onClick={() => handleApproveRequest(selectedRequest.id!)}
                disabled={isSubmitting}
                className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-[#020617] rounded-2xl font-bold transition-all text-xs active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Aprobar y Registrar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Affiliates;
