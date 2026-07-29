import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Doctor, Appointment, MedicalRecord, Prescription, MedicalDocument, DoctorWorkShift } from '../../types';
import { Video, Calendar, Clock, Star, AlertCircle, FileText, CheckCircle, TrendingUp, Users, Activity, AlertTriangle, X, Search, Clipboard, Shield, ChevronRight, Zap, ArrowRight, MousePointer2, LogIn, LogOut as LogOutIcon, MapPin } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { medicalDocumentRepository } from '../../repositories/MedicalDocumentRepository';
import { prescriptionRepository } from '../../repositories/PrescriptionRepository';
import { dashboardRepository } from '../../repositories/DashboardRepository';
import { notificationRepository, Notification } from '../../repositories/NotificationRepository';
import { doctorShiftRepository } from '../../repositories/DoctorShiftRepository';
import { pharmacyRepository } from '../../repositories/PharmacyRepository';
import { FileText as FileIcon, File as FileGeneric, Image as ImageIcon, FlaskConical, Download, ExternalLink, History, FolderOpen, Pill } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { playArrivalSound } from '../../utils/audio';

interface Props {
    user: Doctor;
}

const DoctorDashboard: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
    const [doctorStatus, setDoctorStatus] = useState<'online' | 'away'>('online');
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

    const [isLoading, setIsLoading] = useState(true);

    const [queueAppointments, setQueueAppointments] = useState<Appointment[]>([]);
    const [historyAppointments, setHistoryAppointments] = useState<Appointment[]>([]);

    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
    const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);
    
    // New state for patient history modal
    const [patientRecords, setPatientRecords] = useState<MedicalRecord[]>([]);
    const [patientDocuments, setPatientDocuments] = useState<MedicalDocument[]>([]);
    const [historyView, setHistoryView] = useState<'records' | 'documents'>('records');
    const [isFetchingPatientHistory, setIsFetchingPatientHistory] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeArrivalAlert, setActiveArrivalAlert] = useState<{ patientName: string; appointmentId: string } | null>(null);
    const [searchDni, setSearchDni] = useState('');
    const [isSearchingDni, setIsSearchingDni] = useState(false);

    // Vademécum & Stock Farmacia state
    const [showPharmacyModal, setShowPharmacyModal] = useState(false);
    const [pharmacySearchQuery, setPharmacySearchQuery] = useState('');
    const [isSearchingPharmacy, setIsSearchingPharmacy] = useState(false);
    const [pharmacySearchResults, setPharmacySearchResults] = useState<Array<any>>([]);

    const handleSearchPharmacy = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setIsSearchingPharmacy(true);
        try {
            const results = await pharmacyRepository.searchProductsWithStock(pharmacySearchQuery);
            setPharmacySearchResults(results);
        } catch (err) {
            console.warn(err);
        } finally {
            setIsSearchingPharmacy(false);
        }
    };

    const handleSearchDni = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanDni = searchDni.trim();
        if (!cleanDni) return;
        setIsSearchingDni(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, dni')
                .ilike('dni', `%${cleanDni}%`)
                .limit(1);

            if (error || !data || data.length === 0) {
                setToast({ message: `No se encontró ningún paciente con DNI ${cleanDni}`, type: 'error' });
            } else {
                setSelectedPatientId(data[0].id);
                setToast({ message: `Expediente cargado para ${data[0].full_name}`, type: 'success' });
            }
        } catch (err) {
            console.error("Error al buscar paciente por DNI:", err);
            setToast({ message: 'Error al consultar la base de datos de pacientes.', type: 'error' });
        } finally {
            setIsSearchingDni(false);
        }
    };

    // Ref para saber si la primera carga ya ocurrió — evita disparar alertas
    // en el fetch inicial (cuando prevQueue todavía es el array vacío del estado).
    const isInitialLoadRef = React.useRef(true);
    const prevQueueRef = React.useRef<Appointment[]>([]);

    const [activeShift, setActiveShift] = useState<DoctorWorkShift | null>(null);
    const [shiftDurationText, setShiftDurationText] = useState('00h 00m 00s');
    const [isShiftLoading, setIsShiftLoading] = useState(false);

    useEffect(() => {
        const fetchShift = async () => {
            const shift = await doctorShiftRepository.getActiveShift(user.id);
            setActiveShift(shift);
            if (shift) {
                setDoctorStatus('online');
            }
        };
        fetchShift();
    }, [user.id]);

    useEffect(() => {
        if (!activeShift) {
            setShiftDurationText('00h 00m 00s');
            return;
        }

        const updateTimer = () => {
            const start = new Date(activeShift.clockIn).getTime();
            const now = new Date().getTime();
            const diffSec = Math.max(0, Math.floor((now - start) / 1000));

            const hours = Math.floor(diffSec / 3600);
            const minutes = Math.floor((diffSec % 3600) / 60);
            const seconds = diffSec % 60;

            const pad = (n: number) => n.toString().padStart(2, '0');
            setShiftDurationText(`${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [activeShift]);

    const handleClockIn = async () => {
        setIsShiftLoading(true);
        try {
            const res = await doctorShiftRepository.clockIn(user.id);
            setActiveShift(res.shift);
            setDoctorStatus('online');
            setToast({ message: `Jornada fichada exitosamente en ${res.matchedOffice.name}`, type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Error al fichar entrada', type: 'error' });
        } finally {
            setIsShiftLoading(false);
        }
    };

    const handleClockOut = async () => {
        if (!activeShift) return;
        setIsShiftLoading(true);
        try {
            const completed = await doctorShiftRepository.clockOut(activeShift.id);
            setActiveShift(null);
            setDoctorStatus('away');
            setToast({ message: `Jornada finalizada. Duración: ${completed.durationMinutes} min`, type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Error al fichar salida', type: 'error' });
        } finally {
            setIsShiftLoading(false);
        }
    };

    const [kpiTimeframe, setKpiTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [dynamicKPIs, setDynamicKPIs] = useState<{
        pendingConsultations: number;
        effectiveConsultations: number;
        avgSessionMinutes: number;
    }>({
        pendingConsultations: 0,
        effectiveConsultations: 0,
        avgSessionMinutes: 0
    });

    // El useEffect individual de loadKPIs se elimina porque ahora se carga
    // junto con el polling de la cola para mantener los números frescos.

    const location = useLocation();

    useEffect(() => {
        if (location.state?.successMessage) {
            setToast({ message: location.state.successMessage, type: 'success' });
            // Clean up state to avoid re-showing on refresh
            window.history.replaceState({}, document.title);
            
            const timer = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [location]);

    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                // Usar el nuevo Command Center View para la cola activa, y traer KPIs al mismo tiempo
                const [queueData, allAppts, kpis] = await Promise.all([
                    dashboardRepository.getDoctorQueue(user.id),
                    appointmentRepository.getDoctorAppointments(user.id),
                    dashboardRepository.getDoctorKPIs(user.id, kpiTimeframe)
                ]);

                setDynamicKPIs(kpis);

                // Mapear la cola desde la vista
                const mappedQueue = queueData.map(row => ({
                    id: row.appointment_id,
                    patientId: row.patient_id,
                    patientName: row.patient_name,
                    patientAvatar: row.patient_avatar,
                    patientPlan: row.patient_plan,
                    doctorId: row.doctor_id,
                    doctorName: "", 
                    date: new Date(row.scheduled_at).toISOString().split('T')[0],
                    time: new Date(row.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    status: row.status,
                    type: 'video',
                    consultationMetadata: row.consultation_metadata || {},
                }));

                // Lógica de alerta movida fuera del updater (debe ser pura en React)
                if (!isInitialLoadRef.current) {
                    const newlyConfirmed = mappedQueue.find(newAppt => {
                        if (newAppt.status !== 'confirmed') return false;

                        const wasAlreadyConfirmed = prevQueueRef.current.some(oldAppt =>
                            oldAppt.id === newAppt.id && oldAppt.status === 'confirmed'
                        );
                        return !wasAlreadyConfirmed;
                    });

                    if (newlyConfirmed) {
                        playArrivalSound();
                        setActiveArrivalAlert({
                            patientName: newlyConfirmed.patientName,
                            appointmentId: newlyConfirmed.id
                        });
                    }
                } else {
                    isInitialLoadRef.current = false;
                }
                
                prevQueueRef.current = mappedQueue;
                setQueueAppointments(mappedQueue);
                setHistoryAppointments(allAppts.filter(a => a.status === 'completed'));
            } catch (error) {
                console.error("Error cargando turnos:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAppointments();

        // Polling fallback cada 30s: garantiza que la cola se sincronice aunque
        // Supabase Realtime no dispare (ej: tabla 'appointments' fuera de la
        // publicación supabase_realtime, o evento de cancelación del paciente
        // que no llega al canal del médico).
        const pollingInterval = setInterval(() => {
            console.log('[DoctorDashboard] Polling fallback: refrescando cola...');
            fetchAppointments();
        }, 30_000);

        // Suscripción a notificaciones en tiempo real
        const subscription = notificationRepository.subscribeToNotifications(user.id, (notif) => {
            console.log("Nueva notificación recibida:", notif);
            // Podríamos disparar un toast o refrescar la cola si el tipo es relevante
            if (notif.message.toLowerCase().includes('llegó') || notif.message.toLowerCase().includes('turno')) {
                fetchAppointments();
            }
        });

        // Suscripción en tiempo real a la tabla de appointments.
        // Canal nombrado con user.id para evitar colisiones si varios médicos
        // tienen el dashboard abierto simultáneamente.
        const channel = supabase
            .channel(`doctor-dashboard-${user.id}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'appointments',
                filter: `doctor_id=eq.${user.id}`
            }, () => {
                console.log('Cambio detectado en appointments, refrescando cola...');
                fetchAppointments();
            })
            .subscribe((status) => {
                console.log(`[DoctorDashboard] Realtime channel status: ${status}`);
            });

        return () => {
            clearInterval(pollingInterval);
            subscription.unsubscribe();
            supabase.removeChannel(channel);
        };
    }, [user.id, kpiTimeframe]);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!selectedAppointment) {
                setSelectedRecord(null);
                setSelectedPrescription(null);
                return;
            }

            setIsFetchingDetails(true);
            try {
                const [record, prescription] = await Promise.all([
                    medicalRecordRepository.getRecordByAppointmentId(selectedAppointment.id),
                    prescriptionRepository.getPrescriptionByAppointmentId(selectedAppointment.id)
                ]);
                setSelectedRecord(record);
                setSelectedPrescription(prescription);
            } catch (error) {
                console.error("Error cargando detalles de consulta:", error);
            } finally {
                setIsFetchingDetails(false);
            }
        };

        fetchDetails();
    }, [selectedAppointment]);

    useEffect(() => {
        const fetchPatientHistory = async () => {
            if (!selectedPatientId) {
                setPatientRecords([]);
                setPatientDocuments([]);
                return;
            }

            setIsFetchingPatientHistory(true);
            try {
                const [records, docs] = await Promise.all([
                    medicalRecordRepository.getRecordsByPatientId(selectedPatientId),
                    medicalDocumentRepository.getDocumentsByPatientId(selectedPatientId)
                ]);
                setPatientRecords(records);
                setPatientDocuments(docs);
            } catch (error) {
                console.error("Error cargando historia del paciente:", error);
            } finally {
                setIsFetchingPatientHistory(false);
            }
        };

        fetchPatientHistory();
    }, [selectedPatientId]);

    const metrics = user.metrics;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 space-y-8 relative overflow-hidden font-sans">
            {/* Cinematic Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[160px] pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>

            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-10 duration-500">
                    <div className={`px-8 py-4 rounded-2xl backdrop-blur-xl border flex items-center gap-4 shadow-3xl ${
                        toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-red-500/20 border-red-500/50 text-red-400'
                    }`}>
                        {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                        <p className="text-sm font-bold uppercase tracking-widest">{toast.message}</p>
                        <button onClick={() => setToast(null)} className="ml-4 hover:scale-110 transition-transform">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Patient Arrival Alert Banner */}
            {activeArrivalAlert && (
                <div className="fixed bottom-6 right-6 z-[200] max-w-md w-full animate-in fade-in slide-in-from-bottom-10 duration-500">
                    <div className="bg-slate-900/90 backdrop-blur-2xl border border-emerald-500/40 rounded-3xl p-5 shadow-2xl shadow-emerald-950/20 relative overflow-hidden flex flex-col gap-4">
                        {/* Glow decorativo de fondo */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
                        
                        <div className="flex items-start gap-4">
                            {/* Radar y campana */}
                            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                                <Zap size={22} className="animate-pulse" />
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                            </div>

                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">¡Paciente en sala de espera!</span>
                                <h4 className="text-base font-bold text-white leading-tight">
                                    {activeArrivalAlert.patientName}
                                </h4>
                                <p className="text-xs text-slate-400">
                                    Acaba de ingresar a la sala de espera para su consulta programada.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                            <button
                                onClick={() => {
                                    // Seleccionar el turno correspondiente en la cola
                                    const appt = queueAppointments.find(a => a.id === activeArrivalAlert.appointmentId);
                                    if (appt) {
                                        setSelectedAppointment(appt);
                                        setSelectedPatientId(appt.patientId);
                                    }
                                    setActiveArrivalAlert(null);
                                }}
                                className="flex-1 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span>Ver Ficha del Paciente</span>
                                <ArrowRight size={14} />
                            </button>
                            <button
                                onClick={() => setActiveArrivalAlert(null)}
                                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-white/5 cursor-pointer"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
                <div className="space-y-2">
                    <div className="flex items-center space-x-3 group">
                        <div className="h-0.5 w-12 bg-emerald-500/50 group-hover:w-16 transition-all duration-700"></div>
                        <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-[0.4em] drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">System Active • Dr. {user.specialty}</span>
                    </div>
                    <h1 className="text-6xl font-bold text-white tracking-tighter leading-none">
                        Dashboard <span className="text-emerald-500">Médico</span>
                    </h1>
                    <div className="flex items-center gap-3 pt-1">
                        <Clock size={14} className="text-emerald-500" /> 
                        <span className="text-slate-400 font-medium text-sm tracking-wide">Estado actual:</span>
                        <button
                            onClick={() => setDoctorStatus(prev => prev === 'online' ? 'away' : 'online')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2.5 transition-all duration-300 border backdrop-blur-md shadow-lg active:scale-95 ${
                                doctorStatus === 'online'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-emerald-500/5'
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 shadow-amber-500/5'
                            }`}
                        >
                            <span>{doctorStatus === 'online' ? 'EN LÍNEA' : 'AUSENTE'}</span>
                            <div className="relative flex items-center justify-center">
                                <span className={`w-2 h-2 rounded-full ${
                                    doctorStatus === 'online' ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}></span>
                                {doctorStatus === 'online' && (
                                    <span className="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                                )}
                            </div>
                        </button>
                    </div>
                </div>

                {/* Control de Jornada Laboral Card */}
                <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-6 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                            activeShift ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                        }`}>
                            <Activity size={24} className={activeShift ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Jornada Laboral</span>
                                {activeShift && (
                                    <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 flex items-center gap-1">
                                        <MapPin size={10} /> {activeShift.officeName}
                                    </span>
                                )}
                            </div>
                            <p className="text-2xl font-bold text-white tracking-tight font-mono mt-0.5">
                                {shiftDurationText}
                            </p>
                        </div>
                    </div>

                    <div className="h-10 w-px bg-white/5 hidden sm:block"></div>

                    <div>
                        {activeShift ? (
                            <button
                                onClick={handleClockOut}
                                disabled={isShiftLoading}
                                className="px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-500/5 disabled:opacity-50"
                            >
                                {isShiftLoading ? <div className="w-4 h-4 border-2 border-red-400/20 border-t-red-400 rounded-full animate-spin"></div> : <LogOutIcon size={16} />}
                                <span>Fichar Salida</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleClockIn}
                                disabled={isShiftLoading}
                                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                            >
                                {isShiftLoading ? <div className="w-4 h-4 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin"></div> : <LogIn size={16} />}
                                <span>Fichar Entrada</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Metrics HUD */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
                {/* Consultas Pendientes Card */}
                <div className="bg-slate-900/40 backdrop-blur-2xl p-4 rounded-[1.25rem] border border-white/5 relative group hover:border-amber-500/20 transition-all duration-700 overflow-hidden">
                    <div className="absolute -right-3 -top-3 w-16 h-16 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors"></div>
                    <div className="flex justify-between items-start mb-3">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Consultas Pendientes</p>
                        <Clock className="text-amber-500/60 group-hover:rotate-12 transition-transform" size={14} />
                    </div>
                    <div className="flex items-baseline gap-3">
                        <h3 className="text-2xl font-bold text-white tracking-tighter group-hover:scale-105 transition-transform origin-left duration-700">{dynamicKPIs.pendingConsultations}</h3>
                        <span className="text-xs font-bold text-amber-400 tracking-wider uppercase">En Cola</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                         <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                            <div className="bg-amber-500 h-full w-[100%] rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                         </div>
                    </div>
                </div>

                {/* Consultas Efectivas Card */}
                <div className="bg-slate-900/40 backdrop-blur-2xl p-4 rounded-[1.25rem] border border-white/5 relative group hover:border-emerald-500/20 transition-all duration-700 overflow-hidden">
                    <div className="absolute -right-3 -top-3 w-16 h-16 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
                    <div className="flex justify-between items-start mb-3">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Consultas Efectivas</p>
                        <CheckCircle className="text-emerald-500/60" size={14} />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-bold text-white tracking-tighter">{dynamicKPIs.effectiveConsultations}</h3>
                        <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">Completadas</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Atenciones Exitosas</span>
                        <span className="text-[10px] font-bold text-emerald-400">100% Registro</span>
                    </div>
                </div>

                {/* Tiempo Promedio de Sesión Card (Con Selector Diaria / Semanal / Mensual) */}
                <div className="bg-slate-900/40 backdrop-blur-2xl p-4 rounded-[1.25rem] border border-white/5 relative group hover:border-blue-500/20 transition-all duration-700 overflow-hidden md:col-span-2 lg:col-span-1">
                    <div className="absolute -right-3 -top-3 w-16 h-16 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"></div>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Promedio Sesión</p>
                        <Activity className="text-blue-500/60" size={14} />
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <h3 className="text-2xl font-bold text-white tracking-tighter">
                            {dynamicKPIs.effectiveConsultations > 0
                                ? <>{dynamicKPIs.avgSessionMinutes} <span className="text-base font-normal text-slate-400">min</span></>
                                : '—'}
                        </h3>
                    </div>

                    {/* Botonera de Selector Rango Temporal */}
                    <div className="flex p-1 bg-slate-950/60 rounded-xl border border-white/5 gap-1">
                        <button
                            onClick={() => setKpiTimeframe('daily')}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                                kpiTimeframe === 'daily' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            Diaria
                        </button>
                        <button
                            onClick={() => setKpiTimeframe('weekly')}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                                kpiTimeframe === 'weekly' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            Semanal
                        </button>
                        <button
                            onClick={() => setKpiTimeframe('monthly')}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                                kpiTimeframe === 'monthly' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            Mensual
                        </button>
                    </div>
                </div>

                {/* Reputación Card */}
                {metrics && (
                    <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 relative group hover:border-yellow-500/20 transition-all duration-700 overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-yellow-500/5 rounded-full blur-2xl group-hover:bg-yellow-500/10 transition-colors"></div>
                        <div className="flex justify-between items-start mb-6">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Reputación</p>
                            <Star className="text-yellow-500/40 group-hover:rotate-12 transition-transform" size={20} />
                        </div>
                        <div className="flex items-baseline gap-3">
                            <h3 className="text-5xl font-bold text-white tracking-tighter group-hover:scale-105 transition-transform origin-left duration-700">{metrics.starRating}</h3>
                            <div className="flex text-yellow-500/30 gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <Star key={s} fill={s <= Math.round(metrics.starRating) ? "#eab308" : "none"} size={12} className={s <= Math.round(metrics.starRating) ? "drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" : ""} />
                                ))}
                            </div>
                        </div>
                        <div className="mt-8 flex items-center gap-3">
                             <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                                <div className="bg-yellow-500 h-full w-[95%] rounded-full shadow-[0_0_8px_rgba(234,179,8,0.5)]"></div>
                             </div>
                        </div>
                    </div>
                )}
            </section>

            {/* Main Operational Area */}
            <section className="space-y-6 relative z-10">
                {/* Navigation & List */}
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900/20 p-4 rounded-[2rem] border border-white/5 backdrop-blur-xl">
                        <div className="flex p-1.5 bg-slate-950/50 rounded-2xl w-fit border border-white/5">
                            <button
                                onClick={() => setActiveTab('queue')}
                                className={`px-8 py-3.5 font-bold text-[10px] uppercase tracking-[0.2em] transition-all duration-500 rounded-xl flex items-center gap-3 ${activeTab === 'queue' ? 'bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Users size={14} /> Sala de Espera
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-8 py-3.5 font-bold text-[10px] uppercase tracking-[0.2em] transition-all duration-500 rounded-xl flex items-center gap-3 ${activeTab === 'history' ? 'bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Search size={14} /> Historial Total
                            </button>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <button
                                type="button"
                                onClick={() => { setShowPharmacyModal(true); handleSearchPharmacy(); }}
                                className="px-5 py-4 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-2xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-500/5 cursor-pointer"
                            >
                                <Pill size={16} />
                                <span>Vademécum & Stock</span>
                            </button>

                            <form onSubmit={handleSearchDni} className="relative group w-full sm:w-auto">
                                <button type="submit" disabled={isSearchingDni} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-500 hover:text-emerald-400 transition-colors">
                                    {isSearchingDni ? <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div> : <Search size={16} />}
                                </button>
                                <input 
                                    type="text" 
                                    value={searchDni}
                                    onChange={(e) => setSearchDni(e.target.value)}
                                    placeholder="BUSCAR PACIENTE POR DNI..." 
                                    className="bg-slate-950/50 border border-white/5 pl-14 pr-6 py-4 rounded-2xl text-[10px] font-bold tracking-widest text-white placeholder:text-slate-700 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all w-full sm:w-72"
                                />
                            </form>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {activeTab === 'queue' ? (
                            isLoading ? (
                                <div className="flex flex-col items-center justify-center py-32 bg-slate-900/10 rounded-[3rem] border border-white/5 border-dashed">
                                    <div className="w-16 h-16 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-emerald-500/70 animate-pulse">Inyectando datos en tiempo real...</span>
                                </div>
                            ) : queueAppointments.length > 0 ? (
                                queueAppointments.map((apt, idx) => (
                                    <div key={apt.id} className="group relative bg-slate-900/20 hover:bg-slate-900/40 backdrop-blur-xl rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 border border-white/5 hover:border-emerald-500/30 transition-all duration-500 flex flex-col md:flex-row md:items-center justify-between gap-6 sm:gap-8 overflow-hidden">
                                        {/* Row Decoration */}
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                                        <div className="absolute right-0 top-0 p-8 text-white/[0.01] pointer-events-none font-bold text-8xl italic">0{idx+1}</div>

                                        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 relative z-10 text-center sm:text-left w-full md:w-auto">
                                            <div className="relative">
                                                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-950 border border-white/10 rounded-2xl sm:rounded-3xl flex items-center justify-center text-white font-bold text-2xl sm:text-3xl shadow-2xl group-hover:scale-105 transition-transform duration-700 overflow-hidden mx-auto">
                                                    {apt.patientAvatar ? (
                                                        <img src={apt.patientAvatar} alt={apt.patientName} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                                    ) : (
                                                        <span className="text-white font-bold">{apt.patientName.charAt(0)}</span>
                                                    )}
                                                </div>
                                                <div className={`absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 border-2 sm:border-4 border-slate-950 rounded-full ${apt.status === 'confirmed' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-amber-500'}`}></div>
                                            </div>
                                            
                                            <div className="space-y-1">
                                                <h4 className="text-xl sm:text-2xl font-bold text-white tracking-tighter group-hover:text-emerald-400 transition-colors truncate">{apt.patientName}</h4>
                                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 sm:gap-3">
                                                    <div className="flex items-center gap-2 bg-slate-950/80 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-white/5">
                                                        <Clock size={12} className="text-emerald-500" />
                                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{apt.time}</span>
                                                    </div>
                                                    <span className="text-[9px] font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 bg-blue-500/10 text-blue-400 rounded-lg sm:rounded-xl border border-blue-500/20 uppercase tracking-widest">
                                                        {apt.patientPlan || 'Sin plan asignado'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 relative z-10 w-full md:w-auto pt-4 md:pt-0 border-t border-white/5 md:border-t-0">
                                            <button 
                                                onClick={() => setSelectedPatientId(apt.patientId)}
                                                className="h-12 sm:h-14 px-6 sm:px-8 bg-slate-950 hover:bg-slate-900 border border-white/5 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2.5 sm:gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-white transition-all group/btn"
                                            >
                                                <FileText size={14} className="group-hover/btn:text-emerald-500 transition-colors" /> Expediente
                                            </button>
                                            
                                            {apt.status === 'confirmed' ? (
                                                <Link
                                                    to={`/room/${apt.id}`}
                                                    className="h-12 sm:h-14 px-8 sm:px-10 bg-white hover:bg-emerald-500 text-slate-950 hover:text-white rounded-xl sm:rounded-2xl flex items-center justify-center gap-3 sm:gap-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-2xl shadow-white/5 hover:shadow-emerald-500/40 active:scale-95"
                                                >
                                                    <Video size={16} /> Iniciar Llamada
                                                    <Zap size={12} className="animate-bounce" />
                                                </Link>
                                            ) : (
                                                <div className="h-12 sm:h-14 px-8 sm:px-10 bg-amber-500/5 border border-amber-500/20 text-amber-500 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2.5 sm:gap-3 text-[10px] font-bold uppercase tracking-widest">
                                                    <Activity size={14} className="animate-pulse" /> En Espera
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-40 bg-slate-900/10 rounded-[3rem] border border-white/5 border-dashed">
                                    <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8">
                                        <Zap size={40} className="text-slate-800" />
                                    </div>
                                    <h5 className="text-[11px] font-bold text-slate-600 uppercase tracking-[0.4em]">Sin tráfico de pacientes activo</h5>
                                </div>
                            )
                        ) : (
                            historyAppointments.length > 0 ? (
                                historyAppointments.map(apt => (
                                    <div key={apt.id} className="group bg-slate-900/20 hover:bg-white/[0.02] rounded-[2.5rem] p-8 border border-white/5 transition-all duration-500 flex flex-col md:flex-row md:items-center justify-between gap-8">
                                        <div className="flex items-center gap-6">
                                            <div className="w-16 h-16 bg-slate-950 border border-white/5 rounded-2xl flex items-center justify-center font-bold text-slate-500 text-xl group-hover:text-white transition-colors">
                                                {apt.patientName.charAt(0)}
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-bold text-white tracking-tight">{apt.patientName}</h4>
                                                <div className="flex items-center gap-6 mt-2">
                                                    <span className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                        <Calendar size={12} className="text-blue-500" /> {apt.date}
                                                    </span>
                                                    <span className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                        <Clock size={12} className="text-blue-500" /> {apt.time}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="hidden sm:flex items-center gap-2 bg-emerald-500/5 px-4 py-2 rounded-xl border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                                <CheckCircle size={14} /> Atendido
                                            </div>
                                            <button 
                                                onClick={() => setSelectedAppointment(apt)}
                                                className="h-12 px-8 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-white uppercase tracking-widest transition-all"
                                            >
                                                Ver Resumen
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-40 bg-slate-900/10 rounded-[3rem]">
                                    <Search size={48} className="mx-auto text-slate-800 mb-6" />
                                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.4em]">No se encontraron registros previos</p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </section>

            {/* Modals with Premium Refactor */}
            {selectedPatientId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" onClick={() => setSelectedPatientId(null)}></div>
                    <div className="bg-slate-900 border border-white/10 rounded-[2rem] sm:rounded-[3.5rem] w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-3xl relative animate-in fade-in slide-in-from-bottom-10 duration-700">
                        <div className="p-6 sm:p-8 md:p-12 border-b border-white/5 flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-950/30 gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.4em]">Secure Access Point</span>
                                </div>
                                <h3 className="font-bold text-3xl sm:text-4xl text-white tracking-tighter">Bóveda Médica</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">ID_PACIENTE: {selectedPatientId.toUpperCase()}</p>
                            </div>

                            <div className="flex flex-wrap p-1 bg-slate-950/50 rounded-2xl border border-white/5 w-full lg:w-auto gap-1">
                                <button
                                    onClick={() => setHistoryView('records')}
                                    className={`flex-1 lg:flex-initial px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${historyView === 'records' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <History size={14} /> Evoluciones
                                </button>
                                <button
                                    onClick={() => setHistoryView('documents')}
                                    className={`flex-1 lg:flex-initial px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${historyView === 'documents' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <FolderOpen size={14} /> Estudios
                                </button>
                            </div>

                            <button onClick={() => setSelectedPatientId(null)} className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl sm:rounded-2xl bg-white/5 text-slate-400 hover:text-white hover:bg-red-500/20 hover:text-red-500 transition-all duration-500 self-end lg:self-auto">
                                <X size={24} className="sm:w-7 sm:h-7" />
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto p-5 sm:p-8 md:p-12 space-y-10 custom-scrollbar flex-1">
                            {isFetchingPatientHistory ? (
                                <div className="flex flex-col items-center justify-center py-24">
                                    <div className="w-16 h-16 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-8"></div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-emerald-500 animate-pulse">Desencriptando registros históricos...</p>
                                </div>
                            ) : historyView === 'records' ? (
                                patientRecords.length > 0 ? (
                                    <div className="space-y-8 relative">
                                        <div className="absolute left-6 top-0 bottom-0 w-px bg-white/5"></div>
                                        {patientRecords.map((record, idx) => (
                                            <div key={record.id} className="relative pl-16">
                                                <div className="absolute left-[20px] top-4 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] z-10"></div>
                                                <div className="bg-white/[0.03] hover:bg-white/[0.06] rounded-[2.5rem] p-10 border border-white/5 hover:border-emerald-500/30 transition-all duration-500 group shadow-2xl">
                                                    <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-4">
                                                                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20">{record.type}</span>
                                                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{record.date}</span>
                                                            </div>
                                                            <h4 className="font-bold text-white text-3xl tracking-tighter leading-none group-hover:text-emerald-400 transition-colors">{record.diagnosis}</h4>
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-950/50 p-8 rounded-[2rem] border border-white/5 italic">
                                                        <p className="text-slate-400 text-base leading-relaxed font-medium">"{record.notes}"</p>
                                                    </div>
                                                    <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-500 font-bold border border-white/10 shadow-inner">
                                                                {record.doctorName?.charAt(0) || 'D'}
                                                            </div>
                                                            <div>
                                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Emitido por</p>
                                                                    <p className="text-sm font-bold text-white tracking-tight">Dr. {record.doctorName?.split(' ').pop()}</p>
                                                            </div>
                                                        </div>
                                                        <button className="p-4 bg-white/5 hover:bg-emerald-500 hover:text-slate-950 rounded-2xl transition-all duration-500 text-white shadow-xl">
                                                            <ArrowRight size={20} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-32 bg-slate-950/30 rounded-[3rem] border border-white/5 border-dashed">
                                        <div className="bg-white/5 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
                                            <Search size={40} className="text-slate-800" />
                                        </div>
                                        <p className="text-slate-600 font-bold uppercase tracking-[0.4em] text-[11px]">Memoria de registros vacía</p>
                                    </div>
                                )
                            ) : (
                                patientDocuments.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {patientDocuments.map((doc) => (
                                            <div key={doc.id} className="bg-white/[0.03] hover:bg-white/[0.06] rounded-[2.5rem] p-8 border border-white/5 hover:border-emerald-500/30 transition-all duration-500 group relative overflow-hidden">
                                                <div className="flex items-start justify-between mb-6">
                                                    <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 text-emerald-500 group-hover:scale-110 transition-transform">
                                                        {doc.type === 'lab_result' ? <FlaskConical size={24} /> : 
                                                         doc.type === 'imaging' ? <ImageIcon size={24} /> : 
                                                         <FileGeneric size={24} />}
                                                    </div>
                                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">{doc.date}</span>
                                                </div>
                                                <h4 className="text-xl font-bold text-white tracking-tight mb-2 group-hover:text-emerald-400 transition-colors">{doc.title}</h4>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">{doc.type === 'lab_result' ? 'Análisis de Laboratorio' : doc.type === 'imaging' ? 'Estudio de Imagen' : 'Documentación Médica'}</p>
                                                
                                                <div className="flex gap-3">
                                                    <a 
                                                        href={doc.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex-1 py-4 bg-white/5 hover:bg-emerald-500 text-white hover:text-slate-950 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <ExternalLink size={14} /> Ver Online
                                                    </a>
                                                    <button className="p-4 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-all">
                                                        <Download size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-32 bg-slate-950/30 rounded-[3rem] border border-white/5 border-dashed">
                                        <div className="bg-white/5 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
                                            <FolderOpen size={40} className="text-slate-800" />
                                        </div>
                                        <p className="text-slate-600 font-bold uppercase tracking-[0.4em] text-[11px]">No hay documentos cargados</p>
                                    </div>
                                )
                            )}
                        </div>

                        <div className="p-10 border-t border-white/5 bg-slate-950/50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Shield size={16} className="text-emerald-500" />
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.3em]">End-to-End Encryption Enabled</span>
                            </div>
                            <button
                                onClick={() => setSelectedPatientId(null)}
                                className="px-14 py-5 bg-white hover:bg-emerald-500 text-slate-950 hover:text-white rounded-[1.5rem] font-bold uppercase tracking-[0.3em] text-[10px] transition-all shadow-3xl active:scale-95"
                            >
                                Cerrar Bóveda
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Consultation Details Modal */}
            {selectedAppointment && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-3xl" onClick={() => setSelectedAppointment(null)}></div>
                    <div className="bg-slate-900 border border-white/10 rounded-[4rem] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] relative animate-in fade-in zoom-in duration-700">
                        {/* Header estio Ticket */}
                        <div className="p-12 bg-white text-slate-950 relative overflow-hidden">
                            <div className="absolute right-[-5%] top-[-10%] opacity-5 rotate-12 scale-150">
                                <Shield size={300} />
                            </div>
                            <div className="flex justify-between items-start relative z-10">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="px-3 py-1 bg-slate-950 text-white text-[9px] font-bold uppercase tracking-[0.3em] rounded-full">Protocolo {selectedAppointment.id.slice(0, 8)}</span>
                                    </div>
                                    <h3 className="font-bold text-5xl tracking-tighter uppercase leading-none">Resumen <span className="text-emerald-600 italic">Clínico</span></h3>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.4em] pt-2">Paciente: {selectedAppointment.patientName} • {selectedAppointment.date}</p>
                                </div>
                                <button onClick={() => setSelectedAppointment(null)} className="w-16 h-16 flex items-center justify-center rounded-[1.5rem] bg-slate-950 text-white hover:bg-emerald-600 transition-all duration-500 shadow-2xl">
                                    <X size={32} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="overflow-y-auto p-12 space-y-16 custom-scrollbar">
                            {isFetchingDetails ? (
                                <div className="flex flex-col items-center justify-center py-32">
                                    <div className="w-20 h-20 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-8"></div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.5em] text-emerald-500 animate-pulse">Sincronizando con nodo de datos...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Medical Record Section */}
                                    <section className="space-y-10">
                                        <div className="flex items-center text-white font-bold uppercase tracking-[0.4em] text-[11px]">
                                            <span className="w-12 h-px bg-emerald-500/50 mr-4"></span>
                                            Conclusiones Médicas
                                        </div>
                                        {selectedRecord ? (
                                            <div className="bg-white/5 p-12 rounded-[3.5rem] border border-white/5 relative group shadow-inner">
                                                <div className="absolute right-10 top-10 text-white/[0.01] pointer-events-none transition-transform duration-1000 group-hover:scale-110">
                                                    <Activity size={240} />
                                                </div>
                                                <div className="mb-10 relative z-10">
                                                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.3em] mb-4">Diagnóstico Principal</p>
                                                    <p className="text-4xl font-bold text-white tracking-tighter leading-tight drop-shadow-2xl">{selectedRecord.diagnosis}</p>
                                                </div>
                                                <div className="relative z-10 space-y-4">
                                                    <div className="h-px w-full bg-white/5 mb-8"></div>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mb-4">
                                                        <Clipboard size={14} className="text-emerald-500" /> Notas de Campo
                                                    </div>
                                                    <div className="bg-slate-950/80 p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                                                        <p className="text-slate-300 text-lg leading-relaxed font-medium italic">"{selectedRecord.notes}"</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-20 bg-amber-500/5 rounded-[3rem] border border-amber-500/10">
                                                <AlertCircle size={40} className="mx-auto text-amber-500/40 mb-6" />
                                                <p className="text-[11px] font-bold text-amber-500 uppercase tracking-[0.4em]">Sin diagnóstico registrado en este nodo</p>
                                            </div>
                                        )}
                                    </section>

                                    {/* Prescription Section */}
                                    <section className="space-y-10 pb-10">
                                        <div className="flex items-center text-white font-bold uppercase tracking-[0.4em] text-[11px]">
                                            <span className="w-12 h-px bg-blue-500/50 mr-4"></span>
                                            Prescripción Farmacológica
                                        </div>
                                        {selectedPrescription ? (
                                            <div className="bg-slate-950/40 p-12 rounded-[3.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
                                                <div className="absolute inset-0 bg-blue-500/[0.01] group-hover:bg-blue-500/[0.03] transition-colors duration-1000"></div>
                                                
                                                <div className="flex justify-between items-center mb-12 relative z-10">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                                                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.3em]">Validado via Blockchain</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-700 font-mono font-bold tracking-widest">{selectedPrescription.id.toUpperCase()}</span>
                                                </div>

                                                <div className="space-y-6 relative z-10">
                                                    {selectedPrescription.medications.map((med, idx) => (
                                                        <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-8 bg-white/[0.03] hover:bg-white/[0.07] rounded-[2.5rem] border border-white/5 transition-all duration-500">
                                                            <div className="space-y-2 mb-4 md:mb-0">
                                                                <h5 className="font-bold text-white text-2xl tracking-tighter">{med.name}</h5>
                                                                <div className="flex items-center gap-3">
                                                                    <Zap size={12} className="text-blue-500" />
                                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{med.instructions}</p>
                                                                </div>
                                                            </div>
                                                            <div className="px-6 py-3 bg-blue-500 text-slate-950 rounded-2xl font-bold text-xs tracking-tighter shadow-xl shadow-blue-500/20">
                                                                CANT: {med.quantity}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {selectedPrescription.notes && (
                                                    <div className="mt-12 pt-10 border-t border-white/5 relative z-10">
                                                        <div className="flex items-center gap-3 mb-6">
                                                            <MousePointer2 size={14} className="text-slate-600" />
                                                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.3em]">Instrucciones Clínicas</p>
                                                        </div>
                                                        <p className="text-slate-400 text-base italic font-medium leading-relaxed bg-white/[0.02] p-8 rounded-[2rem] border border-white/5">"{selectedPrescription.notes}"</p>
                                                    </div>
                                                )}

                                                <div className="mt-12 flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] bg-white/5 px-6 py-3 rounded-2xl border border-white/5">
                                                        <Calendar size={14} className="text-slate-700" /> Caduca: {selectedPrescription.expirationDate}
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <div className="text-[9px] text-slate-800 font-mono mb-2 max-w-[200px] truncate">{selectedPrescription.digitalSignature}</div>
                                                        <div className="flex items-center gap-3 text-[10px] font-bold text-emerald-500 uppercase tracking-[0.3em]">
                                                            <Shield size={14} className="drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" /> Signature Verified
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-20 bg-white/5 rounded-[3rem] border border-white/5 border-dashed">
                                                <FileText size={40} className="mx-auto text-slate-800 mb-6" />
                                                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-[0.4em]">Sin prescripciones en este registro</p>
                                            </div>
                                        )}
                                    </section>
                                </>
                            )}
                        </div>
                        
                        <div className="p-12 border-t border-white/5 bg-slate-950/80 flex flex-col md:flex-row justify-between items-center gap-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center text-emerald-500 shadow-inner">
                                    <Shield size={24} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] leading-none mb-1">Status de Seguridad</p>
                                    <p className="text-xs font-bold text-white tracking-tight uppercase">Hash de Sesión Consolidado</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedAppointment(null)}
                                className="w-full md:w-auto px-16 py-6 bg-emerald-500 text-slate-950 hover:bg-white rounded-[2rem] font-bold uppercase tracking-[0.3em] text-[11px] transition-all duration-500 shadow-[0_0_40px_rgba(16,185,129,0.3)] active:scale-95"
                            >
                                Archivar Protocolo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vademécum & Stock Farmacia Modal */}
            {showPharmacyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-[#0f172a] border border-white/10 rounded-[2.5rem] p-8 w-full max-w-3xl shadow-2xl relative flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                                    <Pill className="text-blue-400" size={28} />
                                    Vademécum & Stock Farmacia
                                </h3>
                                <p className="text-slate-400 text-xs mt-1">Consulte el catálogo y las existencias en vivo antes de recetar.</p>
                            </div>
                            <button
                                onClick={() => setShowPharmacyModal(false)}
                                className="p-3 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-2xl transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSearchPharmacy} className="flex gap-3 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    value={pharmacySearchQuery}
                                    onChange={(e) => setPharmacySearchQuery(e.target.value)}
                                    placeholder="Buscar medicamento, droga o laboratorio..."
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white text-sm focus:outline-none focus:border-blue-500/50"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSearchingPharmacy}
                                className="px-6 py-3.5 bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                            >
                                {isSearchingPharmacy ? 'Buscando...' : 'Buscar'}
                            </button>
                        </form>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                            {isSearchingPharmacy ? (
                                <div className="text-center py-12 text-slate-500 animate-pulse text-xs font-bold uppercase tracking-widest">
                                    Consultando inventario en tiempo real...
                                </div>
                            ) : pharmacySearchResults.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 text-xs italic">
                                    {pharmacySearchQuery ? 'No se encontraron medicamentos para esa búsqueda.' : 'Ingrese un término de búsqueda para ver existencias.'}
                                </div>
                            ) : (
                                pharmacySearchResults.map((item) => (
                                    <div key={item.id} className="bg-white/5 border border-white/5 p-5 rounded-2xl flex items-center justify-between hover:border-blue-500/30 transition-all">
                                        <div className="space-y-1">
                                            <h4 className="text-base font-bold text-white tracking-tight">{item.name}</h4>
                                            <p className="text-xs text-slate-400 font-medium">Droga: <span className="text-slate-300">{item.activeIngredient}</span> • {item.presentation}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lab: {item.laboratory}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`px-4 py-2 rounded-2xl text-xs font-bold font-mono inline-block border ${
                                                item.totalStock > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/5' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                            }`}>
                                                {item.totalStock > 0 ? `${item.totalStock} unidades disponibles` : 'Sin Stock'}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DoctorDashboard;