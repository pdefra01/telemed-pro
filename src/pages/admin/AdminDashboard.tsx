import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MOCK_DOCTORS } from '../../constants';
import { TrendingUp, Users, DollarSign, AlertTriangle } from 'lucide-react';

const data = [
    { name: 'Lun', consultations: 40 },
    { name: 'Mar', consultations: 30 },
    { name: 'Mie', consultations: 55 },
    { name: 'Jue', consultations: 45 },
    { name: 'Vie', consultations: 60 },
    { name: 'Sab', consultations: 25 },
    { name: 'Dom', consultations: 10 },
];

const pieData = [
    { name: 'Clínica', value: 400 },
    { name: 'Pediatría', value: 300 },
    { name: 'Cardiología', value: 300 },
    { name: 'Dermatología', value: 200 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

// Reusable Stat Card Component
const StatCard: React.FC<{
    icon: React.ReactNode;
    colorClass: string;
    label: string;
    value: string;
}> = ({ icon, colorClass, label, value }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 hover:shadow-md transition">
        <div className={`p-3 rounded-full ${colorClass}`}>
            {icon}
        </div>
        <div>
            <p className="text-gray-500 text-xs font-medium uppercase">{label}</p>
            <h4 className="text-2xl font-bold text-gray-800">{value}</h4>
        </div>
    </div>
);

const AdminDashboard: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Panel de Administración</h1>
                <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-lg text-sm font-medium">
                    Sistema Operativo · v2.4.0
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    icon={<Users size={24} />}
                    colorClass="bg-blue-100 text-blue-600"
                    label="Afiliados Activos"
                    value="1,240"
                />
                <StatCard
                    icon={<TrendingUp size={24} />}
                    colorClass="bg-teal-100 text-teal-600"
                    label="Consultas (Mes)"
                    value="856"
                />
                <StatCard
                    icon={<DollarSign size={24} />}
                    colorClass="bg-green-100 text-green-600"
                    label="Facturación"
                    value="$4.2M"
                />
                <StatCard
                    icon={<AlertTriangle size={24} />}
                    colorClass="bg-red-100 text-red-600"
                    label="Alertas Calidad"
                    value="3"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Activity Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6">Consultas Semanales</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="consultations" fill="#0d9488" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Doctor Rankings */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <h3 className="font-bold text-gray-800 mb-4">Ranking de Desempeño Médico</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b border-gray-100 text-left">
                                    <th className="pb-3 text-xs font-medium text-gray-400 uppercase">Médico</th>
                                    <th className="pb-3 text-xs font-medium text-gray-400 uppercase">Especialidad</th>
                                    <th className="pb-3 text-xs font-medium text-gray-400 uppercase text-right">Rating</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {MOCK_DOCTORS.map((doc) => (
                                    <tr key={doc.id}>
                                        <td className="py-3 flex items-center space-x-3">
                                            <img src={doc.avatarUrl} className="w-8 h-8 rounded-full" alt="" />
                                            <span className="font-medium text-gray-700 text-sm">{doc.name}</span>
                                        </td>
                                        <td className="py-3 text-sm text-gray-500">{doc.specialty}</td>
                                        <td className="py-3 text-right">
                                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${doc.rating >= 4.5 ? 'bg-green-100 text-green-700' : doc.rating < 4 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {doc.rating} ★
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
