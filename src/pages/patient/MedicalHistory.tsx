import React, { useState } from 'react';
import { MOCK_RECORDS, MOCK_PRESCRIPTIONS, MOCK_DOCUMENTS } from '../../constants';
import { FileText, Pill, File, Download, Search, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';

const MedicalHistory: React.FC = () => {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'records' | 'prescriptions' | 'documents'>('records');
    const [searchTerm, setSearchTerm] = useState('');

    const handleDownload = (filename: string, content: string) => {
        toast(`Descargando ${filename}...`, 'info');
        setTimeout(() => {
            const element = document.createElement("a");
            const file = new Blob([content], { type: 'text/plain' });
            element.href = URL.createObjectURL(file);
            element.download = filename;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            toast('Descarga completada', 'success');
        }, 1000);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Historia Clínica Digital</h1>
                    <p className="text-gray-500">Accede a tus diagnósticos, recetas y estudios de forma segura.</p>
                </div>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none w-full md:w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-wrap">
                <button
                    onClick={() => setActiveTab('records')}
                    className={`flex-1 py-4 px-6 text-sm font-bold flex items-center justify-center space-x-2 transition ${activeTab === 'records' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <FileText size={18} /> <span>Consultas y Diagnósticos</span>
                </button>
                <button
                    onClick={() => setActiveTab('prescriptions')}
                    className={`flex-1 py-4 px-6 text-sm font-bold flex items-center justify-center space-x-2 transition ${activeTab === 'prescriptions' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <Pill size={18} /> <span>Recetas Electrónicas</span>
                </button>
                <button
                    onClick={() => setActiveTab('documents')}
                    className={`flex-1 py-4 px-6 text-sm font-bold flex items-center justify-center space-x-2 transition ${activeTab === 'documents' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <File size={18} /> <span>Estudios Adjuntos</span>
                </button>
            </div>

            {/* Content */}
            <div className="min-h-[400px]">
                {activeTab === 'records' && (
                    <div className="space-y-4">
                        {MOCK_RECORDS.filter(r => r.diagnosis.toLowerCase().includes(searchTerm.toLowerCase())).map(record => (
                            <div key={record.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800">{record.diagnosis}</h3>
                                        <p className="text-teal-600 text-sm font-medium">{record.doctorName}</p>
                                    </div>
                                    <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">{record.date}</span>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg text-gray-700 text-sm mt-3 border border-gray-100">
                                    {record.notes}
                                </div>
                                <div className="mt-4 flex space-x-2">
                                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{record.type === 'consultation' ? 'Consulta Ambulatoria' : 'Control'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'prescriptions' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {MOCK_PRESCRIPTIONS.filter(p => p.medication.toLowerCase().includes(searchTerm.toLowerCase())).map(presc => (
                            <div key={presc.id} className={`bg-white p-5 rounded-xl border border-l-4 shadow-sm relative overflow-hidden ${presc.status === 'active' ? 'border-l-green-500 border-gray-200' : 'border-l-gray-300 border-gray-200 opacity-75'}`}>
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-gray-800 text-lg">{presc.medication}</h3>
                                    {presc.status === 'active' ? (
                                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded flex items-center"><CheckCircle size={12} className="mr-1" /> Activa</span>
                                    ) : (
                                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">Archivada</span>
                                    )}
                                </div>

                                <p className="text-gray-600 text-sm mt-2">{presc.instructions}</p>

                                <div className="mt-4 pt-4 border-t border-dashed border-gray-200 text-xs text-gray-500 flex justify-between items-center">
                                    <div>
                                        <p>Emitida: {presc.date}</p>
                                        <p>Dr: {presc.doctorName}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono text-[10px] text-gray-400">Firma Digital</p>
                                        <p className="font-mono text-teal-600">{presc.digitalSignature}</p>
                                    </div>
                                </div>

                                {presc.status === 'active' && (
                                    <Button
                                        onClick={() => handleDownload(`Receta-${presc.medication}.txt`, `RECETA DIGITAL\n\nMedicamento: ${presc.medication}\nInstrucciones: ${presc.instructions}\nMédico: ${presc.doctorName}\nFirma: ${presc.digitalSignature}`)}
                                        className="w-full mt-4 bg-teal-50 text-teal-700 hover:bg-teal-100 text-sm justification-center"
                                        icon={<Download size={16} />}
                                    >
                                        Descargar Receta
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'documents' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Documento</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Subido Por</th>
                                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {MOCK_DOCUMENTS.map(doc => (
                                    <tr key={doc.id} className="hover:bg-gray-50 transition">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="p-2 bg-blue-50 text-blue-600 rounded">
                                                    <FileText size={18} />
                                                </div>
                                                <span className="font-medium text-gray-800">{doc.title}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-500">{doc.date}</td>
                                        <td className="py-3 px-4">
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${doc.uploadedBy === 'doctor' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {doc.uploadedBy === 'doctor' ? 'Médico' : 'Paciente'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleDownload(`${doc.title}.txt`, `DOCUMENTO MÉDICO\n\nTitulo: ${doc.title}\nFecha: ${doc.date}\nEste es un documento simulado.`)}
                                                className="text-teal-600 hover:text-teal-800 p-1"
                                            >
                                                <Download size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {MOCK_DOCUMENTS.length === 0 && (
                            <div className="p-8 text-center text-gray-500">No hay documentos cargados.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MedicalHistory;