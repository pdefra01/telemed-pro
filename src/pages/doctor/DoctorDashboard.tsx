import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Doctor } from '../../types';
import { MOCK_APPOINTMENTS, MOCK_RECORDS } from '../../constants';
import { Video, Calendar, Clock, Star, AlertCircle, FileText, CheckCircle, TrendingUp, Users, Activity, AlertTriangle, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface Props {
    user: Doctor;
}

const DoctorDashboard: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

    // Filter appointments for this doctor
    const appointments = MOCK_APPOINTMENTS.filter(a => a.doctorId === user.id);
    const metrics = user.metrics;

    const patientRecords = selectedPatientId ? MOCK_RECORDS.filter(r => r.patientId === selectedPatientId) : [];

    return (
        <div className="space-y-8 relative">

            {/* Welcome & Status */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Panel Médico</h1>
                    <p className="text-gray-500 mt-1">Bienvenido, Dr. {user.name.split(' ')[1] || user.name}</p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-sm font-medium text-green-600">Disponible para consultas</span>
                </div>
            </div>

            {/* PRD 3.13 - Metrics Dashboard */}
            {metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Star Rating */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition">
                            <Star size={60} />
                        </div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Calificación Pacientes</p>
                        <div className="flex items-end space-x-2">
                            <h3 className="text-3xl font-bold text-gray-800">{metrics.starRating}</h3>
                            <div className="mb-1 flex text-yellow-400">
                                <Star fill="currentColor" size={16} />
                                <Star fill="currentColor" size={16} />
                                <Star fill="currentColor" size={16} />
                                <Star fill="currentColor" size={16} />
                                <Star fill={metrics.starRating > 4.5 ? "currentColor" : "none"} size={16} />
                            </div>
                        </div>
                        {metrics.qualityAlert && (
                            <div className="mt-2 text-xs font-bold text-red-500 flex items-center bg-red-50 p-1 rounded w-fit">
                                <AlertTriangle size={12} className="mr-1" /> Revisar Calidad
                            </div>
                        )}
                    </div>

                    {/* Ranking Score */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition">
                            <TrendingUp size={60} />
                        </div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Ranking Interno</p>
                        <div className="flex items-end space-x-2">
                            <h3 className="text-3xl font-bold text-gray-800">{metrics.rankingScore}</h3>
                            <span className="text-sm text-green-500 font-medium mb-1">/ 100</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${metrics.rankingScore}%` }}></div>
                        </div>
                    </div>

                    {/* Show Rate */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition">
                            <Users size={60} />
                        </div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Tasa de Asistencia</p>
                        <h3 className="text-3xl font-bold text-gray-800">{metrics.showRate}%</h3>
                        <p className="text-xs text-gray-400 mt-1">Show Rate mensual</p>
                    </div>

                    {/* Avg Time */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition">
                            <Clock size={60} />
                        </div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Tiempo Promedio</p>
                        <h3 className="text-3xl font-bold text-gray-800">{metrics.avgConsultationTime}</h3>
                        <p className="text-xs text-gray-400 mt-1">Por consulta</p>
                    </div>
                </div>
            )}

            {/* Main Workspace */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
                <div className="flex border-b border-gray-100">
                    <button
                        type="button"
                        onClick={() => setActiveTab('queue')}
                        className={`px-6 py-4 font-medium text-sm transition relative ${activeTab === 'queue' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Sala de Espera
                        {activeTab === 'queue' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600"></div>}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        className={`px-6 py-4 font-medium text-sm transition relative ${activeTab === 'history' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Historial de Atención
                        {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600"></div>}
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'queue' ? (
                        <div className="space-y-4">
                            {appointments.filter(a => a.status !== 'cancelled').map(apt => (
                                <div key={apt.id} className="flex flex-col md:flex-row items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-teal-200 transition group">
                                    <div className="flex items-center space-x-4 mb-4 md:mb-0 w-full md:w-auto">
                                        <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center font-bold text-lg">
                                            {apt.patientName.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-800">{apt.patientName}</h4>
                                            <div className="flex items-center text-sm text-gray-500 space-x-3">
                                                <span className="flex items-center"><Clock size={14} className="mr-1" /> {apt.time}</span>
                                                <span className="flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase">Video</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                                        <Button
                                            variant="outline"
                                            onClick={() => setSelectedPatientId(apt.patientId)}
                                            className="w-full sm:w-auto text-sm"
                                            icon={<FileText size={16} />}
                                        >
                                            Ver Historia
                                        </Button>
                                        <Link
                                            to={`/room/${apt.id}`}
                                            className="w-full sm:w-auto px-6 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition flex items-center justify-center shadow-lg shadow-teal-500/20 transform group-hover:scale-105 duration-200"
                                        >
                                            <Video size={16} className="mr-2" /> Atender
                                        </Link>
                                    </div>
                                </div>
                            ))}
                            {appointments.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                    <div className="bg-gray-100 p-4 rounded-full mb-3">
                                        <Users size={32} />
                                    </div>
                                    <p>No hay pacientes en sala de espera.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-10 text-gray-500">
                            <Activity className="mx-auto mb-2 text-gray-300" size={40} />
                            <p>Funcionalidad de historial completo en desarrollo.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Patient History Modal */}
            {selectedPatientId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in-up">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Historia Clínica del Paciente</h3>
                            <button onClick={() => setSelectedPatientId(null)} className="text-gray-500 hover:text-gray-700">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-4">
                            {patientRecords.length > 0 ? (
                                patientRecords.map(record => (
                                    <div key={record.id} className="border border-gray-200 rounded-xl p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-gray-800">{record.diagnosis}</h4>
                                            <span className="text-xs bg-gray-100 px-2 py-1 rounded">{record.date}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mb-2">{record.notes}</p>
                                        <p className="text-xs text-teal-600 font-medium">{record.doctorName}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-500 py-8">No se encontraron registros previos.</p>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setSelectedPatientId(null)}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DoctorDashboard;