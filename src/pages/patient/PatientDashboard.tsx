import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Patient, Appointment, Doctor, Prescription } from '../../types';
import { MOCK_RECORDS } from '../../constants';
import { Calendar, Video, FileText, Plus, Clock, ChevronRight, Upload, Phone, User as UserIcon, X, Check, Search, Download, Shield, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { doctorRepository } from '../../repositories/DoctorRepository';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { prescriptionRepository } from '../../repositories/PrescriptionRepository';
import { medicalDocumentRepository } from '../../repositories/MedicalDocumentRepository';
import { NotificationBell } from '../../components/dashboard/NotificationBell';
import { NotificationListener } from '../../components/dashboard/NotificationListener';
import { notificationRepository } from '../../repositories/NotificationRepository';

interface Props {
    user: Patient;
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

        fetchAppointments();
        fetchRecentRecords();
        fetchRecentPrescriptions();
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

    // Modals State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showAppointmentModal, setShowAppointmentModal] = useState(false);
    const [showFamilyModal, setShowFamilyModal] = useState(false);

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
                uploadType
            );
            
            setUploadSuccess(true);
            toast('Estudio subido con éxito', 'success');
            
            setTimeout(() => {
                setShowUploadModal(false);
                setUploadSuccess(false);
                setSelectedFile(null);
                setUploadTitle('');
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
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Status: <span className="text-emerald-500">Encrypted & Online</span></p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <NotificationBell userId={user.id} />
                    <Link to="/profile" className="flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center border border-white/10 group-hover:border-emerald-500/30">
                            <UserIcon size={20} className="text-slate-400" />
                        </div>
                        <div className="hidden md:block pr-2">
                            <p className="text-xs font-black text-white leading-none mb-1">{(user.name || 'Paciente').split(' ')[0]}</p>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Mi Perfil</p>
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
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Sistema Operativo</span>
                            </div>
                            <div className="hidden sm:inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                                <Shield size={12} className="text-blue-400" />
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Multi-Node Robustness Active</span>
                            </div>
                        </div>
                            Hola, <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 bg-[length:200%_auto] animate-gradient-x">{(user.name || 'Paciente').split(' ')[0]}</span>
                        <p className="text-xl text-slate-400 font-medium max-w-xl leading-relaxed">
                            Tu ecosistema de salud está <span className="text-white font-bold">sincronizado</span>. Tenemos todo listo para tu próxima atención.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-center gap-5 w-full md:w-auto">
                        <Button
                            variant="primary"
                            size="lg"
                            onClick={() => setShowAppointmentModal(true)}
                            className="bg-emerald-500 hover:bg-emerald-400 text-white border-none shadow-[0_0_40px_rgba(16,185,129,0.3)] px-10 py-8 rounded-3xl group relative overflow-hidden h-20"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                            <Video size={24} className="mr-4 transition-transform group-hover:scale-110 group-hover:rotate-12" /> 
                            <span className="text-xl font-black uppercase tracking-widest">Nuevo Turno</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setShowUploadModal(true)}
                            className="bg-white/5 border-white/10 hover:bg-white/10 text-white px-10 py-8 rounded-3xl group h-20"
                        >
                            <Upload size={24} className="mr-4 transition-transform group-hover:-translate-y-2" /> 
                            <span className="text-xl font-black uppercase tracking-widest">Subir Estudio</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10"> {/* Left Col */}
                <div className="md:col-span-2 space-y-10">
                    {/* Next Appointment Card */}
                    <div className="group bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl transition-all hover:border-emerald-500/20">
                        <div className="flex justify-between items-center mb-10">
                            <h3 className="font-black text-2xl text-white flex items-center tracking-tight">
                                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mr-4 border border-emerald-500/20">
                                    <Clock className="text-emerald-400" size={24} />
                                </div>
                                Próximo Turno
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowAppointmentModal(true)}
                                className="text-xs text-emerald-400 font-black cursor-pointer hover:text-emerald-300 transition-all uppercase tracking-[0.3em] bg-emerald-500/5 px-4 py-2 rounded-full border border-emerald-500/10"
                            >
                                Gestionar Agenda
                            </button>
                        </div>

                        {isLoadingAppointments ? (
                            <div className="flex flex-col items-center justify-center py-16 text-emerald-400/60">
                                <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
                                <span className="text-[10px] font-black tracking-[0.4em] uppercase">Resolviendo Conexión Segura...</span>
                            </div>
                        ) : nextAppointment ? (
                            <div className="group/card relative flex flex-col sm:flex-row items-center bg-white/5 hover:bg-white/10 rounded-[2rem] p-8 border border-white/5 transition-all duration-500 overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity"></div>
                                <div className="flex-shrink-0 mb-6 sm:mb-0 sm:mr-8 relative">
                                    <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-3xl flex flex-col items-center justify-center text-white shadow-[0_10px_30px_rgba(16,185,129,0.3)] group-hover/card:scale-110 transition-transform duration-500">
                                        <span className="text-4xl font-black leading-none tracking-tighter">{nextAppointment.date.split('-')[2]}</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest mt-1">Hoy</span>
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-slate-900 animate-pulse"></div>
                                </div>
                                <div className="flex-1 text-center sm:text-left relative">
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-3">
                                        <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full uppercase tracking-[0.2em]">Live Session</span>
                                        <span className="text-[9px] font-black bg-white/5 text-slate-500 px-3 py-1 rounded-full uppercase tracking-[0.2em]">ID: {nextAppointment.id.slice(0, 8)}</span>
                                    </div>
                                    <p className="font-black text-3xl text-white mb-2 tracking-tight group-hover/card:text-emerald-400 transition-colors">{nextAppointment.doctorName}</p>
                                    <p className="text-slate-400 font-bold text-lg flex items-center justify-center sm:justify-start">
                                        <Video size={18} className="mr-3 text-emerald-500" /> 
                                        {nextAppointment.time} <span className="mx-2 opacity-30">|</span> 
                                        <span className="text-sm font-medium">Virtual Waiting Room</span>
                                    </p>
                                </div>
                                <div className="mt-8 sm:mt-0 relative">
                                    {nextAppointment.status === 'confirmed' ? (
                                        <Link
                                            to={`/room/${nextAppointment.id}`}
                                            className="group/btn relative bg-emerald-500 hover:bg-emerald-400 text-white px-10 py-5 rounded-2xl font-black transition-all inline-block text-center shadow-[0_10px_40px_rgba(16,185,129,0.2)] overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform"></div>
                                            <span className="relative z-10 text-lg tracking-widest">INGRESAR</span>
                                        </Link>
                                    ) : (
                                        <div className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3">
                                            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                                            Pendiente
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
                                            toast('Generando turno demo...', 'info');
                                            await appointmentRepository.createDemoAppointment(user.id);
                                            window.location.reload();
                                        } catch (error: any) {
                                            toast(error.message || 'Error al generar el turno', 'error');
                                        }
                                    }}
                                    className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 rounded-2xl px-10 py-6 font-black uppercase tracking-widest text-xs"
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
                            <h3 className="font-black text-xl text-white mb-8 flex items-center tracking-tight">
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
                                                        <p className="font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{record.diagnosis}</p>
                                                        <p className="text-xs text-slate-500 font-bold mt-1 tracking-wider uppercase">Dr. {record.doctorName?.split(' ')[1] || record.doctorName}</p>
                                                    </div>
                                                    <span className="text-[9px] font-black text-slate-500 bg-white/5 px-3 py-1 rounded-full uppercase tracking-widest border border-white/5">{record.date}</span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed italic">"{record.notes}"</p>
                                            </div>
                                        ))}
                                        <Link
                                            to="/history"
                                            className="w-full mt-4 py-5 text-center text-emerald-400 text-[10px] font-black hover:bg-emerald-400/5 rounded-2xl transition-all flex items-center justify-center border border-emerald-500/10 uppercase tracking-[0.4em]"
                                        >
                                            Historial Completo <ChevronRight size={14} className="ml-2" />
                                        </Link>
                                    </>
                                ) : (
                                    <div className="text-center py-10 bg-white/2 rounded-3xl border border-dashed border-white/5">
                                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">Sin Registros</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recent Prescriptions */}
                        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl">
                            <h3 className="font-black text-xl text-white mb-8 flex items-center tracking-tight">
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
                                                    <p className="font-black text-white text-base tracking-tight">Dr. {prescription.doctorName?.split(' ')[1] || prescription.doctorName}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold mb-3 uppercase tracking-widest">{prescription.medications.length} Medicamentos</p>
                                                    <span className="text-[9px] font-black text-teal-400 bg-teal-400/10 px-3 py-1 rounded-full uppercase tracking-widest border border-teal-400/10">{prescription.date}</span>
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
                                                        <span className="text-[8px] font-black mt-1 uppercase">PDF</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-[9px] text-slate-700 italic font-black uppercase tracking-tighter">N/A</span>
                                                )}
                                            </div>
                                        ))}
                                        <Link
                                            to="/prescriptions"
                                            className="w-full mt-4 py-5 text-center text-teal-400 text-[10px] font-black hover:bg-teal-400/5 rounded-2xl transition-all flex items-center justify-center border border-teal-500/10 uppercase tracking-[0.4em]"
                                        >
                                            Ver Todas <ChevronRight size={14} className="ml-2" />
                                        </Link>
                                    </>
                                ) : (
                                    <div className="text-center py-10 bg-white/2 rounded-3xl border border-dashed border-white/5">
                                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">Sin Recetas</p>
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
                                    <p className="text-[10px] text-blue-200 uppercase tracking-[0.4em] font-black opacity-60">ID Digital</p>
                                    <h3 className="text-2xl font-black mt-2 tracking-tighter">TELEMED <span className="text-blue-300">PRO</span></h3>
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
                                <div>
                                    <p className="font-black text-2xl leading-none tracking-tight uppercase group-hover:text-blue-200 transition-colors">{user.name}</p>
                                    <div className="flex flex-col gap-1 mt-3">
                                        <p className="text-[10px] text-blue-100/60 font-black uppercase tracking-widest flex items-center">
                                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2"></span> DNI: {user.dni || 'NO CARGADO'}
                                        </p>
                                        <p className="text-[10px] text-blue-100/60 font-black uppercase tracking-widest flex items-center">
                                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-2"></span> {user.planName || 'PLAN GLOBAL'}
                                        </p>
                                        {user.bloodType && (
                                            <p className="text-[10px] text-red-300 font-black uppercase tracking-widest flex items-center">
                                                <span className="w-1.5 h-1.5 bg-red-400 rounded-full mr-2"></span> GS: {user.bloodType}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                                <div className="flex flex-col">
                                    <p className="text-[9px] text-blue-300/40 uppercase font-black tracking-[0.3em] mb-1">Hash de Seguridad</p>
                                    <p className="text-[10px] font-black tracking-[0.2em] text-blue-100/80">
                                        {user.credentialHash ? `SEC-${user.credentialHash.slice(0, 8).toUpperCase()}` : 'VERIFICANDO...'}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
                                        <span className="text-[8px] font-black text-blue-200/40 uppercase tracking-[0.2em]">Verified Hub</span>
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
                            <h3 className="font-black text-xl text-white tracking-tight">Grupo Familiar</h3>
                            <button
                                type="button"
                                onClick={() => setShowFamilyModal(true)}
                                className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-all border border-emerald-500/10 flex items-center justify-center"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center p-4 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 group cursor-pointer hover:bg-emerald-500/10 transition-all">
                                <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-2xl mr-4 border border-white/10 shadow-lg" />
                                <div>
                                    <p className="font-black text-white text-xs uppercase tracking-tight">{user.name}</p>
                                    <p className="text-[9px] text-emerald-500 font-black uppercase tracking-[0.2em] mt-1">Titular</p>
                                </div>
                            </div>
                            {user.familyMembers?.map(member => (
                                <div key={member.id} className="flex items-center p-4 bg-white/2 rounded-3xl border border-white/5 group cursor-pointer hover:bg-white/5 transition-all">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 border border-white/5 flex items-center justify-center font-black mr-4 text-xl">
                                        {member.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-200 text-xs uppercase tracking-tight">{member.name}</p>
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
                        <h3 className="font-black text-xl text-white mb-6 tracking-tight">Asistencia Inmediata</h3>
                        <p className="text-xs text-slate-400 font-medium leading-relaxed mb-8">¿Necesitás ayuda técnica o médica urgente?</p>
                        <a
                            href="https://wa.me/1234567890" target="_blank" rel="noreferrer"
                            className="p-5 bg-emerald-500 hover:bg-emerald-400 rounded-[1.5rem] transition-all flex items-center justify-center space-x-4 group shadow-[0_10px_30px_rgba(16,185,129,0.3)] h-16"
                        >
                                <Phone size={22} className="text-white group-hover:scale-110 transition-transform" />
                                <span className="font-black text-white uppercase tracking-[0.2em] text-sm">WhatsApp Concierge</span>
                            </a>
                        </div>
                    </div>
            </div>


            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-fade-in-up">
                        {!uploadSuccess ? (
                            <>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-2xl font-black text-white">Subir Estudio</h3>
                                    <button onClick={() => setShowUploadModal(false)} className="text-slate-500 hover:text-white transition">
                                        <X size={28} />
                                    </button>
                                </div>
                                <p className="text-slate-400 text-sm mb-8 font-medium leading-relaxed">
                                    Adjunta tus resultados en formato PDF o Imagen para que tus médicos puedan revisarlos en tiempo real.
                                </p>

                                <div className="space-y-6 mb-8">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Título del Estudio</label>
                                        <input 
                                            type="text" 
                                            value={uploadTitle}
                                            onChange={(e) => setUploadTitle(e.target.value)}
                                            placeholder="Ej: Análisis de Sangre"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all placeholder:text-slate-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Categoría</label>
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
                                    <p className="text-sm font-black text-slate-300">
                                        {selectedFile ? selectedFile.name : 'Seleccionar Archivo'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-tighter">PDF o Imagen (Máx. 5MB)</p>
                                </label>

                                <div className="flex flex-col gap-3">
                                    <Button
                                        onClick={handleUpload}
                                        disabled={isUploading || !selectedFile || !uploadTitle}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-500/20 disabled:bg-slate-800 disabled:text-slate-600"
                                    >
                                        {isUploading ? 'SUBIENDO...' : 'CONFIRMAR ENVÍO'}
                                    </Button>
                                    <button
                                        onClick={() => setShowUploadModal(false)}
                                        className="w-full py-4 text-slate-500 font-black text-sm hover:text-white transition uppercase tracking-widest"
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
                                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">¡Éxito!</h3>
                                <p className="text-slate-400 font-medium">Tu estudio fue cargado correctamente.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* New Appointment Modal */}
            {showAppointmentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-xl shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-white uppercase tracking-tight">Agendar Turno</h3>
                            <button onClick={() => setShowAppointmentModal(false)} className="text-slate-500 hover:text-white transition">
                                <X size={28} />
                            </button>
                        </div>

                        <div className="space-y-8">
                            {/* Specialty Selection */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Especialidad</label>
                                 <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {specialties.length > 0 ? (
                                        specialties.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setSelectedSpecialty(s)}
                                                className={`p-3 text-xs font-black rounded-xl border transition-all ${
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
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                No hay especialidades disponibles en este momento
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Doctor Selection */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Profesional Disponible</label>
                                <div className="space-y-3">
                                    {isLoadingDoctors ? (
                                        <div className="flex flex-col items-center justify-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                                            <div className="w-8 h-8 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-3"></div>
                                            <span className="text-[10px] font-black text-emerald-400/60 uppercase tracking-[0.3em]">Sincronizando Profesionales...</span>
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
                                                <div className="w-14 h-14 bg-slate-800 rounded-xl mr-4 flex items-center justify-center text-emerald-400 font-black overflow-hidden border border-white/10 group-hover/doc:scale-105 transition-transform">
                                                    {doc.avatarUrl ? (
                                                        <img src={doc.avatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        doc.name.charAt(0)
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-black text-white group-hover/doc:text-emerald-400 transition-colors">{doc.name.toUpperCase()}</p>
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
                                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">No se encontraron profesionales disponibles</p>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Slot Selection */}
                            {selectedDoctor && (
                                <div className="animate-fade-in bg-white/5 p-6 rounded-2xl border border-white/5">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Horarios Disponibles</label>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                        {selectedDoctor.availability?.map(slot => (
                                            <button
                                                key={slot}
                                                onClick={() => setSelectedSlot(slot)}
                                                className={`py-3 text-xs font-black rounded-xl border transition-all ${
                                                    selectedSlot === slot 
                                                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' 
                                                        : 'bg-slate-800 border-white/5 text-slate-400 hover:border-emerald-500/30'
                                                }`}
                                            >
                                                {slot}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-6">
                                <Button
                                    onClick={async () => {
                                        if (!selectedDoctor || !selectedSlot) return;
                                        setIsBooking(true);
                                        try {
                                            const now = new Date();
                                            const [hours, minutes] = selectedSlot.split(':');
                                            const scheduledDate = new Date();
                                            scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                                            if (scheduledDate < now) scheduledDate.setDate(scheduledDate.getDate() + 1);

                                            await appointmentRepository.createAppointment({
                                                patient_id: user.id,
                                                doctor_id: selectedDoctor.id,
                                                scheduled_at: scheduledDate.toISOString(),
                                                specialty: selectedSpecialty,
                                                status: 'pending'
                                            });

                                            toast('¡Turno agendado con éxito!', 'success');
                                            setShowAppointmentModal(false);
                                            window.location.reload();
                                        } catch (error) {
                                            toast('Error al agendar el turno', 'error');
                                        } finally {
                                            setIsBooking(false);
                                        }
                                    }}
                                    disabled={!selectedDoctor || !selectedSlot || isBooking}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-emerald-500/20 disabled:bg-slate-800"
                                >
                                    {isBooking ? 'PROCESANDO...' : 'CONFIRMAR TURNO'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Family Member Modal */}
            {showFamilyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-white uppercase tracking-tight">Nuevo Familiar</h3>
                            <button onClick={() => setShowFamilyModal(false)} className="text-slate-500 hover:text-white transition">
                                <X size={28} />
                            </button>
                        </div>
                        <form className="space-y-6" onSubmit={(e) => {
                            e.preventDefault();
                            alert('Solicitud enviada para aprobación.');
                            setShowFamilyModal(false);
                        }}>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nombre Completo</label>
                                <input type="text" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50" required placeholder="Ej: Maria Perez" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">DNI</label>
                                <input type="text" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50" required placeholder="XX.XXX.XXX" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Parentesco</label>
                                    <select className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none">
                                        <option>Hijo/a</option>
                                        <option>Cónyuge</option>
                                        <option>Padre/Madre</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">F. Nacimiento</label>
                                    <input type="date" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/50" required />
                                </div>
                            </div>
                            <Button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-500/20 mt-4">
                                GUARDAR INTEGRANTE
                            </Button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PatientDashboard;