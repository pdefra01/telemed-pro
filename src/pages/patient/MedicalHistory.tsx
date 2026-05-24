import React, { useState, useEffect } from 'react';
import { 
    FileText, Pill, File, Download, Search, CheckCircle, 
    AlertCircle, Loader2, Calendar, User, ExternalLink, 
    FileArchive, ChevronRight, Hash, Clock, FlaskConical, Activity
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Patient, MedicalRecord, Prescription } from '../../types';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { prescriptionRepository } from '../../repositories/PrescriptionRepository';
import { medicalDocumentRepository } from '../../repositories/MedicalDocumentRepository';

interface Props {
    user: Patient;
}

const MedicalHistory: React.FC<Props> = ({ user }) => {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'records' | 'prescriptions' | 'documents'>('records');
    const [searchTerm, setSearchTerm] = useState('');
    
    const [records, setRecords] = useState<MedicalRecord[]>([]);
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [recs, prescs, docs] = await Promise.all([
                    medicalRecordRepository.getRecordsByPatientId(user.id),
                    prescriptionRepository.getPrescriptionsByPatientId(user.id),
                    medicalDocumentRepository.getDocumentsByPatientId(user.id)
                ]);
                setRecords(recs);
                setPrescriptions(prescs);
                setDocuments(docs);
            } catch (error) {
                console.error("Error cargando historia clínica:", error);
                toast('Error al cargar tu historia clínica', 'error');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user.id]);

    const handleDownload = (filename: string, content: string) => {
        toast(`Preparando descarga de ${filename}...`, 'info');
        setTimeout(() => {
            const element = document.createElement("a");
            const file = new Blob([content], { type: 'text/plain' });
            element.href = URL.createObjectURL(file);
            element.download = filename;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            toast('Descarga completada', 'success');
        }, 800);
    };

    const filteredRecords = records.filter(r => 
        r.diagnosis.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.doctorName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredPrescriptions = prescriptions.filter(p => 
        p.medications.some(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        p.doctorName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredDocuments = documents.filter(d => 
        d.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 sm:p-6 md:p-8 space-y-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 relative overflow-hidden shadow-3xl animate-in fade-in duration-700 pb-20">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="relative z-10 space-y-10">
                {/* Header Section */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
                                <FileArchive size={24} />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Expediente Médico</h1>
                        </div>
                        <p className="text-slate-400 font-medium max-w-xl text-base sm:text-lg leading-relaxed">
                            Tu historial de salud completo, protegido bajo estándares de seguridad médica internacional.
                        </p>
                    </div>
                    <div className="relative group w-full lg:w-[450px]">
                        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none transition-colors group-focus-within:text-emerald-500 text-slate-500">
                            <Search size={22} />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar diagnósticos, médicos o estudios..."
                            className="w-full pl-14 pr-6 py-3.5 sm:py-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all placeholder:text-slate-600 font-bold text-white text-base sm:text-lg"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

            {/* Navigation Tabs */}
            <div className="flex p-1.5 bg-white/5 backdrop-blur-xl rounded-2xl sm:rounded-[2.5rem] border border-white/10 max-w-2xl w-full">
                <button
                    onClick={() => setActiveTab('records')}
                    className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 rounded-xl sm:rounded-[2rem] text-[10px] sm:text-xs font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center justify-center space-x-2 sm:space-x-3 transition-all duration-500 ${
                        activeTab === 'records' 
                        ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 translate-y-[-2px]' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                >
                    <FileText size={16} className="flex-shrink-0" /> <span className="truncate">Consultas</span>
                </button>
                <button
                    onClick={() => setActiveTab('prescriptions')}
                    className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 rounded-xl sm:rounded-[2rem] text-[10px] sm:text-xs font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center justify-center space-x-2 sm:space-x-3 transition-all duration-500 ${
                        activeTab === 'prescriptions' 
                        ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 translate-y-[-2px]' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                >
                    <Pill size={16} className="flex-shrink-0" /> <span className="truncate">Recetas</span>
                </button>
                <button
                    onClick={() => setActiveTab('documents')}
                    className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 rounded-xl sm:rounded-[2rem] text-[10px] sm:text-xs font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center justify-center space-x-2 sm:space-x-3 transition-all duration-500 ${
                        activeTab === 'documents' 
                        ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 translate-y-[-2px]' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                >
                    <FileArchive size={16} className="flex-shrink-0" /> <span className="truncate">Estudios</span>
                </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[500px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-40 space-y-8">
                        <div className="relative">
                            <div className="w-24 h-24 border-4 border-white/5 rounded-full"></div>
                            <div className="w-24 h-24 border-4 border-t-emerald-500 rounded-full animate-spin absolute top-0 left-0 shadow-[0_0_15px_rgba(16,185,129,0.3)]"></div>
                        </div>
                        <div className="text-center">
                           <p className="text-emerald-500 font-bold tracking-[0.3em] uppercase text-sm animate-pulse">Sincronizando Expediente</p>
                           <p className="text-slate-500 text-xs mt-2 font-bold uppercase tracking-widest">Encriptación Militar Activa</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-8 animate-in slide-in-from-bottom-6 duration-700">
                        {activeTab === 'records' && (
                            <>
                                {filteredRecords.length > 0 ? (
                                    filteredRecords.map(record => (
                                        <div key={record.id} className="group bg-white/5 backdrop-blur-xl p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 shadow-2xl hover:bg-white/[0.08] transition-all duration-500 relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600/50"></div>
                                            
                                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 mb-8">
                                                <div className="flex items-start gap-4 sm:gap-5">
                                                    <div className="p-3.5 sm:p-4 bg-emerald-500/10 text-emerald-500 rounded-xl sm:rounded-2xl border border-emerald-500/20 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-500 flex-shrink-0">
                                                        <FileText size={24} className="sm:w-7 sm:h-7" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors tracking-tight truncate">{record.diagnosis}</h3>
                                                        <div className="flex items-center gap-3 mt-2">
                                                            <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase flex-shrink-0">
                                                                {record.doctorName?.charAt(0) || 'D'}
                                                            </div>
                                                            <p className="text-slate-400 font-bold text-sm truncate">{record.doctorName}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center bg-white/5 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 shadow-inner self-start md:self-auto flex-shrink-0">
                                                    <Calendar size={16} className="text-emerald-500 mr-2 sm:mr-3" />
                                                    <span className="text-slate-200 text-xs sm:text-sm font-bold uppercase tracking-widest">
                                                        {new Date(record.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="bg-black/20 p-5 sm:p-6 rounded-2xl sm:rounded-[1.5rem] border border-white/5 mb-8">
                                                <p className="text-slate-300 leading-relaxed text-sm font-medium">
                                                    {record.notes}
                                                </p>
                                            </div>

                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                                <div className="flex flex-wrap items-center gap-2.5">
                                                    <span className={`px-3 sm:px-4 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] border shadow-lg ${
                                                        record.type === 'consultation' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                                        record.type === 'checkup' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                    }`}>
                                                        {record.type === 'consultation' ? 'Consulta Médica' : record.type === 'checkup' ? 'Chequeo General' : 'Atención Urgente'}
                                                    </span>
                                                    {record.attachments && record.attachments.length > 0 && (
                                                        <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-2.5 sm:px-3 py-1.5 rounded-full border border-white/5">
                                                            <FileArchive size={12} className="text-emerald-500" /> {record.attachments.length} archivos
                                                        </div>
                                                    )}
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    className="text-emerald-500 hover:text-emerald-400 font-bold text-xs uppercase tracking-widest p-0 group/link self-end sm:self-auto"
                                                >
                                                    Reporte Completo <ChevronRight size={18} className="ml-1 group-hover/link:translate-x-1 transition-transform" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <EmptyState message="No hay consultas registradas." />
                                )}
                            </>
                        )}

                        {activeTab === 'prescriptions' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {filteredPrescriptions.length > 0 ? (
                                    filteredPrescriptions.map(presc => (
                                        <div key={presc.id} className={`group bg-white/5 backdrop-blur-xl rounded-[2rem] sm:rounded-[2.5rem] border shadow-2xl hover:bg-white/[0.08] transition-all duration-500 relative overflow-hidden flex flex-col ${
                                            presc.status === 'active' ? 'border-emerald-500/30 ring-1 ring-emerald-500/20' : 'border-white/5 opacity-60'
                                        }`}>
                                            {/* Watermark/Pattern */}
                                            <div className="absolute -right-12 -top-12 text-emerald-500/5 rotate-12 group-hover:rotate-0 transition-transform duration-1000 pointer-events-none">
                                                <Pill size={180} />
                                            </div>

                                            <div className="p-5 sm:p-8 flex-1 relative z-10">
                                                <div className="flex justify-between items-start mb-6 sm:mb-8 gap-4">
                                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                                        <div className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl flex-shrink-0 ${presc.status === 'active' ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                                                            <Pill size={20} className="sm:w-6 sm:h-6" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">Receta Oficial</h3>
                                                            <p className="text-[9px] sm:text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1 truncate">S/N: {presc.id.slice(0,12).toUpperCase()}</p>
                                                        </div>
                                                    </div>
                                                    {presc.status === 'active' ? (
                                                        <span className="bg-emerald-500/10 text-emerald-400 text-[9px] sm:text-[10px] font-bold px-3 sm:px-4 py-1.5 rounded-full flex items-center border border-emerald-500/20 uppercase tracking-widest flex-shrink-0 animate-pulse">
                                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 sm:mr-2 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                                                            Vigente
                                                        </span>
                                                    ) : (
                                                        <span className="bg-white/5 text-slate-500 text-[9px] sm:text-[10px] font-bold px-3 sm:px-4 py-1.5 rounded-full border border-white/10 uppercase tracking-widest flex-shrink-0">
                                                            Finalizada
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-4">
                                                    {presc.medications.map((m, idx) => (
                                                        <div key={idx} className="bg-black/20 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-white/5 relative group/med hover:bg-black/40 transition-colors">
                                                            <div className="flex justify-between items-center mb-2 gap-2">
                                                                <p className="font-bold text-white text-sm sm:text-base truncate">{m.name}</p>
                                                                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 flex-shrink-0">CANT: {m.quantity}</span>
                                                            </div>
                                                            <p className="text-slate-400 text-xs sm:text-sm font-medium leading-relaxed italic border-l-2 border-emerald-500/30 pl-3 mt-3">"{m.instructions}"</p>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-dashed border-white/10 grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Prescriptor</p>
                                                        <p className="text-xs sm:text-sm font-bold text-slate-200 truncate">{presc.doctorName}</p>
                                                    </div>
                                                    <div className="space-y-1 text-right">
                                                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Fecha Emisión</p>
                                                        <p className="text-xs sm:text-sm font-bold text-slate-200">{new Date(presc.date).toLocaleDateString('es-AR')}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-4 sm:p-6 bg-white/[0.02] border-t border-white/5 flex gap-3 sm:gap-4">
                                                <Button
                                                    onClick={() => {
                                                        const medsInfo = presc.medications.map(m => `- ${m.name}: ${m.instructions} (Cant: ${m.quantity})`).join('\n');
                                                        handleDownload(`Receta-${presc.id.slice(0,8)}.txt`, `RECETA DIGITAL MEDINEX\n\nMedicamentos:\n${medsInfo}\n\nMédico: ${presc.doctorName}\nFecha: ${presc.date}\nFirma: ${presc.digitalSignature}`);
                                                    }}
                                                    className="flex-1 bg-white/5 border-white/10 text-white hover:bg-emerald-600 hover:border-emerald-500 h-11 sm:h-12 rounded-xl sm:rounded-2xl transition-all font-bold text-[10px] sm:text-xs uppercase tracking-widest"
                                                    icon={<Download size={14} />}
                                                >
                                                    Descargar
                                                </Button>
                                                {presc.pdfUrl && (
                                                    <a 
                                                        href={presc.pdfUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="w-12 sm:w-14 flex items-center justify-center bg-emerald-600 text-white rounded-xl sm:rounded-2xl hover:bg-emerald-500 transition shadow-xl shadow-emerald-500/20 flex-shrink-0"
                                                    >
                                                        <ExternalLink size={18} className="sm:w-5 sm:h-5" />
                                                    </a>
                                                )}
                                            </div>
                                            
                                            {/* Signature bar */}
                                            <div className="bg-slate-900/80 py-2.5 px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-t border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle size={10} className="text-emerald-500 flex-shrink-0" />
                                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Validación Blockchain Digital</p>
                                                </div>
                                                <p className="text-[9px] sm:text-[10px] font-mono text-emerald-500 font-bold truncate max-w-full">{presc.digitalSignature}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full">
                                        <EmptyState message="No hay recetas registradas." />
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'documents' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                                {filteredDocuments.length > 0 ? (
                                    filteredDocuments.map(doc => (
                                        <div key={doc.id} className="group bg-white/5 backdrop-blur-xl p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 shadow-2xl hover:bg-white/[0.08] transition-all duration-500 flex flex-col relative overflow-hidden">
                                            <div className="absolute -right-6 -top-6 text-white/[0.02] group-hover:scale-125 transition-transform duration-1000 pointer-events-none">
                                                <FileText size={120} />
                                            </div>

                                            <div className="flex items-start justify-between mb-6 sm:mb-8 relative z-10 gap-4">
                                                <div className={`p-4 sm:p-5 rounded-xl sm:rounded-2xl transition-all duration-500 group-hover:scale-110 shadow-lg border flex-shrink-0 ${
                                                    doc.type.includes('lab') ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-blue-500/10' : 
                                                    doc.type.includes('imaging') ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-purple-500/10' : 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-amber-500/10'
                                                }`}>
                                                    {doc.type.includes('lab') ? <FlaskConical size={24} className="sm:w-8 sm:h-8" /> : doc.type.includes('imaging') ? <Activity size={24} className="sm:w-8 sm:h-8" /> : <FileText size={24} className="sm:w-8 sm:h-8" />}
                                                </div>
                                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                                    <span className={`text-[9px] sm:text-[10px] px-3 sm:px-4 py-1.5 rounded-full font-bold uppercase tracking-widest border shadow-sm ${
                                                        doc.uploadedBy === 'doctor' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                                    }`}>
                                                        {doc.uploadedBy === 'doctor' ? 'Profesional' : 'Paciente'}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <h4 className="font-bold text-white text-lg sm:text-xl leading-tight mb-4 flex-1 group-hover:text-emerald-400 transition-colors tracking-tight relative z-10 truncate">{doc.title}</h4>
                                            
                                            <div className="flex flex-wrap items-center text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] gap-x-4 sm:gap-x-6 gap-y-2 mb-6 sm:mb-8 pt-4 sm:pt-6 border-t border-white/5 relative z-10">
                                                <span className="flex items-center"><Calendar size={12} className="mr-1.5 sm:mr-2 text-emerald-500" /> {new Date(doc.date).toLocaleDateString()}</span>
                                                <span className="flex items-center"><Hash size={12} className="mr-1.5 sm:mr-2 text-emerald-500" /> {doc.type.split('_')[0]}</span>
                                            </div>

                                            <Button
                                                as="a"
                                                href={doc.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="w-full bg-white/5 border-white/10 text-white hover:bg-emerald-600 hover:border-emerald-500 h-12 sm:h-14 rounded-xl sm:rounded-2xl transition-all font-bold text-[10px] sm:text-xs uppercase tracking-[0.25em] relative z-10"
                                                icon={<Download size={16} />}
                                            >
                                                Descargar
                                            </Button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full">
                                        <EmptyState message="No hay documentos cargados." />
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </div>
            </div>
        </div>
    );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <div className="bg-white/5 backdrop-blur-xl p-10 md:p-20 text-center rounded-[2rem] sm:rounded-[2.5rem] border border-dashed border-white/10 flex flex-col items-center shadow-2xl relative overflow-hidden">
        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-6 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <AlertCircle size={40} />
        </div>
        <p className="text-white font-bold text-lg">{message}</p>
        <p className="text-slate-400 text-sm mt-2 max-w-xs mx-auto font-medium leading-relaxed">
            Cuando tengas una consulta o te asignen estudios, aparecerán automáticamente en esta sección.
        </p>
    </div>
);

export default MedicalHistory;