import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Patient, Appointment } from '../../types';
import { MOCK_RECORDS, MOCK_DOCTORS } from '../../constants';
import { Calendar, Video, FileText, Plus, Clock, ChevronRight, Upload, Phone, User as UserIcon, X, Check, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { appointmentRepository } from '../../repositories/AppointmentRepository';

interface Props {
    user: Patient;
}

const PatientDashboard: React.FC<Props> = ({ user }) => {
    const { toast } = useToast();
    const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
    const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);

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
        fetchAppointments();
    }, [user.id]);

    // Modals State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showAppointmentModal, setShowAppointmentModal] = useState(false);
    const [showFamilyModal, setShowFamilyModal] = useState(false);

    // Loading States
    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    // Upload Logic
    const handleUpload = () => {
        setIsUploading(true);
        setTimeout(() => {
            setIsUploading(false);
            setUploadSuccess(true);
            setTimeout(() => {
                setShowUploadModal(false);
                setUploadSuccess(false);
            }, 1500);
        }, 2000);
    };

    return (
        <div className="space-y-6">

            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Hola, {user.name}</h1>
                    <p className="opacity-90">Tu salud está al día. ¿Cómo te sientes hoy?</p>
                </div>
                <div className="mt-4 md:mt-0 flex space-x-3">
                    <button
                        type="button"
                        onClick={() => setShowAppointmentModal(true)}
                        className="bg-white text-teal-600 px-4 py-2 rounded-xl font-bold hover:bg-teal-50 transition flex items-center shadow-sm"
                    >
                        <Video size={18} className="mr-2" /> Nuevo Turno
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowUploadModal(true)}
                        className="bg-teal-700 bg-opacity-40 text-white px-4 py-2 rounded-xl font-bold hover:bg-opacity-50 transition flex items-center border border-teal-400"
                    >
                        <Upload size={18} className="mr-2" /> Subir Estudio
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Left Col */}
                <div className="md:col-span-2 space-y-6">
                    {/* Next Appointment Card */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg text-gray-800 flex items-center">
                                <Clock className="text-teal-500 mr-2" size={20} /> Próximo Turno
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowAppointmentModal(true)}
                                className="text-sm text-teal-600 font-medium cursor-pointer hover:underline"
                            >
                                Ver agenda
                            </button>
                        </div>

                        {isLoadingAppointments ? (
                            <div className="flex flex-col items-center justify-center py-8 text-teal-600">
                                <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span className="text-sm font-medium">Buscando turnos en la base de datos...</span>
                            </div>
                        ) : nextAppointment ? (
                            <div className="flex flex-col sm:flex-row items-center bg-teal-50 rounded-xl p-4 border border-teal-100">
                                <div className="flex-shrink-0 mb-4 sm:mb-0 sm:mr-4">
                                    <div className="w-14 h-14 bg-teal-200 rounded-full flex items-center justify-center text-teal-700 font-bold text-xl">
                                        {nextAppointment.date.split('-')[2]}
                                    </div>
                                </div>
                                <div className="flex-1 text-center sm:text-left">
                                    <p className="font-bold text-gray-800">{nextAppointment.doctorName}</p>
                                    <p className="text-sm text-gray-500">Video Consulta • {nextAppointment.time} hs</p>
                                </div>
                                <div className="mt-4 sm:mt-0">
                                    {nextAppointment.status === 'confirmed' ? (
                                        <Link
                                            to={`/room/${nextAppointment.id}`}
                                            className="bg-teal-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-teal-700 transition inline-block text-center shadow-lg shadow-teal-500/30 animate-pulse"
                                        >
                                            Ingresar a la Sala
                                        </Link>
                                    ) : (
                                        <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold">Pendiente</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <p className="text-gray-500 mb-4">No tienes turnos programados.</p>
                                <button 
                                    onClick={async () => {
                                        try {
                                            toast('Generando turno demo...', 'info');
                                            await appointmentRepository.createDemoAppointment(user.id);
                                            window.location.reload();
                                        } catch (error: any) {
                                            toast(error.message || 'Error al generar el turno', 'error');
                                        }
                                    }}
                                    className="bg-teal-100 text-teal-700 px-4 py-2 rounded font-bold hover:bg-teal-200 transition"
                                >
                                    Generar Turno de Prueba
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Recent Records */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center">
                            <FileText className="text-blue-500 mr-2" size={20} /> Últimos Registros
                        </h3>
                        <div className="space-y-4">
                            {MOCK_RECORDS.slice(0, 2).map(record => (
                                <div key={record.id} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                                    <div className="flex justify-between">
                                        <p className="font-medium text-gray-800">{record.diagnosis}</p>
                                        <span className="text-xs text-gray-500">{record.date}</span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1">{record.doctorName}</p>
                                    <p className="text-xs text-gray-400 mt-2 line-clamp-2">{record.notes}</p>
                                </div>
                            ))}
                            <Link
                                to="/history"
                                className="w-full mt-2 text-center text-teal-600 text-sm font-medium hover:underline flex items-center justify-center"
                            >
                                Ver historia clínica completa <ChevronRight size={14} className="ml-1" />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Right Col */}
                <div className="space-y-6">
                    {/* Digital Credential (PRD 3.1) */}
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden transform transition hover:scale-[1.02] cursor-pointer">
                        <div className="absolute top-0 right-0 p-12 opacity-10 bg-white rounded-full translate-x-10 -translate-y-10"></div>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <p className="text-xs text-blue-200 uppercase tracking-widest font-semibold">Credencial Digital</p>
                                <h3 className="text-lg font-bold mt-1">TeleMed Pro</h3>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                <UserIcon size={16} />
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="w-16 h-16 bg-gray-300 rounded-lg overflow-hidden border-2 border-white/30">
                                <img src={user.avatarUrl} alt="ID" className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <p className="font-bold text-lg leading-tight">{user.name.toUpperCase()}</p>
                                <p className="text-xs text-blue-200 mt-1">DNI: {user.dni}</p>
                                <p className="text-xs text-blue-200">Plan: {user.planName}</p>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-end">
                            <p className="text-[10px] text-blue-300">Válido hasta: 12/2025</p>
                            <div className="bg-white p-1 rounded">
                                <div className="w-8 h-8 bg-black"></div> {/* Mock QR */}
                            </div>
                        </div>
                    </div>

                    {/* Family Group Card */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg text-gray-800">Grupo Familiar</h3>
                            <button
                                type="button"
                                onClick={() => setShowFamilyModal(true)}
                                className="text-teal-600 hover:bg-teal-50 p-1 rounded transition"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                                <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full mr-3" />
                                <div>
                                    <p className="font-medium text-sm text-gray-900">{user.name}</p>
                                    <p className="text-xs text-green-600 font-medium">Titular</p>
                                </div>
                            </div>
                            {user.familyMembers?.map(member => (
                                <div key={member.id} className="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mr-3 text-sm">
                                        {member.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-gray-900">{member.name}</p>
                                        <p className="text-xs text-gray-500">{member.relation} • {member.age} años</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-lg text-gray-800 mb-4">Accesos Rápidos</h3>
                        <div className="space-y-3">
                            <a
                                href="https://wa.me/1234567890" target="_blank" rel="noreferrer"
                                className="p-3 bg-green-50 rounded-xl hover:bg-green-100 transition flex items-center space-x-3 group"
                            >
                                <div className="bg-green-200 text-green-700 w-8 h-8 rounded-full flex items-center justify-center">
                                    <Phone size={16} />
                                </div>
                                <div>
                                    <span className="font-bold text-green-900 block text-sm">WhatsApp</span>
                                    <span className="text-[10px] text-green-700">Chat soporte 24hs</span>
                                </div>
                            </a>
                        </div>
                    </div>

                </div>

            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl m-4 animate-fade-in-up">
                        {!uploadSuccess ? (
                            <>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-gray-800">Subir Estudio</h3>
                                    <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600">
                                        <X size={24} />
                                    </button>
                                </div>
                                <p className="text-gray-500 text-sm mb-6">Sube tus resultados en formato PDF o Imagen (JPG, PNG) para adjuntarlos a tu historia clínica.</p>

                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center mb-6 hover:bg-gray-50 transition cursor-pointer">
                                    <div className="bg-teal-50 p-4 rounded-full text-teal-600 mb-3">
                                        <Upload size={32} />
                                    </div>
                                    <p className="text-sm font-medium text-gray-700">Haz clic para seleccionar o arrastra aquí</p>
                                    <p className="text-xs text-gray-400 mt-1">Máx. 5MB</p>
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <button
                                        onClick={() => setShowUploadModal(false)}
                                        className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleUpload}
                                        disabled={isUploading}
                                        className="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition flex items-center"
                                    >
                                        {isUploading ? 'Subiendo...' : 'Confirmar Envío'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-6">
                                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                    <Check size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">¡Estudio Cargado!</h3>
                                <p className="text-gray-500">El médico recibirá una notificación.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* New Appointment Modal */}
            {showAppointmentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl m-4 animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Nuevo Turno</h3>
                            <button onClick={() => setShowAppointmentModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Especialidad</label>
                                <select className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 outline-none">
                                    <option>Cardiología</option>
                                    <option>Pediatría</option>
                                    <option>Medicina General</option>
                                    <option>Dermatología</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Profesional</label>
                                <div className="grid gap-3">
                                    {MOCK_DOCTORS.map(doc => (
                                        <div key={doc.id} className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-teal-500 cursor-pointer transition">
                                            <img src={doc.avatarUrl} className="w-10 h-10 rounded-full mr-3" alt="" />
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-800">{doc.name}</p>
                                                <p className="text-xs text-gray-500">{doc.specialty}</p>
                                            </div>
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Disponible</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => {
                                        alert('Turno agendado con éxito!');
                                        setShowAppointmentModal(false);
                                    }}
                                    className="w-full bg-teal-600 text-white font-bold py-3 rounded-lg hover:bg-teal-700 transition"
                                >
                                    Confirmar Turno
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Family Member Modal */}
            {showFamilyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl m-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-800">Agregar Familiar</h3>
                            <button onClick={() => setShowFamilyModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form className="space-y-4" onSubmit={(e) => {
                            e.preventDefault();
                            alert('Solicitud enviada para aprobación.');
                            setShowFamilyModal(false);
                        }}>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:border-teal-500" required placeholder="Ej: Maria Perez" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">DNI</label>
                                <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:border-teal-500" required placeholder="XX.XXX.XXX" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Parentesco</label>
                                    <select className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:border-teal-500">
                                        <option>Hijo/a</option>
                                        <option>Cónyuge</option>
                                        <option>Padre/Madre</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Nac.</label>
                                    <input type="date" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:border-teal-500" required />
                                </div>
                            </div>
                            <button type="submit" className="w-full bg-teal-600 text-white font-bold py-3 rounded-lg hover:bg-teal-700 transition mt-4">
                                Guardar Integrante
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PatientDashboard;