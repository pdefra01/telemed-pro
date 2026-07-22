import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Patient, Appointment, Doctor, Prescription } from '../../types';
import { MOCK_RECORDS } from '../../constants';
import { Calendar, Video, FileText, Plus, Clock, ChevronRight, Upload, Phone, User as UserIcon, X, Check, Search, Download, Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { doctorRepository } from '../../repositories/DoctorRepository';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { prescriptionRepository } from '../../repositories/PrescriptionRepository';
import { medicalDocumentRepository } from '../../repositories/MedicalDocumentRepository';
import { affiliateRepository } from '../../repositories/AffiliateRepository';
import { familyMemberRepository } from '../../repositories/FamilyMemberRepository';
import { NotificationBell } from '../../components/dashboard/NotificationBell';
import { NotificationListener } from '../../components/dashboard/NotificationListener';
import { notificationRepository } from '../../repositories/NotificationRepository';

interface Props {
    user: Patient;
}

interface QuotaStatus {
    quotaUsed: number;
    totalBonified: number | null;
    remaining: number | null;
    isUnlimited: boolean;
    hasPlan: boolean;
    isOverQuota: boolean;
    planName: string;
}

/**
 * Resuelve el estilo y la etiqueta del badge de cupo de consultas a partir del
 * estado devuelto por `getConsultationQuotaStatus`. Sin plan asignado y planes
 * ilimitados tienen su propia presentación explícita (nunca un número inventado).
 */
export function getQuotaBadgeContent(quotaStatus: QuotaStatus): { className: string; label: string } {
    if (!quotaStatus.hasPlan) {
        return {
            className: 'bg-slate-500/10 border-slate-500/30 text-slate-300',
            label: 'Sin plan asignado',
        };
    }

    if (quotaStatus.isUnlimited) {
        return {
            className: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
            label: `Consultas Bonificadas: ${quotaStatus.quotaUsed}/∞`,
        };
    }

    if (quotaStatus.isOverQuota) {
        return {
            className: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
            label: `⚠️ Cupo Mensual Cubierto (${quotaStatus.quotaUsed}/${quotaStatus.totalBonified})`,
        };
    }

    return {
        className: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
        label: `Consultas Bonificadas: ${quotaStatus.quotaUsed}/${quotaStatus.totalBonified}`,
    };
}

const PatientDashboard: React.FC<Props> = ({ user }) => {
    const { toast } = useToast();
    const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
    const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const triggerRefresh = () => setRefreshKey(prev => prev + 1);
    
    // New state for patient history
    const [recentRecords, setRecentRecords] = useState<any[]>([]);
    const [isLoadingRecords, setIsLoadingRecords] = useState(true);

    const [recentPrescriptions, setRecentPrescriptions] = useState<Prescription[]>([]);
    const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(true);
    const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
    const [familyMembers, setFamilyMembers] = useState<any[]>([]);
    const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string>('');

    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                const appts = await appointmentRepository.getPatientAppointments(user.id);
                if (appts.length > 0) {
                    setNextAppointment(appts[0]);
                }
            } catch (error) {
                console.error("Error cargando turnos:", error);
            } finally {
                setIsLoadingAppointments(false);
            }
        };

        const fetchRecentRecords = async () => {
            try {
                const records = await medicalRecordRepository.getRecordsByPatientId(user.id);
                setRecentRecords(records.slice(0, 3)); // Show top 3
            } catch (error) {
                console.error("Error cargando historial:", error);
            } finally {
                setIsLoadingRecords(false);
            }
        };

        const fetchRecentPrescriptions = async () => {
            try {
                const prescriptions = await prescriptionRepository.getPrescriptionsByPatientId(user.id);
                setRecentPrescriptions(prescriptions.slice(0, 3));
            } catch (error) {
                console.error("Error cargando recetas:", error);
            } finally {
                setIsLoadingPrescriptions(false);
            }
        };

        const fetchQuotaStatus = async () => {
            try {
                const status = await affiliateRepository.getConsultationQuotaStatus(user.id);
                setQuotaStatus(status);
            } catch (error) {
                console.error("Error cargando cupo:", error);
            }
        };

        const fetchFamily = async () => {
            try {
                let groupId = user.familyGroupId;
                if (!groupId) {
                    groupId = await familyMemberRepository.ensureFamilyGroup(user.id);
                }
                if (groupId) {
                    const members = await familyMemberRepository.getByFamilyGroup(groupId);
                    setFamilyMembers(members);
                }
            } catch (error) {
                console.error("Error cargando familiares:", error);
            }
        };

        fetchAppointments();
        fetchRecentRecords();
        fetchRecentPrescriptions();
        fetchQuotaStatus();
        fetchFamily();
    }, [user.id, refreshKey]);

    // Real-time Sync Hook
    useEffect(() => {
        if (!user.id) return;
        
        const subscription = notificationRepository.subscribeToNotifications(user.id, (notif) => {
            // If it's a success notification (usually consultation finalized), refresh lists
            if (notif.type === 'success') {
                console.log("Notificación de éxito recibida, refrescando datos...");
                triggerRefresh();
            }
        });
        
        return () => { subscription.unsubscribe(); };
    }, [user.id]);

    // Deep-link to open upload modal (HashRouter and BrowserRouter compatible)
    useEffect(() => {
        const hash = window.location.hash;
        const searchIndex = hash.indexOf('?');
        if (searchIndex !== -1) {
            const queryParams = new URLSearchParams(hash.substring(searchIndex));
            if (queryParams.get('upload') === 'true') {
                setShowUploadModal(true);
                // Limpiar query parameter del hash
                const cleanHash = hash.substring(0, searchIndex);
                window.location.hash = cleanHash;
            }
        } else {
            const queryParams = new URLSearchParams(window.location.search);
            if (queryParams.get('upload') === 'true') {
                setShowUploadModal(true);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    }, []);

    // Modals State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showAppointmentModal, setShowAppointmentModal] = useState(false);

    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadType, setUploadType] = useState<'lab_result' | 'imaging' | 'certificate' | 'other'>('lab_result');

    // Scheduler State
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');
    const [availableDoctors, setAvailableDoctors] = useState<Doctor[]>([]);
    const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
    const [isBooking, setIsBooking] = useState(false);

    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
    const [showPastSlotWarning, setShowPastSlotWarning] = useState<boolean>(false);
    const [pendingSlot, setPendingSlot] = useState<string | null>(null);

    // Reset scheduler states on modal close
    useEffect(() => {
        if (!showAppointmentModal) {
            setSelectedDate(new Date().toISOString().split('T')[0]);
            setShowDatePicker(false);
            setShowPastSlotWarning(false);
            setPendingSlot(null);
            setSelectedSlot(null);
        }
    }, [showAppointmentModal]);

    // Fetch Specialties
    useEffect(() => {
        const fetchSpecialties = async () => {
            try {
                const list = await doctorRepository.getSpecialties();
                console.log("Specialties loaded:", list);
                setSpecialties(list);
                if (list.length > 0) setSelectedSpecialty(list[0]);
            } catch (error) {
                console.error("Error fetching specialties:", error);
                setSpecialties([]); // Ensure it's not undefined
            }
        };
        fetchSpecialties();
    }, []);

    // Fetch Doctors when specialty changes
    useEffect(() => {
        if (!selectedSpecialty) return;
        
        const fetchDoctors = async () => {
            setIsLoadingDoctors(true);
            try {
                const list = await doctorRepository.getDoctorsBySpecialty(selectedSpecialty);
                setAvailableDoctors(list);
                setSelectedDoctor(null);
                setSelectedSlot(null);
            } catch (error) {
                console.error("Error fetching doctors:", error);
            } finally {
                setIsLoadingDoctors(false);
            }
        };
        fetchDoctors();
    }, [selectedSpecialty]);


    // Upload Logic
    const handleUpload = async () => {
        if (!selectedFile || !uploadTitle) {
            toast('Por favor completa el título y selecciona un archivo', 'error');
            return;
        }

        setIsUploading(true);
        try {
            await medicalDocumentRepository.uploadDocument(
                user.id,
                selectedFile,
                uploadTitle,
                uploadType,
                selectedFamilyMemberId || undefined
            );
            
            setUploadSuccess(true);
            toast('Estudio subido con éxito', 'success');
            
            setTimeout(() => {
                setShowUploadModal(false);
                setUploadSuccess(false);
                setSelectedFile(null);
                setUploadTitle('');
                setSelectedFamilyMemberId('');
            }, 2000);
        } catch (error: any) {
            console.error("Error uploading document:", error);
            toast(error.message || 'Error al subir el estudio', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 space-y-8 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px]"></div>
            </div>

            <NotificationListener userId={user.id} />

            {/* Top Bar / Navigation */}
            <div className="relative z-20 flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 group hover:border-emerald-500/50 transition-all cursor-pointer">
                        <RefreshCw 
                            size={20} 
                            className={`text-slate-500 group-hover:text-emerald-400 transition-all ${isLoadingAppointments ? 'animate-spin' : ''}`} 
                            onClick={triggerRefresh}
                        />
                    </div>
                    <div className="hidden sm:block">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Status: <span className="text-emerald-500">Encrypted & Online</span></p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <NotificationBell userId={user.id} />
                    <Link to="/profile" className="flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center border border-white/10 group-hover:border-emerald-500/30">
                            <UserIcon size={20} className="text-slate-400" />
                        </div>
                        <div className="hidden md:block pr-2">
                            <p className="text-sm font-bold text-white leading-none mb-1">{(user.name || 'Paciente').split(' ')[0]}</p>
                            <p className="text-xs font-medium text-slate-400">Mi Perfil</p>
                        </div>
                    </Link>
                </div>
            </div>

            {/* Welcome Banner */}
            <div className="relative group overflow-hidden bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all hover:border-emerald-500/30">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] group-hover:bg-emerald-500/20 transition-all duration-700"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="text-center md:text-left">
                        <div className="flex flex-wrap items-center gap-3 mb-6">
                            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-xs font-semibold text-emerald-400">Sistema Operativo</span>
                            </div>
                            {quotaStatus && (() => {
                                const badge = getQuotaBadgeContent(quotaStatus);
                                return (
                                    <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border shadow-sm ${badge.className}`}>
                                        <span className="text-xs font-semibold">{badge.label}</span>
                                    </div>
                                );
                            })()}
                        </div>
                        <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white mb-4 leading-tight">
                            Hola, <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 bg-[length:200%_auto] animate-gradient-x">{(user.name || 'Paciente').split(' ')[0]}</span>
                        </h1>
                        <p className="text-base sm:text-xl text-slate-300 font-normal max-w-xl leading-relaxed">
                            Tu ecosistema de salud está <span className="text-white font-semibold">sincronizado</span>. Tenemos todo listo para tu próxima atención.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-center gap-4 w-full md:w-auto">
                        <Button
                            variant="primary"
                            size="lg"
                            onClick={() => setShowAppointmentModal(true)}
                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold border-none shadow-[0_10px_30px_rgba(16,185,129,0.25)] px-8 py-5 rounded-2xl group relative overflow-hidden h-16 w-full sm:w-auto text-base"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                            <Video size={20} className="mr-3 transition-transform group-hover:scale-110 group-hover:rotate-12" /> 
                            <span>Nuevo Turno</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setShowUploadModal(true)}
                            className="bg-white/5 border-white/10 hover:bg-white/10 text-white px-8 py-5 rounded-2xl group h-16 w-full sm:w-auto text-base font-semibold"
                        >
                            <Upload size={20} className="mr-3 transition-transform group-hover:-translate-y-1" /> 
                            <span>Subir Estudio</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10"> {/* Left Col */}
                <div className="md:col-span-2 space-y-10">
                    {/* Next Appointment Card */}
                    <div className="group bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl transition-all hover:border-emerald-500/20">
                        <div className="flex justify-between items-center mb-10">
                            <h3 className="font-bold text-2xl text-white flex items-center tracking-tight">
                                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mr-4 border border-emerald-500/20">
                                    <Clock className="text-emerald-400" size={24} />
                                </div>
                                Próximo Turno
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowAppointmentModal(true)}
                                className="text-xs text-emerald-400 font-semibold cursor-pointer hover:text-emerald-300 transition-all bg-emerald-500/10 px-3.5 py-1.5 rounded-full border border-emerald-500/20"
                            >
                                Gestionar Agenda
                            </button>
                        </div>

                        {isLoadingAppointments ? (
                            <div className="flex flex-col items-center justify-center py-16 text-emerald-400/60">
                                <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
                                <span className="text-[10px] font-bold tracking-[0.4em] uppercase">Resolviendo Conexión Segura...</span>
                            </div>
                        ) : nextAppointment ? (
                            <div className="group/card relative flex flex-col sm:flex-row items-center bg-white/5 hover:bg-white/10 rounded-[2rem] p-8 border border-white/5 transition-all duration-500 overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity"></div>
                                <div className="flex-shrink-0 mb-6 sm:mb-0 sm:mr-8 relative">
                                    <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-3xl flex flex-col items-center justify-center text-white shadow-[0_10px_30px_rgba(16,185,129,0.3)] group-hover/card:scale-110 transition-transform duration-500">
                                        <span className="text-4xl font-bold leading-none tracking-tighter">{nextAppointment.date?.split('-')[2] || nextAppointment.date}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Hoy</span>
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-slate-900 animate-pulse"></div>
                                </div>
                                <div className="flex-1 text-center sm:text-left relative">
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-3">
                                        <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full">Consulta en vivo</span>
                                        <span className="text-xs font-mono text-slate-400 bg-white/5 px-3 py-1 rounded-full">ID: {nextAppointment.id.slice(0, 8)}</span>
                                    </div>
                                    <p className="font-bold text-2xl sm:text-3xl text-white mb-2 tracking-tight group-hover/card:text-emerald-400 transition-colors">{nextAppointment.doctorName}</p>
                                    <p className="text-slate-400 font-semibold text-base sm:text-lg flex items-center justify-center sm:justify-start">
                                        <Video size={18} className="mr-3 text-emerald-500" /> 
                                        {nextAppointment.time} <span className="mx-2 opacity-30">|</span> 
                                        <span className="text-sm font-normal text-slate-300">Sala de Espera Virtual</span>
                                    </p>
                                </div>
                                <div className="mt-6 sm:mt-0 relative w-full sm:w-auto">
                                    {['confirmed', 'in_progress'].includes(nextAppointment.status) ? (
                                        <Link
                                            to={`/room/${nextAppointment.id}`}
                                            className="group/btn relative bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-8 py-4 rounded-2xl font-bold transition-all block text-center shadow-lg shadow-emerald-500/20 overflow-hidden text-base"
                                        >
                                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform"></div>
                                            <span className="relative z-10">Ingresar a la Consulta</span>
                                        </Link>
                                    ) : (
                                        <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-5 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2">
                                            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                                            Pendiente de Confirmación
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16 bg-white/5 rounded-[2rem] border-2 border-dashed border-white/5">
                                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-700">
                                    <Clock size={40} />
                                </div>
                                <p className="text-slate-500 mb-8 font-medium text-lg italic">"Tu bienestar comienza con la prevención."</p>
                                <Button 
                                    variant="outline"
                                    onClick={async () => {
                                        try {
                                            if (quotaStatus?.isOverQuota) {
                                                toast('⚠️ Atención: Has alcanzado el límite de consultas bonificadas de tu plan. Este turno se registrará como sobre-cupo.', 'warning');
                                            } else {
                                                toast('Generando turno demo...', 'info');
                                            }
                                            await appointmentRepository.createDemoAppointment(user.id);
                                            window.location.reload();
                                        } catch (error: any) {
                                            toast(error.message || 'Error al generar el turno', 'error');
                                        }
                                    }}
                                    className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 rounded-2xl px-10 py-6 font-bold uppercase tracking-widest text-xs"
                                >
                                    Generar Acceso de Prueba
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Recent Records & Prescriptions Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                        {/* Recent Records */}
                        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl">
                            <h3 className="font-bold text-xl text-white mb-8 flex items-center tracking-tight">
                                <FileText className="text-blue-400 mr-4" size={24} /> Historial Reciente
                            </h3>
                            <div className="space-y-5">
                                {isLoadingRecords ? (
                                    <div className="space-y-4">
                                        <div className="h-28 bg-white/5 animate-pulse rounded-3xl"></div>
                                        <div className="h-28 bg-white/5 animate-pulse rounded-3xl"></div>
                                    </div>
                                ) : recentRecords.length > 0 ? (
                                    <>
                                        {recentRecords.map(record => (
                                            <div key={record.id} className="group cursor-pointer bg-white/5 hover:bg-white/10 border border-white/5 p-6 rounded-3xl transition-all duration-300">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="font-bold text-white group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{record.diagnosis}</p>
                                                        <p className="text-xs text-slate-500 font-bold mt-1 tracking-wider uppercase">Dr. {record.doctorName?.split(' ')[1] || record.doctorName}</p>
                                                    </div>
                                                    <span className="text-[9px] font-bold text-slate-500 bg-white/5 px-3 py-1 rounded-full uppercase tracking-widest border border-white/5">{record.date}</span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed italic">"{record.notes}"</p>
                                            </div>
                                        ))}
                                        <Link
                                            to="/history"
                                            className="w-full mt-4 py-5 text-center text-emerald-400 text-[10px] font-bold hover:bg-emerald-400/5 rounded-2xl transition-all flex items-center justify-center border border-emerald-500/10 uppercase tracking-[0.4em]"
                                        >
                                            Historial Completo <ChevronRight size={14} className="ml-2" />
                                        </Link>
                                    </>
                                ) : (
                                    <div className="text-center py-10 bg-white/2 rounded-3xl border border-dashed border-white/5">
                                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.3em]">Sin Registros</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recent Prescriptions */}
                        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl">
                            <h3 className="font-bold text-xl text-white mb-8 flex items-center tracking-tight">
                                <Plus className="text-teal-400 mr-4" size={24} /> Mis Recetas
                            </h3>
                            <div className="space-y-5">
                                {isLoadingPrescriptions ? (
                                    <div className="space-y-4">
                                        <div className="h-28 bg-white/5 animate-pulse rounded-3xl"></div>
                                        <div className="h-28 bg-white/5 animate-pulse rounded-3xl"></div>
                                    </div>
                                ) : recentPrescriptions.length > 0 ? (
                                    <>
                                        {recentPrescriptions.map(prescription => (
                                            <div key={prescription.id} className="group flex justify-between items-center bg-white/5 hover:bg-white/10 border border-white/5 p-6 rounded-3xl transition-all duration-300">
                                                <div className="flex-1">
                                                    <p className="font-bold text-white text-base tracking-tight">Dr. {prescription.doctorName?.split(' ')[1] || prescription.doctorName}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold mb-3 uppercase tracking-widest">{prescription.medications.length} Medicamentos</p>
                                                    <span className="text-[9px] font-bold text-teal-400 bg-teal-400/10 px-3 py-1 rounded-full uppercase tracking-widest border border-teal-400/10">{prescription.date}</span>
                                                </div>
                                                {prescription.pdfUrl ? (
                                                    <a 
                                                        href={prescription.pdfUrl} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-2xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex flex-col items-center justify-center group-hover:scale-110 active:scale-95"
                                                        title="Descargar PDF"
                                                    >
                                                        <Download size={20} />
                                                        <span className="text-[8px] font-bold mt-1 uppercase">PDF</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-[9px] text-slate-700 italic font-bold uppercase tracking-tighter">N/A</span>
                                                )}
                                            </div>
                                        ))}
                                        <Link
                                            to="/prescriptions"
                                            className="w-full mt-4 py-5 text-center text-teal-400 text-[10px] font-bold hover:bg-teal-400/5 rounded-2xl transition-all flex items-center justify-center border border-teal-500/10 uppercase tracking-[0.4em]"
                                        >
                                            Ver Todas <ChevronRight size={14} className="ml-2" />
                                        </Link>
                                    </>
                                ) : (
                                    <div className="text-center py-10 bg-white/2 rounded-3xl border border-dashed border-white/5">
                                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.3em]">Sin Recetas</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Col */}
                <div className="space-y-10">
                    {/* Digital Credential (Refractive Style) */}
                    <div className="group relative overflow-hidden rounded-[2.5rem] p-8 text-white shadow-[0_30px_60px_rgba(0,0,0,0.4)] transition-all hover:scale-[1.03] active:scale-95 cursor-pointer border border-white/20 h-[380px] flex flex-col">
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/90 via-blue-700/80 to-slate-900 opacity-90"></div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-[80px] group-hover:bg-white/20 transition-all duration-1000"></div>
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-400/20 rounded-full -ml-32 -mb-32 blur-[80px]"></div>
                        
                        <div className="relative z-10 flex-1 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-[10px] text-blue-200 uppercase tracking-[0.4em] font-bold opacity-60">ID Digital</p>
                                    <h3 className="text-2xl font-bold mt-2 tracking-tighter text-blue-300">MEDINEX</h3>
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xl">
                                    <Shield size={24} className="text-blue-200" />
                                </div>
                            </div>

                            <div className="flex items-center space-x-6 my-10">
                                <div className="relative">
                                    <div className="w-24 h-24 bg-slate-800 rounded-[2rem] overflow-hidden border-2 border-white/30 shadow-2xl transform group-hover:rotate-6 transition-transform duration-500">
                                        <img src={user.avatarUrl} alt="ID" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center border-4 border-blue-700 text-white">
                                        <Check size={14} />
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-lg sm:text-xl leading-tight tracking-tight uppercase break-words group-hover:text-blue-200 transition-colors">{user.name}</p>
                                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-3 items-baseline">
                                        <span className="text-[9px] text-blue-300/50 font-bold uppercase tracking-[0.2em]">DNI</span>
                                        <span className="text-[11px] text-blue-50 font-mono font-semibold tracking-wider">{user.dni || 'NO CARGADO'}</span>

                                        <span className="text-[9px] text-blue-300/50 font-bold uppercase tracking-[0.2em]">Plan</span>
                                        <span className="text-[11px] text-blue-50 font-semibold uppercase tracking-wide">{user.planName || 'PLAN GLOBAL'}</span>

                                        {user.bloodType && (
                                            <>
                                                <span className="text-[9px] text-blue-300/50 font-bold uppercase tracking-[0.2em]">GS</span>
                                                <span className="text-[11px] text-red-300 font-semibold tracking-wide">{user.bloodType}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                                <div className="flex flex-col">
                                    <p className="text-[9px] text-blue-300/40 uppercase font-bold tracking-[0.3em] mb-1">Hash de Seguridad</p>
                                    <p className="text-[10px] font-bold tracking-[0.2em] text-blue-100/80">
                                        {user.credentialHash ? `SEC-${user.credentialHash.slice(0, 8).toUpperCase()}` : 'VERIFICANDO...'}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
                                        <span className="text-[8px] font-bold text-blue-200/40 uppercase tracking-[0.2em]">Verified Hub</span>
                                    </div>
                                    <div className="bg-white/95 p-2 rounded-2xl shadow-[0_10px_20px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-500">
                                        <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden">
                                            {/* Representación visual del hash */}
                                            <div className="grid grid-cols-2 gap-1 p-2">
                                                <div className={`w-3 h-3 ${user.credentialHash ? 'bg-emerald-500/80' : 'bg-white/20'}`}></div>
                                                <div className="w-3 h-3 bg-white/80"></div>
                                                <div className="w-3 h-3 bg-white/80"></div>
                                                <div className={`w-3 h-3 ${user.credentialHash ? 'bg-blue-500/80' : 'bg-white/20'}`}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Family Group Card */}
                    <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="font-bold text-xl text-white tracking-tight">Grupo Familiar</h3>
                            <Link
                                to="/profile?addFamily=true"
                                className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-all border border-emerald-500/10 flex items-center justify-center"
                            >
                                <Plus size={20} />
                            </Link>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center p-4 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 group cursor-pointer hover:bg-emerald-500/10 transition-all">
                                <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-2xl mr-4 border border-white/10 shadow-lg" />
                                <div>
                                    <p className="font-bold text-white text-xs uppercase tracking-tight">{user.name}</p>
                                    <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-[0.2em] mt-1">Titular</p>
                                </div>
                            </div>
                            {familyMembers.map(member => (
                                <div key={member.id} className="flex items-center p-4 bg-white/2 rounded-3xl border border-white/5 group cursor-pointer hover:bg-white/5 transition-all">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 border border-white/5 flex items-center justify-center font-bold mr-4 text-xl">
                                        {member.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-200 text-xs uppercase tracking-tight">{member.name}</p>
                                        <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-1">{member.relation} • {member.age} Años</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Support Assistance */}
                    <div className="bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.15),transparent)] bg-slate-900/40 backdrop-blur-3xl border border-emerald-500/20 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                        </div>
                        <h3 className="font-bold text-xl text-white mb-6 tracking-tight">Asistencia Inmediata</h3>
                        <p className="text-xs text-slate-400 font-medium leading-relaxed mb-8">¿Necesitás ayuda técnica o médica urgente?</p>
                        <a
                            href="https://wa.me/1234567890" target="_blank" rel="noreferrer"
                            className="p-5 bg-emerald-500 hover:bg-emerald-400 rounded-[1.5rem] transition-all flex items-center justify-center space-x-4 group shadow-[0_10px_30px_rgba(16,185,129,0.3)] h-16"
                        >
                                <Phone size={22} className="text-white group-hover:scale-110 transition-transform" />
                                <span className="font-bold text-white uppercase tracking-[0.2em] text-sm">Hablar con MediBot</span>
                            </a>
                        </div>
                    </div>
            </div>


            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-[2rem] sm:rounded-3xl p-5 sm:p-8 w-full max-w-md shadow-2xl animate-fade-in-up">
                        {!uploadSuccess ? (
                            <>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-2xl font-bold text-white">Subir Estudio</h3>
                                    <button onClick={() => setShowUploadModal(false)} className="text-slate-500 hover:text-white transition">
                                        <X size={28} />
                                    </button>
                                </div>
                                <p className="text-slate-400 text-sm mb-8 font-medium leading-relaxed">
                                    Adjunta tus resultados en formato PDF o Imagen para que tus médicos puedan revisarlos en tiempo real.
                                </p>

                                <div className="space-y-6 mb-8">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Paciente / Destinatario</label>
                                        <select 
                                            value={selectedFamilyMemberId}
                                            onChange={(e) => setSelectedFamilyMemberId(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
                                        >
                                            <option value="">Yo ({user.name})</option>
                                            {familyMembers.map(member => (
                                                <option key={member.id} value={member.id}>
                                                    {member.name} ({member.relation})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Título del Estudio</label>
                                        <input 
                                            type="text" 
                                            value={uploadTitle}
                                            onChange={(e) => setUploadTitle(e.target.value)}
                                            placeholder="Ej: Análisis de Sangre"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all placeholder:text-slate-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Categoría</label>
                                        <select 
                                            value={uploadType}
                                            onChange={(e) => setUploadType(e.target.value as any)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
                                        >
                                            <option value="lab_result">Análisis de Laboratorio</option>
                                            <option value="imaging">Imagenología</option>
                                            <option value="certificate">Certificado Médico</option>
                                            <option value="other">Otro</option>
                                        </select>
                                    </div>
                                </div>

                                <label className="relative border-2 border-dashed border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center mb-8 hover:bg-white/5 hover:border-emerald-500/30 transition-all cursor-pointer group">
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                                        accept=".pdf,image/*"
                                    />
                                    <div className="bg-emerald-500/10 p-5 rounded-2xl text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                                        <Upload size={32} />
                                    </div>
                                    <p className="text-sm font-bold text-slate-300">
                                        {selectedFile ? selectedFile.name : 'Seleccionar Archivo'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-tighter">PDF o Imagen (Máx. 5MB)</p>
                                </label>

                                <div className="flex flex-col gap-3">
                                    <Button
                                        onClick={handleUpload}
                                        disabled={isUploading || !selectedFile || !uploadTitle}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-emerald-500/20 disabled:bg-slate-800 disabled:text-slate-600"
                                    >
                                        {isUploading ? 'SUBIENDO...' : 'CONFIRMAR ENVÍO'}
                                    </Button>
                                    <button
                                        onClick={() => setShowUploadModal(false)}
                                        className="w-full py-4 text-slate-500 font-bold text-sm hover:text-white transition uppercase tracking-widest"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-10">
                                <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce border border-emerald-500/20">
                                    <Check size={40} />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2 uppercase tracking-tight">¡Éxito!</h3>
                                <p className="text-slate-400 font-medium">Tu estudio fue cargado correctamente.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* New Appointment Modal */}
            {showAppointmentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-[2rem] sm:rounded-3xl p-5 sm:p-8 w-full max-w-xl shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-bold text-white uppercase tracking-tight">Agendar Turno</h3>
                            <button onClick={() => setShowAppointmentModal(false)} className="text-slate-500 hover:text-white transition">
                                <X size={28} />
                            </button>
                        </div>

                        <div className="space-y-8">
                            {/* Specialty Selection */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Especialidad</label>
                                 <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {specialties.length > 0 ? (
                                        specialties.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setSelectedSpecialty(s)}
                                                className={`p-3 text-xs font-bold rounded-xl border transition-all ${
                                                    selectedSpecialty === s 
                                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                                                    : 'bg-white/5 border-white/5 text-slate-400 hover:border-emerald-500/30'
                                                }`}
                                            >
                                                {s.toUpperCase()}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="col-span-full py-4 text-center bg-white/5 rounded-xl border border-dashed border-white/10">
                                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                                                No hay especialidades disponibles en este momento
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Doctor Selection */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Profesional Disponible</label>
                                <div className="space-y-3">
                                    {isLoadingDoctors ? (
                                        <div className="flex flex-col items-center justify-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                                            <div className="w-8 h-8 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-3"></div>
                                            <span className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-[0.3em]">Sincronizando Profesionales...</span>
                                        </div>
                                    ) : availableDoctors.length > 0 ? (
                                        availableDoctors.map(doc => (
                                            <div 
                                                key={doc.id} 
                                                onClick={() => setSelectedDoctor(doc)}
                                                className={`group/doc flex items-center p-4 bg-white/5 border rounded-2xl cursor-pointer transition-all duration-300 ${
                                                    selectedDoctor?.id === doc.id 
                                                    ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                                                    : 'border-white/5 hover:border-emerald-500/30 hover:bg-white/10'
                                                }`}
                                            >
                                                <div className="w-14 h-14 bg-slate-800 rounded-xl mr-4 flex items-center justify-center text-emerald-400 font-bold overflow-hidden border border-white/10 group-hover/doc:scale-105 transition-transform">
                                                    {doc.avatarUrl ? (
                                                        <img src={doc.avatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        doc.name.charAt(0)
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-white group-hover/doc:text-emerald-400 transition-colors">{doc.name.toUpperCase()}</p>
                                                    <div className="flex items-center text-[10px] font-bold text-slate-500 mt-1">
                                                        <span className="flex items-center text-amber-400 mr-3">★ {doc.rating}</span>
                                                        <span className="uppercase tracking-widest">{doc.specialty}</span>
                                                    </div>
                                                </div>
                                                {selectedDoctor?.id === doc.id ? (
                                                    <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 animate-scale-in">
                                                        <Check size={16} strokeWidth={4} />
                                                    </div>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full border border-white/10 group-hover/doc:border-emerald-500/30 transition-colors"></div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">No se encontraron profesionales disponibles</p>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Slot Selection */}
                            {selectedDoctor && (
                                <div className="animate-fade-in bg-white/5 p-6 rounded-2xl border border-white/5 space-y-4">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            Horarios Disponibles ({selectedDate.split('-').reverse().join('/')})
                                        </label>
                                        {!showDatePicker && (
                                            <button
                                                type="button"
                                                onClick={() => setShowDatePicker(true)}
                                                className="text-[10px] text-emerald-400 font-bold hover:text-emerald-300 transition-colors uppercase tracking-wider"
                                            >
                                                Cambiar Fecha
                                            </button>
                                        )}
                                    </div>

                                    {showDatePicker && (
                                        <div className="animate-fade-in bg-slate-950/30 p-4 rounded-xl border border-white/5 space-y-3">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Seleccionar Fecha</label>
                                            <div className="flex gap-3">
                                                <input
                                                    type="date"
                                                    min={new Date().toISOString().split('T')[0]}
                                                    value={selectedDate}
                                                    onChange={(e) => {
                                                        setSelectedDate(e.target.value);
                                                        setSelectedSlot(null);
                                                        setShowPastSlotWarning(false);
                                                    }}
                                                    className="flex-1 bg-slate-900 border border-white/10 rounded-xl p-3 text-white text-xs outline-none focus:border-emerald-500 transition-colors font-mono"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowDatePicker(false);
                                                        setSelectedDate(new Date().toISOString().split('T')[0]);
                                                        setSelectedSlot(null);
                                                        setShowPastSlotWarning(false);
                                                    }}
                                                    className="px-4 text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider border border-white/10 rounded-xl"
                                                >
                                                    Cerrar
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                        {selectedDoctor.availability?.map(slot => {
                                            const isSelected = selectedSlot === slot;
                                            return (
                                                <button
                                                    key={slot}
                                                    type="button"
                                                    onClick={() => {
                                                        // Check if selectedDate is today
                                                        const isToday = selectedDate === new Date().toISOString().split('T')[0];
                                                        if (isToday) {
                                                            const now = new Date();
                                                            const [hours, minutes] = slot.split(':');
                                                            const slotTime = new Date();
                                                            slotTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                                                            if (slotTime < now) {
                                                                setPendingSlot(slot);
                                                                setShowPastSlotWarning(true);
                                                                setSelectedSlot(null);
                                                                return;
                                                            }
                                                        }
                                                        setSelectedSlot(slot);
                                                        setShowPastSlotWarning(false);
                                                        setPendingSlot(null);
                                                    }}
                                                    className={`py-3 text-xs font-bold rounded-xl border transition-all ${
                                                        isSelected 
                                                            ? 'bg-emerald-500 text-[#020617] border-emerald-500 shadow-lg shadow-emerald-500/20' 
                                                            : 'bg-slate-800 border-white/5 text-slate-400 hover:border-emerald-500/30'
                                                    }`}
                                                >
                                                    {slot}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {showPastSlotWarning && (
                                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="flex gap-3 text-amber-400">
                                                <AlertTriangle className="flex-shrink-0" size={18} />
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wide">Horario ya pasó hoy</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                                                        El turno de las <strong className="text-white">{pendingSlot} hs</strong> no está disponible para hoy. ¿Querés agendarlo para mañana o elegir otra fecha?
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const tomorrow = new Date();
                                                        tomorrow.setDate(tomorrow.getDate() + 1);
                                                        setSelectedDate(tomorrow.toISOString().split('T')[0]);
                                                        setSelectedSlot(pendingSlot);
                                                        setShowPastSlotWarning(false);
                                                        setPendingSlot(null);
                                                    }}
                                                    className="flex-1 py-2 text-[10px] font-bold bg-amber-500 text-[#020617] rounded-lg hover:bg-amber-400 transition-colors uppercase tracking-wider"
                                                >
                                                    Agendar para Mañana
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowDatePicker(true);
                                                        setShowPastSlotWarning(false);
                                                    }}
                                                    className="flex-1 py-2 text-[10px] font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg transition-colors uppercase tracking-wider"
                                                >
                                                    Elegir otra fecha
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowPastSlotWarning(false);
                                                        setPendingSlot(null);
                                                    }}
                                                    className="px-3 py-2 text-[10px] font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pt-6">
                                <Button
                                    onClick={async () => {
                                        if (!selectedDoctor || !selectedSlot) return;
                                        setIsBooking(true);
                                        try {
                                            const [hours, minutes] = selectedSlot.split(':');
                                            const scheduledDate = new Date(selectedDate + 'T00:00:00');
                                            scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                                            await appointmentRepository.createAppointment({
                                                patient_id: user.id,
                                                doctor_id: selectedDoctor.id,
                                                scheduled_at: scheduledDate.toISOString(),
                                                specialty: selectedSpecialty,
                                                status: 'confirmed'
                                            });

                                            toast('¡Turno agendado con éxito!', 'success');
                                            setShowAppointmentModal(false);
                                            window.location.reload();
                                        } catch (error: any) {
                                            toast(error.message || 'Error al agendar el turno', 'error');
                                        } finally {
                                            setIsBooking(false);
                                        }
                                    }}
                                    disabled={!selectedDoctor || !selectedSlot || isBooking}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-5 rounded-2xl shadow-xl shadow-emerald-500/20 disabled:bg-slate-800"
                                >
                                    {isBooking ? 'PROCESANDO...' : 'CONFIRMAR TURNO'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PatientDashboard;