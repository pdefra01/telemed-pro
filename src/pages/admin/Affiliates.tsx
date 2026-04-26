import React from 'react';
import { MOCK_PATIENT } from '../../constants';
import { User, Search, Eye, MoreHorizontal, Ban, Edit } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const Affiliates: React.FC = () => {
    const { toast } = useToast();

    // Simulating a list of patients by duplicating the mock patient
    const patients = [
        { ...MOCK_PATIENT, id: 'p1', name: 'Juan Pérez', planStatus: 'active' },
        { ...MOCK_PATIENT, id: 'p2', name: 'Ana García', email: 'ana.garcia@email.com', planStatus: 'active', avatarUrl: 'https://ui-avatars.com/api/?name=Ana+Garcia' },
        { ...MOCK_PATIENT, id: 'p3', name: 'Carlos López', email: 'carlos.lopez@email.com', planStatus: 'suspended', avatarUrl: 'https://ui-avatars.com/api/?name=Carlos+Lopez' },
        { ...MOCK_PATIENT, id: 'p4', name: 'María Rodríguez', email: 'maria.rod@email.com', planStatus: 'pending', avatarUrl: 'https://ui-avatars.com/api/?name=Maria+Rodriguez' },
    ];

    const handleAction = (action: string, name: string) => {
        toast(`${action}: ${name}`, "info");
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Padrón de Afiliados</h1>

                <div className="relative">
                    <input
                        type="text"
                        placeholder="DNI, Nombre o Credencial..."
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 w-full md:w-80 outline-none"
                    />
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Afiliado
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    DNI
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Plan
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Estado
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Grupo Familiar
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {patients.map((patient) => (
                                <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <img className="h-10 w-10 rounded-full object-cover" src={patient.avatarUrl} alt="" />
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                                                <div className="text-sm text-gray-500">{patient.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {patient.dni}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-700">{patient.planName}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${patient.planStatus === 'active' ? 'bg-green-100 text-green-800' :
                                                patient.planStatus === 'suspended' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {patient.planStatus === 'active' ? 'Al día' :
                                                patient.planStatus === 'suspended' ? 'Suspendido' : 'Pendiente'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex items-center">
                                            <User size={16} className="mr-2 text-gray-400" />
                                            {patient.familyMembers?.length || 0} integrantes
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                onClick={() => handleAction('Ver detalles', patient.name)}
                                                className="text-gray-400 hover:text-teal-600 transition-colors p-1"
                                                title="Ver detalle"
                                            >
                                                <Eye size={20} />
                                            </button>
                                            <button
                                                onClick={() => handleAction('Opciones', patient.name)}
                                                className="text-gray-400 hover:text-gray-600 ml-2 transition-colors p-1"
                                                title="Más opciones"
                                            >
                                                <MoreHorizontal size={20} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Affiliates;
