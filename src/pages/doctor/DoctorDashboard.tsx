import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Doctor, Appointment, MedicalRecord, Prescription, MedicalDocument } from '../../types';
import { Video, Calendar, Clock, Star, AlertCircle, FileText, CheckCircle, TrendingUp, Users, Activity, AlertTriangle, X, Search, Clipboard, Shield, ChevronRight, Zap, ArrowRight, MousePointer2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { medicalDocumentRepository } from '../../repositories/MedicalDocumentRepository';
import { prescriptionRepository } from '../../repositories/PrescriptionRepository';
import { dashboardRepository } from '../../repositories/DashboardRepository';
import { notificationRepository, Notification } from '../../repositories/NotificationRepository';
import { FileText as FileIcon, File as FileGeneric, Image as ImageIcon, FlaskConical, Download, ExternalLink, History, FolderOpen } from 'lucide-react';

interface Props {
    user: Doctor;
}

const DoctorDashboard: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
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
                // Usar el nuevo Command Center View para la cola activa
                const [queueData, allAppts] = await Promise.all([
                    dashboardRepository.getDoctorQueue(user.id),
                    appointmentRepository.getDoctorAppointments(user.id)
                ]);

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

                setQueueAppointments(mappedQueue);
                setHistoryAppointments(allAppts.filter(a => a.status === 'completed'));
            } catch (error) {
                console.error("Error cargando turnos:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAppointments();

        // Suscripción a notificaciones en tiempo real
        const subscription = notificationRepository.subscribeToNotifications(user.id, (notif) => {
            console.log("Nueva notificación recibida:", notif);
            // Podríamos disparar un toast o refrescar la cola si el tipo es relevante
            if (notif.message.toLowerCase().includes('llegó') || notif.message.toLowerCase().includes('turno')) {
                fetchAppointments();
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [user.id]);

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
                        <p className="text-sm font-black uppercase tracking-widest">{toast.message}</p>
                        <button onClick={() => setToast(null)} className="ml-4 hover:scale-110 transition-transform">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
                <div className="space-y-2">
                    <div className="flex items-center space-x-3 group">
                        <div className="h-0.5 w-12 bg-emerald-500/50 group-hover:w-16 transition-all duration-700"></div>
                        <span className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">System Active • Dr. {user.specialty}</span>
                    </div>
                    <h1 className="text-6xl font-black text-white tracking-tighter leading-none">
                        Dashboard <span className="text-emerald-500">Médico</span>
                    </h1>
                    <p className="text-slate-500 font-medium tracking-wide flex items-center gap-2">
                        <Clock size={14} className="text-emerald-500" /> 
                        Estado actual: <span className="text-slate-300 font-black">EN LÍNEA</span> 
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    </p>
                </div>

                <div className="flex items-center gap-4 bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-2 rounded-3xl shadow-2xl">
                   <div className="flex -space-x-3 px-4">
                        {[1,2,3].map(i => (
                            <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center overflow-hidden">
                                <img src={`https://i.pravatar.cc/150?u=doc${i}`} alt="doc" className="opacity-80 group-hover:opacity-100 transition-opacity" />
                            </div>
                        ))}
                   </div>
                   <div className="h-10 w-px bg-white/5 mx-2"></div>
                   <div className="pr-6 pl-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Carga de Red</p>
                        <div className="flex items-center gap-3">
                            <div className="w-24 bg-white/5 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full w-[65%] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            </div>
                            <span className="text-xs font-black text-emerald-500">ROBUSTA</span>
                        </div>
                   </div>
                </div>
            </header>

            {/* Metrics HUD */}
            {metrics && (
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
                    {/* Reputación Card */}
                    <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 relative group hover:border-emerald-500/20 transition-all duration-700 overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-yellow-500/5 rounded-full blur-2xl group-hover:bg-yellow-500/10 transition-colors"></div>
                        <div className="flex justify-between items-start mb-6">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Reputación</p>
                            <Star className="text-yellow-500/40 group-hover:rotate-12 transition-transform" size={20} />
                        </div>
                        <div className="flex items-baseline gap-3">
                            <h3 className="text-5xl font-black text-white tracking-tighter group-hover:scale-105 transition-transform origin-left duration-700">{metrics.starRating}</h3>
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

                    {/* Eficiencia Card */}
                    <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 relative group hover:border-blue-500/20 transition-all duration-700 overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"></div>
                        <div className="flex justify-between items-start mb-6">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Score de Eficiencia</p>
                            <TrendingUp className="text-blue-500/40" size={20} />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-5xl font-black text-white tracking-tighter">{metrics.rankingScore}</h3>
                            <span className="text-xs font-black text-blue-500 tracking-tighter">ELITE</span>
                        </div>
                        <div className="mt-8 flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Global Rank</span>
                            <span className="text-[10px] font-black text-blue-400">#42</span>
                        </div>
                    </div>

                    {/* Show Rate Card */}
                    <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 relative group hover:border-emerald-500/20 transition-all duration-700 overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
                        <div className="flex justify-between items-start mb-6">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Asistencia</p>
                            <Users className="text-emerald-500/40" size={20} />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-5xl font-black text-white tracking-tighter">{metrics.showRate}%</h3>
                        </div>
                        <div className="mt-8">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Paciente vs Turno</span>
                                <span className="text-[10px] font-black text-emerald-400">Óptimo</span>
                            </div>
                            <div className="flex gap-1">
                                {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= 9 ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.4)]' : 'bg-white/5'}`}></div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tiempo Promedio Card */}
                    <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 relative group hover:border-slate-500/20 transition-all duration-700 overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                        <div className="flex justify-between items-start mb-6">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Promedio Sesión</p>
                            <Clock className="text-slate-500/40" size={20} />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-5xl font-black text-white tracking-tighter">{metrics.avgConsultationTime}</h3>
                        </div>
                        <p className="mt-8 text-[9px] text-slate-600 font-black uppercase tracking-tighter italic">"Calidad sobre velocidad"</p>
                    </div>
                </section>
            )}

            {/* Main Operational Area */}
            <section className="grid grid-cols-1 xl:grid-cols-12 gap-8 relative z-10">
                {/* Navigation & List (Left Column) */}
                <div className="xl:col-span-8 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900/20 p-4 rounded-[2rem] border border-white/5 backdrop-blur-xl">
                        <div className="flex p-1.5 bg-slate-950/50 rounded-2xl w-fit border border-white/5">
                            <button
                                onClick={() => setActiveTab('queue')}
                                className={`px-8 py-3.5 font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-500 rounded-xl flex items-center gap-3 ${activeTab === 'queue' ? 'bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Users size={14} /> Sala de Espera
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-8 py-3.5 font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-500 rounded-xl flex items-center gap-3 ${activeTab === 'history' ? 'bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Search size={14} /> Historial Total
                            </button>
                        </div>
                        
                        <div className="relative group">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-500 transition-colors" size={16} />
                            <input 
                                type="text" 
                                placeholder="BUSCAR PACIENTE POR DNI..." 
                                className="bg-slate-950/50 border border-white/5 pl-14 pr-6 py-4 rounded-2xl text-[10px] font-black tracking-widest text-white placeholder:text-slate-700 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all w-full md:w-80"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {activeTab === 'queue' ? (
                            isLoading ? (
                                <div className="flex flex-col items-center justify-center py-32 bg-slate-900/10 rounded-[3rem] border border-white/5 border-dashed">
                                    <div className="w-16 h-16 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/70 animate-pulse">Inyectando datos en tiempo real...</span>
                                </div>
                            ) : queueAppointments.length > 0 ? (
                                queueAppointments.map((apt, idx) => (
                                    <div key={apt.id} className="group relative bg-slate-900/20 hover:bg-slate-900/40 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 hover:border-emerald-500/30 transition-all duration-500 flex flex-col md:flex-row md:items-center justify-between gap-8 overflow-hidden">
                                        {/* Row Decoration */}
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                                        <div className="absolute right-0 top-0 p-8 text-white/[0.01] pointer-events-none font-black text-8xl italic">0{idx+1}</div>

                                        <div className="flex items-center gap-6 relative z-10">
                                            <div className="relative">
                                                <div className="w-20 h-20 bg-slate-950 border border-white/10 rounded-3xl flex items-center justify-center text-white font-black text-3xl shadow-2xl group-hover:scale-105 transition-transform duration-700 overflow-hidden">
                                                    {apt.patientAvatar ? (
                                                        <img src={apt.patientAvatar} alt={apt.patientName} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                                    ) : (
                                                        <span className="text-white font-black">{apt.patientName.charAt(0)}</span>
                                                    )}
                                                </div>
                                                <div className={`absolute -bottom-1 -right-1 w-6 h-6 border-4 border-slate-950 rounded-full ${apt.status === 'confirmed' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-amber-500'}`}></div>
                                            </div>
                                            
                                            <div className="space-y-1">
                                                <h4 className="text-2xl font-black text-white tracking-tighter group-hover:text-emerald-400 transition-colors">{apt.patientName}</h4>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-white/5">
                                                        <Clock size={12} className="text-emerald-500" />
                                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{apt.time}</span>
                                                    </div>
                                                    <span className="text-[9px] font-black px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 uppercase tracking-widest">
                                                        {apt.patientPlan || 'Plan Global'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 relative z-10">
                                            <button 
                                                onClick={() => setSelectedPatientId(apt.patientId)}
                                                className="h-14 px-8 bg-slate-950 hover:bg-slate-900 border border-white/5 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white transition-all group/btn"
                                            >
                                                <FileText size={16} className="group-hover/btn:text-emerald-500 transition-colors" /> Expediente
                                            </button>
                                            
                                            {apt.status === 'confirmed' ? (
                                                <Link
                                                    to={`/room/${apt.id}`}
                                                    className="h-14 px-10 bg-white hover:bg-emerald-500 text-slate-950 hover:text-white rounded-2xl flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl shadow-white/5 hover:shadow-emerald-500/40 active:scale-95"
                                                >
                                                    <Video size={18} /> Iniciar Llamada
                                                    <Zap size={14} className="animate-bounce" />
                                                </Link>
                                            ) : (
                                                <div className="h-14 px-10 bg-amber-500/5 border border-amber-500/20 text-amber-500 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                                                    <Activity size={16} className="animate-pulse" /> En Espera
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
                                    <h5 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.4em]">Sin tráfico de pacientes activo</h5>
                                </div>
                            )
                        ) : (
                            historyAppointments.length > 0 ? (
                                historyAppointments.map(apt => (
                                    <div key={apt.id} className="group bg-slate-900/20 hover:bg-white/[0.02] rounded-[2.5rem] p-8 border border-white/5 transition-all duration-500 flex flex-col md:flex-row md:items-center justify-between gap-8">
                                        <div className="flex items-center gap-6">
                                            <div className="w-16 h-16 bg-slate-950 border border-white/5 rounded-2xl flex items-center justify-center font-black text-slate-500 text-xl group-hover:text-white transition-colors">
                                                {apt.patientName.charAt(0)}
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-black text-white tracking-tight">{apt.patientName}</h4>
                                                <div className="flex items-center gap-6 mt-2">
                                                    <span className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                        <Calendar size={12} className="text-blue-500" /> {apt.date}
                                                    </span>
                                                    <span className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                        <Clock size={12} className="text-blue-500" /> {apt.time}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="hidden sm:flex items-center gap-2 bg-emerald-500/5 px-4 py-2 rounded-xl border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                                                <CheckCircle size={14} /> Atendido
                                            </div>
                                            <button 
                                                onClick={() => setSelectedAppointment(apt)}
                                                className="h-12 px-8 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
                                            >
                                                Ver Resumen
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-40 bg-slate-900/10 rounded-[3rem]">
                                    <Search size={48} className="mx-auto text-slate-800 mb-6" />
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">No se encontraron registros previos</p>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Performance Analytics & News (Right Column) */}
                <div className="xl:col-span-4 space-y-8">
                    {/* Real-time Insights */}
                    <div className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-[3rem] p-10 text-white relative overflow-hidden shadow-3xl group">
                        <div className="absolute right-[-20%] top-[-10%] w-[80%] h-[80%] bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000"></div>
                        <div className="relative z-10 space-y-8">
                            <div className="flex justify-between items-start">
                                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                                    <Zap size={24} className="text-white shadow-2xl" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] bg-white/20 px-4 py-1.5 rounded-full">Pro Insight</span>
                            </div>
                            
                            <div className="space-y-2">
                                <h4 className="text-4xl font-black tracking-tighter leading-none">Rendimiento Semanal</h4>
                                <p className="text-emerald-100 text-sm font-medium opacity-80 leading-relaxed italic">"Has optimizado tu tiempo de respuesta un 15% este mes. ¡Excelente trabajo!"</p>
                            </div>

                            <button className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-3 hover:bg-white hover:text-slate-950 transition-all duration-500 group/btn">
                                Ver Reporte Detallado <ArrowRight size={14} className="group-hover/btn:translate-x-2 transition-transform" />
                            </button>
                        </div>
                    </div>

                    {/* Quick Shortcuts */}
                    <div className="bg-slate-900/40 backdrop-blur-2xl rounded-[3rem] p-10 border border-white/5 space-y-8">
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Accesos de Emergencia</h5>
                        <div className="grid grid-cols-1 gap-4">
                            <button className="flex items-center justify-between p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:border-emerald-500/40 hover:bg-white/[0.07] transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Activity size={20} />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black text-white tracking-tight uppercase">Soporte Técnico 24/7</p>
                                        <p className="text-[9px] text-slate-600 font-bold uppercase mt-0.5">Canal de alta prioridad</p>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-slate-700 group-hover:text-emerald-500 transition-colors" />
                            </button>

                            <button className="flex items-center justify-between p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:border-blue-500/40 hover:bg-white/[0.07] transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <AlertCircle size={20} />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black text-white tracking-tight uppercase">Protocolos IA</p>
                                        <p className="text-[9px] text-slate-600 font-bold uppercase mt-0.5">Asistente de diagnóstico</p>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-slate-700 group-hover:text-blue-500 transition-colors" />
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Modals with Premium Refactor */}
            {selectedPatientId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" onClick={() => setSelectedPatientId(null)}></div>
                    <div className="bg-slate-900 border border-white/10 rounded-[3.5rem] w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-3xl relative animate-in fade-in slide-in-from-bottom-10 duration-700">
                        <div className="p-12 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-950/30 gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em]">Secure Access Point</span>
                                </div>
                                <h3 className="font-black text-4xl text-white tracking-tighter">Bóveda Médica</h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">ID_PACIENTE: {selectedPatientId.toUpperCase()}</p>
                            </div>

                            <div className="flex p-1 bg-slate-950/50 rounded-2xl border border-white/5">
                                <button
                                    onClick={() => setHistoryView('records')}
                                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${historyView === 'records' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <History size={14} /> Evoluciones
                                </button>
                                <button
                                    onClick={() => setHistoryView('documents')}
                                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${historyView === 'documents' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <FolderOpen size={14} /> Estudios y Archivos
                                </button>
                            </div>

                            <button onClick={() => setSelectedPatientId(null)} className="w-14 h-14 flex items-center justify-center rounded-2xl bg-white/5 text-slate-400 hover:text-white hover:bg-red-500/20 hover:text-red-500 transition-all duration-500">
                                <X size={28} />
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto p-12 space-y-10 custom-scrollbar flex-1">
                            {isFetchingPatientHistory ? (
                                <div className="flex flex-col items-center justify-center py-24">
                                    <div className="w-16 h-16 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-8"></div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-emerald-500 animate-pulse">Desencriptando registros históricos...</p>
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
                                                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20">{record.type}</span>
                                                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{record.date}</span>
                                                            </div>
                                                            <h4 className="font-black text-white text-3xl tracking-tighter leading-none group-hover:text-emerald-400 transition-colors">{record.diagnosis}</h4>
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-950/50 p-8 rounded-[2rem] border border-white/5 italic">
                                                        <p className="text-slate-400 text-base leading-relaxed font-medium">"{record.notes}"</p>
                                                    </div>
                                                    <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-500 font-black border border-white/10 shadow-inner">
                                                                {record.doctorName?.charAt(0) || 'D'}
                                                            </div>
                                                            <div>
                                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Emitido por</p>
                                                                    <p className="text-sm font-black text-white tracking-tight">Dr. {record.doctorName?.split(' ').pop()}</p>
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
                                        <p className="text-slate-600 font-black uppercase tracking-[0.4em] text-[11px]">Memoria de registros vacía</p>
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
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">{doc.date}</span>
                                                </div>
                                                <h4 className="text-xl font-black text-white tracking-tight mb-2 group-hover:text-emerald-400 transition-colors">{doc.title}</h4>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8">{doc.type === 'lab_result' ? 'Análisis de Laboratorio' : doc.type === 'imaging' ? 'Estudio de Imagen' : 'Documentación Médica'}</p>
                                                
                                                <div className="flex gap-3">
                                                    <a 
                                                        href={doc.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex-1 py-4 bg-white/5 hover:bg-emerald-500 text-white hover:text-slate-950 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
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
                                        <p className="text-slate-600 font-black uppercase tracking-[0.4em] text-[11px]">No hay documentos cargados</p>
                                    </div>
                                )
                            )}
                        </div>

                        <div className="p-10 border-t border-white/5 bg-slate-950/50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Shield size={16} className="text-emerald-500" />
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">End-to-End Encryption Enabled</span>
                            </div>
                            <button
                                onClick={() => setSelectedPatientId(null)}
                                className="px-14 py-5 bg-white hover:bg-emerald-500 text-slate-950 hover:text-white rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[10px] transition-all shadow-3xl active:scale-95"
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
                                        <span className="px-3 py-1 bg-slate-950 text-white text-[9px] font-black uppercase tracking-[0.3em] rounded-full">Protocolo {selectedAppointment.id.slice(0, 8)}</span>
                                    </div>
                                    <h3 className="font-black text-5xl tracking-tighter uppercase leading-none">Resumen <span className="text-emerald-600 italic">Clínico</span></h3>
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] pt-2">Paciente: {selectedAppointment.patientName} • {selectedAppointment.date}</p>
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
                                    <p className="text-[11px] font-black uppercase tracking-[0.5em] text-emerald-500 animate-pulse">Sincronizando con nodo de datos...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Medical Record Section */}
                                    <section className="space-y-10">
                                        <div className="flex items-center text-white font-black uppercase tracking-[0.4em] text-[11px]">
                                            <span className="w-12 h-px bg-emerald-500/50 mr-4"></span>
                                            Conclusiones Médicas
                                        </div>
                                        {selectedRecord ? (
                                            <div className="bg-white/5 p-12 rounded-[3.5rem] border border-white/5 relative group shadow-inner">
                                                <div className="absolute right-10 top-10 text-white/[0.01] pointer-events-none transition-transform duration-1000 group-hover:scale-110">
                                                    <Activity size={240} />
                                                </div>
                                                <div className="mb-10 relative z-10">
                                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-4">Diagnóstico Principal</p>
                                                    <p className="text-4xl font-black text-white tracking-tighter leading-tight drop-shadow-2xl">{selectedRecord.diagnosis}</p>
                                                </div>
                                                <div className="relative z-10 space-y-4">
                                                    <div className="h-px w-full bg-white/5 mb-8"></div>
                                                    <div className="flex items-center gap-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">
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
                                                <p className="text-[11px] font-black text-amber-500 uppercase tracking-[0.4em]">Sin diagnóstico registrado en este nodo</p>
                                            </div>
                                        )}
                                    </section>

                                    {/* Prescription Section */}
                                    <section className="space-y-10 pb-10">
                                        <div className="flex items-center text-white font-black uppercase tracking-[0.4em] text-[11px]">
                                            <span className="w-12 h-px bg-blue-500/50 mr-4"></span>
                                            Prescripción Farmacológica
                                        </div>
                                        {selectedPrescription ? (
                                            <div className="bg-slate-950/40 p-12 rounded-[3.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
                                                <div className="absolute inset-0 bg-blue-500/[0.01] group-hover:bg-blue-500/[0.03] transition-colors duration-1000"></div>
                                                
                                                <div className="flex justify-between items-center mb-12 relative z-10">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                                                        <span className="text-[10px] text-blue-400 font-black uppercase tracking-[0.3em]">Validado via Blockchain</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-700 font-mono font-bold tracking-widest">{selectedPrescription.id.toUpperCase()}</span>
                                                </div>

                                                <div className="space-y-6 relative z-10">
                                                    {selectedPrescription.medications.map((med, idx) => (
                                                        <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-8 bg-white/[0.03] hover:bg-white/[0.07] rounded-[2.5rem] border border-white/5 transition-all duration-500">
                                                            <div className="space-y-2 mb-4 md:mb-0">
                                                                <h5 className="font-black text-white text-2xl tracking-tighter">{med.name}</h5>
                                                                <div className="flex items-center gap-3">
                                                                    <Zap size={12} className="text-blue-500" />
                                                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{med.instructions}</p>
                                                                </div>
                                                            </div>
                                                            <div className="px-6 py-3 bg-blue-500 text-slate-950 rounded-2xl font-black text-xs tracking-tighter shadow-xl shadow-blue-500/20">
                                                                CANT: {med.quantity}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {selectedPrescription.notes && (
                                                    <div className="mt-12 pt-10 border-t border-white/5 relative z-10">
                                                        <div className="flex items-center gap-3 mb-6">
                                                            <MousePointer2 size={14} className="text-slate-600" />
                                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Instrucciones Clínicas</p>
                                                        </div>
                                                        <p className="text-slate-400 text-base italic font-medium leading-relaxed bg-white/[0.02] p-8 rounded-[2rem] border border-white/5">"{selectedPrescription.notes}"</p>
                                                    </div>
                                                )}

                                                <div className="mt-12 flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
                                                    <div className="flex items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] bg-white/5 px-6 py-3 rounded-2xl border border-white/5">
                                                        <Calendar size={14} className="text-slate-700" /> Caduca: {selectedPrescription.expirationDate}
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <div className="text-[9px] text-slate-800 font-mono mb-2 max-w-[200px] truncate">{selectedPrescription.digitalSignature}</div>
                                                        <div className="flex items-center gap-3 text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">
                                                            <Shield size={14} className="drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" /> Signature Verified
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-20 bg-white/5 rounded-[3rem] border border-white/5 border-dashed">
                                                <FileText size={40} className="mx-auto text-slate-800 mb-6" />
                                                <p className="text-[11px] font-black text-slate-600 uppercase tracking-[0.4em]">Sin prescripciones en este registro</p>
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
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] leading-none mb-1">Status de Seguridad</p>
                                    <p className="text-xs font-black text-white tracking-tight uppercase">Hash de Sesión Consolidado</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedAppointment(null)}
                                className="w-full md:w-auto px-16 py-6 bg-emerald-500 text-slate-950 hover:bg-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-[11px] transition-all duration-500 shadow-[0_0_40px_rgba(16,185,129,0.3)] active:scale-95"
                            >
                                Archivar Protocolo
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DoctorDashboard;