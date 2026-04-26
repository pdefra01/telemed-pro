import React, { useState } from 'react';
import { MOCK_DOCTORS } from '../../constants';
import { Star, Clock, CheckCircle, AlertCircle, Plus, Edit2, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';

const Doctors: React.FC = () => {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', specialty: '' });

    const handleNewDoctor = () => {
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate API
        setTimeout(() => {
            setIsLoading(false);
            setShowModal(false);
            toast(`Dr. ${formData.name} agregado exitosamente`, "success");
            setFormData({ name: '', email: '', specialty: '' });
        }, 1000);
    };

    const handleEdit = (name: string) => {
        toast(`Editando perfil de ${name}`, "info");
    };

    const handleDeactivate = (name: string) => {
        toast(`Se ha desactivado al Dr. ${name} (Simulado)`, "success");
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Gestión de Médicos</h1>
                <div className="w-auto">
                    <Button
                        onClick={handleNewDoctor}
                        icon={<Plus size={20} />}
                    >
                        Nuevo Médico
                    </Button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Médico
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Especialidad
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Rating
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Estado
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Disponibilidad
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {MOCK_DOCTORS.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <img className="h-10 w-10 rounded-full object-cover" src={doc.avatarUrl} alt="" />
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{doc.name}</div>
                                                <div className="text-sm text-gray-500">{doc.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                            {doc.specialty}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center text-sm text-gray-600">
                                            <Star className="text-yellow-400 w-4 h-4 mr-1" fill="currentColor" />
                                            <span className="font-bold">{doc.rating}</span>
                                            <span className="text-gray-400 ml-1">({doc.reviewCount})</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {doc.metrics?.qualityAlert ? (
                                            <span className="px-2 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                <AlertCircle size={14} className="mr-1" /> Revisión Req.
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                <CheckCircle size={14} className="mr-1" /> Activo
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex items-center">
                                            <Clock size={16} className="mr-2 text-gray-400" />
                                            {doc.availability.length} horarios
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                onClick={() => handleEdit(doc.name)}
                                                className="text-teal-600 hover:text-teal-900 p-1 hover:bg-teal-50 rounded"
                                                title="Editar"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeactivate(doc.name)}
                                                className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"
                                                title="Desactivar"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Nuevo Médico */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl m-4 animate-fade-in-up">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Registrar Nuevo Médico</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:border-teal-500"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Profesional</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:border-teal-500"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Especialidad</label>
                                <select
                                    className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:border-teal-500"
                                    value={formData.specialty}
                                    onChange={e => setFormData({ ...formData, specialty: e.target.value })}
                                >
                                    <option value="">Seleccionar...</option>
                                    <option value="Cardiología">Cardiología</option>
                                    <option value="Pediatría">Pediatría</option>
                                    <option value="Clínica Médica">Clínica Médica</option>
                                    <option value="Dermatología">Dermatología</option>
                                </select>
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                                >
                                    Cancelar
                                </button>
                                <Button
                                    type="submit"
                                    isLoading={isLoading}
                                    className="w-auto"
                                >
                                    Guardar Médico
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Doctors;
