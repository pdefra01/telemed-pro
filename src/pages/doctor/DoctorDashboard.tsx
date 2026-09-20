import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Doctor, Appointment, MedicalRecord, Prescription, MedicalDocument, DoctorWorkShift } from '../../types';
import { Video, Calendar, Clock, Star, AlertCircle, FileText, CheckCircle, TrendingUp, Users, Activity, AlertTriangle, X, Search, ChevronRight, Zap, ArrowRight, LogIn, LogOut as LogOutIcon, MapPin } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { medicalDocumentRepository } from '../../repositories/MedicalDocumentRepository';
import { prescriptionRepository } from '../../repositories/PrescriptionRepository';
import { dashboardRepository } from '../../repositories/DashboardRepository';
import { notificationRepository, Notification } from '../../repositories/NotificationRepository';
import { doctorShiftRepository } from '../../repositories/DoctorShiftRepository';
import { pharmacyRepository } from '../../repositories/PharmacyRepository';
import { FileText as FileIcon, File as FileGeneric, Image as ImageIcon, FlaskConical, ExternalLink, History, FolderOpen, Pill } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { playArrivalSound } from '../../utils/audio';

interface Props {
    user: Doctor;
}

const DoctorDashboard: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
    const [doctorStatus, setDoctorStatus] = useState<'online' | 'away'>('online');
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [selectedPatientName, setSelectedPatientName] = useState<string>('');

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
    const [cancellingId, setCancellingId] = useState<string | null>(null);

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
        const cleanDni = searchDni.replace(/\D/g, '');
        if (!cleanDni) return;
        setIsSearchingDni(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, dni')
                .eq('dni', cleanDni)
                .limit(1);

            if (error) throw error;

            if (!data || data.length === 0) {
                setToast({ message: `No se encontró ningún paciente con DNI ${cleanDni}`, type: 'error' });
            } else {
                setSelectedPatientId(data[0].id);
                setSelectedPatientName(data[0].full_name || '');
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

    const kpiTimeframe = 'daily' as const;
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

    const fetchAppointments = useCallback(async () => {
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
    }, [user.id, kpiTimeframe]);

    const handleCancelAppointment = async (appointmentId: string) => {
        if (!window.confirm('¿Estás seguro de que querés dar de baja este turno?')) return;
        setCancellingId(appointmentId);
        try {
            await appointmentRepository.cancelAppointment(appointmentId);
            setQueueAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
            setToast({ message: 'Turno dado de baja con éxito', type: 'success' });
            setTimeout(() => setToast(null), 4000);
            await fetchAppointments();
        } catch (error: any) {
            console.error("Error cancelando turno:", error);
            setToast({ message: error.message || 'Error al cancelar el turno', type: 'error' });
            setTimeout(() => setToast(null), 5000);
        } finally {
            setCancellingId(null);
        }
    };

    useEffect(() => {
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
            }, (payload) => {
                console.log('[DoctorDashboard] Realtime change detected in appointments:', payload);
                fetchAppointments();
            })
            .subscribe((status, err) => {
                console.log(`[DoctorDashboard] Realtime channel status: ${status}`, err || '');
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
                                        setSelectedPatientName(appt.patientName || '');
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

            {/* Top bar: metrics + shift control */}
            <div className="flex flex-col xl:flex-row xl:items-stretch gap-4 relative z-10">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 flex-1 min-w-0">
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

                {/* Tiempo Promedio de Sesión Card (fijo en vista diaria) */}
                <div className="bg-slate-900/40 backdrop-blur-2xl p-4 rounded-[1.25rem] border border-white/5 relative group hover:border-blue-500/20 transition-all duration-700 overflow-hidden md:col-span-2 lg:col-span-1">
                    <div className="absolute -right-3 -top-3 w-16 h-16 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"></div>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Promedio hoy</p>
                        <Activity className="text-blue-500/60" size={14} />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-bold text-white tracking-tighter">
                            {dynamicKPIs.effectiveConsultations > 0
                                ? <>{dynamicKPIs.avgSessionMinutes} <span className="text-base font-normal text-slate-400">min</span></>
                                : '—'}
                        </h3>
                    </div>
                </div>

                {/* Reputación Card */}
                {metrics && (
                    <div className="bg-slate-900/40 backdrop-blur-2xl p-4 rounded-[1.25rem] border border-white/5 relative group hover:border-yellow-500/20 transition-all duration-700 overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-yellow-500/5 rounded-full blur-2xl group-hover:bg-yellow-500/10 transition-colors"></div>
                        <div className="flex justify-between items-start mb-3">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Reputación</p>
                            <Star className="text-yellow-500/40 group-hover:rotate-12 transition-transform" size={14} />
                        </div>
                        <div className="flex items-baseline gap-3">
                            <h3 className="text-2xl font-bold text-white tracking-tighter group-hover:scale-105 transition-transform origin-left duration-700">{metrics.starRating}</h3>
                            <div className="flex text-yellow-500/30 gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <Star key={s} fill={s <= Math.round(metrics.starRating) ? "#eab308" : "none"} size={12} className={s <= Math.round(metrics.starRating) ? "drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" : ""} />
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                             <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                                <div className="bg-yellow-500 h-full w-[95%] rounded-full shadow-[0_0_8px_rgba(234,179,8,0.5)]"></div>
                             </div>
                        </div>
                    </div>
                )}
            </section>
                {/* Control de Jornada Laboral Card */}
                <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-4 rounded-[1.25rem] shadow-2xl flex flex-col sm:flex-row items-center gap-4 xl:shrink-0">
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

                    <div className="h-16 w-px bg-white/5 hidden sm:block"></div>

                    <div className="flex flex-col items-stretch gap-2">
                        <button
                            onClick={() => setDoctorStatus(prev => prev === 'online' ? 'away' : 'online')}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 border active:scale-95 ${
                                doctorStatus === 'online'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
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
            </div>

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
                                                onClick={() => { setSelectedPatientId(apt.patientId); setSelectedPatientName(apt.patientName || ''); }}
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

                                            <button 
                                                type="button"
                                                disabled={cancellingId === apt.id}
                                                onClick={() => handleCancelAppointment(apt.id)}
                                                className="h-12 sm:h-14 px-4 sm:px-6 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-50 active:scale-95 group/cancel cursor-pointer"
                                                title="Dar de baja / Cancelar turno"
                                            >
                                                {cancellingId === apt.id ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-red-400/20 border-t-red-400 rounded-full animate-spin"></div>
                                                ) : (
                                                    <X size={14} className="group-hover/cancel:scale-110 transition-transform" />
                                                )}
                                                <span>{cancellingId === apt.id ? 'Cancelando...' : 'Cancelar'}</span>
                                            </button>
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={() => setSelectedPatientId(null)}></div>
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-5xl h-[94vh] overflow-hidden flex flex-col shadow-3xl relative animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="px-4 sm:px-6 py-3 border-b border-white/5 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-baseline gap-x-3 min-w-0" title={selectedPatientId}>
                                <h3 className="font-bold text-xl text-white tracking-tight">Historia clínica</h3>
                                {selectedPatientName && (
                                    <span className="font-bold text-xl text-emerald-400 tracking-tight truncate">{selectedPatientName}</span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex p-1 bg-slate-950/60 rounded-xl border border-white/5 gap-1">
                                    <button
                                        onClick={() => setHistoryView('records')}
                                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${historyView === 'records' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        <History size={14} /> Evoluciones
                                        {patientRecords.length > 0 && <span className="opacity-70">({patientRecords.length})</span>}
                                    </button>
                                    <button
                                        onClick={() => setHistoryView('documents')}
                                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${historyView === 'documents' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        <FolderOpen size={14} /> Estudios
                                        {patientDocuments.length > 0 && <span className="opacity-70">({patientDocuments.length})</span>}
                                    </button>
                                </div>

                                <button
                                    onClick={() => setSelectedPatientId(null)}
                                    aria-label="Cerrar historia clínica"
                                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-red-500/20 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-y-auto p-4 sm:p-6 custom-scrollbar flex-1">
                            {isFetchingPatientHistory ? (
                                <div className="flex flex-col items-center justify-center py-24">
                                    <div className="w-10 h-10 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                                    <p className="text-xs font-bold text-emerald-500 animate-pulse">Cargando historia clínica...</p>
                                </div>
                            ) : historyView === 'records' ? (
                                patientRecords.length > 0 ? (
                                    <div className="space-y-3">
                                        {patientRecords.map((record) => (
                                            <article key={record.id} className="bg-white/[0.03] rounded-xl p-4 sm:p-5 border border-white/5">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                                                    <span className="text-xs font-bold text-slate-300">{record.date}</span>
                                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">{record.type}</span>
                                                    <span className="text-xs text-slate-500 sm:ml-auto">Dr. {record.doctorName?.split(' ').pop()}</span>
                                                </div>
                                                <h4 className="font-bold text-white text-lg leading-snug">{record.diagnosis}</h4>
                                                {record.notes && (
                                                    <p className="mt-2 text-slate-300 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{record.notes}</p>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-20">
                                        <Search size={28} className="text-slate-700 mx-auto mb-3" />
                                        <p className="text-slate-500 text-sm">Este paciente todavía no tiene evoluciones registradas.</p>
                                    </div>
                                )
                            ) : (
                                patientDocuments.length > 0 ? (
                                    <div className="space-y-2">
                                        {patientDocuments.map((doc) => (
                                            <div key={doc.id} className="flex items-center gap-4 bg-white/[0.03] rounded-xl px-4 py-3 border border-white/5">
                                                <div className="p-2.5 rounded-lg bg-slate-950 border border-white/5 text-emerald-500 shrink-0">
                                                    {doc.type === 'lab_result' ? <FlaskConical size={18} /> :
                                                     doc.type === 'imaging' ? <ImageIcon size={18} /> :
                                                     <FileGeneric size={18} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-sm font-bold text-white truncate">{doc.title}</h4>
                                                    <p className="text-xs text-slate-500">
                                                        {doc.type === 'lab_result' ? 'Laboratorio' : doc.type === 'imaging' ? 'Imagen' : 'Documentación'} · {doc.date}
                                                    </p>
                                                </div>
                                                <a
                                                    href={doc.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-4 py-2 bg-white/5 hover:bg-emerald-500 text-white hover:text-slate-950 rounded-lg font-bold text-xs transition-all flex items-center gap-2 shrink-0"
                                                >
                                                    <ExternalLink size={14} /> Abrir
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-20">
                                        <FolderOpen size={28} className="text-slate-700 mx-auto mb-3" />
                                        <p className="text-slate-500 text-sm">No hay estudios cargados para este paciente.</p>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Consultation Details Modal */}
            {selectedAppointment && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={() => setSelectedAppointment(null)}></div>
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl h-[94vh] overflow-hidden flex flex-col shadow-3xl relative animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="px-4 sm:px-6 py-3 border-b border-white/5 bg-slate-950/40 flex items-center justify-between gap-3">
                            <div className="flex flex-wrap items-baseline gap-x-3 min-w-0" title={`Protocolo ${selectedAppointment.id}`}>
                                <h3 className="font-bold text-xl text-white tracking-tight">Resumen clínico</h3>
                                <span className="font-bold text-xl text-emerald-400 tracking-tight truncate">{selectedAppointment.patientName}</span>
                                <span className="text-xs text-slate-500">{selectedAppointment.date}</span>
                            </div>
                            <button
                                onClick={() => setSelectedAppointment(null)}
                                aria-label="Cerrar resumen clínico"
                                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-red-500/20 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar flex-1">
                            {isFetchingDetails ? (
                                <div className="flex flex-col items-center justify-center py-24">
                                    <div className="w-10 h-10 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                                    <p className="text-xs font-bold text-emerald-500 animate-pulse">Cargando datos de la consulta...</p>
                                </div>
                            ) : (
                                <>
                                    <section className="space-y-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conclusiones médicas</h4>
                                        {selectedRecord ? (
                                            <div className="bg-white/[0.03] rounded-xl p-4 sm:p-5 border border-white/5">
                                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Diagnóstico principal</p>
                                                <p className="text-xl font-bold text-white leading-snug">{selectedRecord.diagnosis}</p>
                                                {selectedRecord.notes && (
                                                    <>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-5 mb-1">Notas</p>
                                                        <p className="text-slate-300 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{selectedRecord.notes}</p>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-10 bg-amber-500/5 rounded-xl border border-amber-500/10">
                                                <AlertCircle size={24} className="mx-auto text-amber-500/60 mb-2" />
                                                <p className="text-sm text-amber-500">Sin diagnóstico registrado para esta consulta.</p>
                                            </div>
                                        )}
                                    </section>

                                    <section className="space-y-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prescripción</h4>
                                        {selectedPrescription ? (
                                            <div className="bg-white/[0.03] rounded-xl p-4 sm:p-5 border border-white/5">
                                                <div className="space-y-2">
                                                    {selectedPrescription.medications.map((med, idx) => (
                                                        <div key={idx} className="flex items-center justify-between gap-4 p-3 bg-slate-950/50 rounded-lg border border-white/5">
                                                            <div className="min-w-0">
                                                                <h5 className="font-bold text-white text-base">{med.name}</h5>
                                                                <p className="text-sm text-slate-400 break-words">{med.instructions}</p>
                                                            </div>
                                                            <span className="shrink-0 px-3 py-1.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-lg font-bold text-xs">
                                                                Cant. {med.quantity}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {selectedPrescription.notes && (
                                                    <>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-5 mb-1">Instrucciones</p>
                                                        <p className="text-slate-300 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{selectedPrescription.notes}</p>
                                                    </>
                                                )}

                                                <div className="mt-5 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                                                    <span className="flex items-center gap-2"><Calendar size={14} /> Vence: {selectedPrescription.expirationDate}</span>
                                                    <span className="font-mono truncate max-w-[220px]" title={selectedPrescription.digitalSignature}>Firma: {selectedPrescription.digitalSignature}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-10 bg-white/[0.02] rounded-xl border border-white/5 border-dashed">
                                                <FileText size={24} className="mx-auto text-slate-700 mb-2" />
                                                <p className="text-sm text-slate-500">Sin prescripciones en esta consulta.</p>
                                            </div>
                                        )}
                                    </section>
                                </>
                            )}
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