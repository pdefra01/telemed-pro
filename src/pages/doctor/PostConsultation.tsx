import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Stethoscope, 
  Pill, 
  FileText, 
  Save, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Lightbulb,
  History,
  FolderOpen,
  FileText as FileIcon,
  File as FileGeneric,
  Image as ImageIcon,
  FlaskConical,
  Download,
  ExternalLink,
  ChevronLeft,
  Search,
  Plus,
  Trash2,
  MessageSquare
} from 'lucide-react';
import { Doctor, Appointment, MedicalRecord, MedicalDocument } from '../../types';
import { appointmentRepository } from '../../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { medicalDocumentRepository } from '../../repositories/MedicalDocumentRepository';
import { pharmacyRepository } from '../../repositories/PharmacyRepository';
import { supabase } from '../../services/supabase';
import { Button } from '../../components/ui/Button';
import '../../styles/animations.css';
import {
  generateKeyPair,
  exportPublicKey,
  encryptPrivateKey,
  decryptPrivateKey,
  signPrescription
} from '../../utils/crypto';

const COMMON_MEDS = [
  "Amoxicilina 500mg",
  "Ibuprofeno 400mg",
  "Paracetamol 1g",
  "Enalapril 10mg",
  "Metformina 850mg",
  "Atorvastatina 20mg",
  "Losartán 50mg",
  "Levotiroxina 100mcg",
  "Omeprazol 20mg",
  "Clonazepam 0.5mg",
  "Azitromicina 500mg",
  "Ciprofloxacina 500mg",
  "Diclofenac 75mg",
  "Lorazepam 1mg",
  "Sertralina 50mg"
];

interface MedicationItem {
  name: string;
  instructions: string;
  productId?: string;
  stockAvailable?: number;
}

interface MedicationCardProps {
  med: MedicationItem;
  index: number;
  onChange: (index: number, field: 'name' | 'instructions' | 'productId' | 'stockAvailable', value: any) => void;
  onRemove: (index: number) => void;
  showRemove: boolean;
}

const MedicationCard: React.FC<MedicationCardProps> = ({ 
  med, 
  index, 
  onChange, 
  onRemove, 
  showRemove 
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [catalogSuggestions, setCatalogSuggestions] = useState<Array<{ id: string; name: string; activeIngredient: string; presentation: string; totalStock: number }>>([]);

  useEffect(() => {
    if (!med.name.trim()) {
      setCatalogSuggestions([]);
      return;
    }
    const searchCatalog = async () => {
      try {
        const results = await pharmacyRepository.searchProductsWithStock(med.name);
        setCatalogSuggestions(results.map(r => ({
          id: r.id,
          name: `${r.name} (${r.presentation})`,
          activeIngredient: r.activeIngredient,
          presentation: r.presentation,
          totalStock: r.totalStock
        })));
      } catch (e) {
        console.warn(e);
      }
    };
    const timer = setTimeout(searchCatalog, 300);
    return () => clearTimeout(timer);
  }, [med.name]);

  return (
    <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-900/40 border border-white/5 rounded-2xl group/med animate-fade-in-up hover:border-blue-500/30 transition-all duration-300">
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Medicamento #{index + 1}</label>
        <div className="relative">
          <input
            type="text"
            value={med.name}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            onChange={(e) => onChange(index, 'name', e.target.value)}
            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all pl-12 text-sm"
            placeholder="Ej. Amoxicilina 500mg"
          />
          <Pill className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
          
          {showSuggestions && catalogSuggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 divide-y divide-white/5">
              {catalogSuggestions.map((item) => (
                <button
                  key={item.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(index, 'name', item.name);
                    onChange(index, 'productId', item.id);
                    onChange(index, 'stockAvailable', item.totalStock);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-600/30 transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-blue-300">{item.name}</p>
                    <p className="text-[10px] text-slate-400">{item.activeIngredient}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                    item.totalStock > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {item.totalStock > 0 ? `Stock: ${item.totalStock} un.` : 'Sin Stock'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {med.stockAvailable !== undefined && (
          <div className="pt-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block border ${
              med.stockAvailable > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {med.stockAvailable > 0 ? `✓ Stock verificado en farmacia: ${med.stockAvailable} unidades` : '⚠️ Producto sin stock en farmacia'}
            </span>
          </div>
        )}
      </div>
      
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Posología / Instrucciones</label>
        <div className="relative">
          <input
            type="text"
            value={med.instructions}
            onChange={(e) => onChange(index, 'instructions', e.target.value)}
            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all pl-12 text-sm"
            placeholder="Cada 8hs por 7 días..."
          />
          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
        </div>
      </div>

      {showRemove && (
        <button 
          onClick={() => onRemove(index)}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover/med:opacity-100 shadow-xl"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
};

interface PostConsultationProps {
  user: Doctor;
}

const PostConsultation: React.FC<PostConsultationProps> = ({ user }) => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  
  const [notes, setNotes] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closureStatus, setClosureStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [appointmentData, setAppointmentData] = useState<any>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [addPrescription, setAddPrescription] = useState(false);
  const [medications, setMedications] = useState<{ name: string; instructions: string }[]>([]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // PIN & Cryptographic Signatures State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isCryptedSigning, setIsCryptedSigning] = useState(false);
  const [hasDigitalSignature, setHasDigitalSignature] = useState(false);
  const [digitalSigValue, setDigitalSigValue] = useState('');
  const [sigPublicKeyVal, setSigPublicKeyVal] = useState('');
  
  const pinInputsRef = React.useRef<(HTMLInputElement | null)[]>([]);

  const handlePinChange = (index: number, value: string) => {
    const numValue = value.replace(/\D/g, '');
    const char = numValue[numValue.length - 1] || '';

    const pinArray = pin.split('');
    while (pinArray.length < 6) pinArray.push('');
    pinArray[index] = char;
    
    const newPin = pinArray.slice(0, 6).join('');
    setPin(newPin);

    // Mover al siguiente input si hay un carácter tipeado
    if (char && index < 5) {
      pinInputsRef.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const pinArray = pin.split('');
      while (pinArray.length < 6) pinArray.push('');
      
      if (!pinArray[index] && index > 0) {
        // Borrar el anterior y enfocarlo
        pinArray[index - 1] = '';
        setPin(pinArray.slice(0, 6).join(''));
        pinInputsRef.current[index - 1]?.focus();
      } else {
        // Borrar el actual
        pinArray[index] = '';
        setPin(pinArray.slice(0, 6).join(''));
      }
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setPin(pasteData);
    
    // Enfocar el último input correspondiente al largo del pegado
    const nextFocusIndex = Math.min(pasteData.length, 5);
    pinInputsRef.current[nextFocusIndex]?.focus();
  };

  useEffect(() => {
    if (showPinModal) {
      setTimeout(() => {
        pinInputsRef.current[0]?.focus();
      }, 150);
    }
  }, [showPinModal]);
  
  // Local cache of user's key status so it updates immediately in UI
  const [localUserPublicKey, setLocalUserPublicKey] = useState<string | undefined>(user.digitalPublicKey);
  const [localUserEncryptedPrivateKey, setLocalUserEncryptedPrivateKey] = useState<string | undefined>(user.encryptedPrivateKey);

  // History Sidebar State
  const [patientRecords, setPatientRecords] = useState<MedicalRecord[]>([]);
  const [patientDocuments, setPatientDocuments] = useState<MedicalDocument[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<'records' | 'documents'>('records');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const CompletionOverlay = () => {
    if (closureStatus === 'idle') return null;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div className="max-w-md w-full p-10 text-center space-y-8">
          {closureStatus === 'processing' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                <div className="absolute inset-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-blue-400 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white tracking-tight">Finalizando Consulta</h3>
                <p className="text-slate-400 text-sm">Generando receta electrónica y actualizando historia clínica...</p>
              </div>
              <div className="flex justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"></div>
              </div>
            </div>
          )}

          {closureStatus === 'success' && (
            <div className="space-y-8 animate-fade-in-up">
              <div className="relative w-28 h-28 mx-auto">
                <div className="absolute inset-0 rounded-full bg-teal-500/20 animate-ping"></div>
                <div className="absolute inset-0 rounded-full bg-teal-500/10 border border-teal-500/50 flex items-center justify-center">
                  <CheckCircle2 className="w-14 h-14 text-teal-400 animate-scale-in" />
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-3xl font-bold text-white tracking-tighter uppercase">¡Consulta Finalizada!</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  La consulta médica ha sido cerrada de forma segura y se generaron los documentos clínicos.
                </p>
              </div>

              {pdfUrl && (
                <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 text-left space-y-4 max-w-sm mx-auto shadow-2xl animate-fade-in">
                  <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                    <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center border border-red-500/20">
                      <FileIcon size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        Receta_Digital_{appointmentData?.patientName?.replace(/\s+/g, '_') || 'Paciente'}.pdf
                      </p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Cifrado E2E Activo</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {/* Botón Descargar PDF */}
                    <button 
                      onClick={() => window.open(pdfUrl, '_blank')}
                      className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-2xl transition-all shadow-lg shadow-teal-500/10 flex items-center justify-center gap-2 text-xs uppercase tracking-widest cursor-pointer active:scale-95 border-none"
                    >
                      <Download size={16} />
                      Descargar Receta PDF
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Botón WhatsApp */}
                      <a 
                        href={`https://wa.me/?text=Hola%20${encodeURIComponent(appointmentData?.patientName || '')}!%20Te%20comparto%20la%20receta%20m%C3%A9dica%20generada%20durante%20nuestra%20consulta%20en%20MEDINEX:%20${encodeURIComponent(pdfUrl)}`}
                        target="_blank" 
                        rel="noreferrer"
                        className="py-3 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 rounded-2xl transition-all flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer active:scale-95"
                      >
                        <MessageSquare size={14} />
                        WhatsApp
                      </a>

                      {/* Botón Email */}
                      <a 
                        href={`mailto:?subject=Receta%20M%C3%A9dica%20-%20MEDINEX&body=Hola%20${encodeURIComponent(appointmentData?.patientName || '')},%20te%20comparto%20la%20receta%20m%C3%A9dica%20y%20evoluci%C3%B3n%20generada%20durante%20tu%20consulta:%20${encodeURIComponent(pdfUrl)}`}
                        className="py-3 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white border border-blue-500/20 rounded-2xl transition-all flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer active:scale-95"
                      >
                        <FileIcon size={14} />
                        Email
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4">
                <button 
                  onClick={() => navigate('/doctor')}
                  className="px-10 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all text-xs uppercase tracking-widest cursor-pointer active:scale-95 border border-white/5"
                >
                  Volver al Panel
                </button>
              </div>
            </div>
          )}

          {closureStatus === 'error' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="w-24 h-24 mx-auto rounded-full bg-red-500/10 border border-red-500/50 flex items-center justify-center">
                <AlertCircle className="w-12 h-12 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">Error en el Cierre</h3>
                <p className="text-slate-400 text-sm">{error || 'No pudimos procesar la solicitud. Reintente en unos instantes.'}</p>
              </div>
              <button 
                onClick={() => setClosureStatus('idle')}
                className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    const fetchAppointmentData = async () => {
      if (!appointmentId) return;
      try {
        const appointment = await appointmentRepository.getAppointmentById(appointmentId);
        setAppointmentData(appointment as any);
        if (appointment && (appointment as any).notes) {
          setNotes((appointment as any).notes);
        }

        // Fetch History if patientId is present
        if (appointment?.patientId) {
          setIsFetchingHistory(true);
          try {
            const [records, docs] = await Promise.all([
              medicalRecordRepository.getRecordsByPatientId(appointment.patientId),
              medicalDocumentRepository.getDocumentsByPatientId(appointment.patientId)
            ]);
            setPatientRecords(records);
            setPatientDocuments(docs);
          } catch (historyErr) {
            console.error("Error loading history in PostConsultation:", historyErr);
          } finally {
            setIsFetchingHistory(false);
          }
        }
      } catch (error) {
        console.error("Error loading appointment notes:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAppointmentData();
  }, [appointmentId]);

  const handleAiSuggestDiagnosis = async () => {
    if (!notes.trim()) return;
    setIsAnalyzing(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke('ai-medical-assistant', {
        body: { action: 'suggest_diagnosis', notes }
      });
      if (error) throw error;
      const rawResult = data?.result;
      const result = typeof rawResult === 'string'
        ? rawResult.split('\n').filter((s: string) => s.trim())
        : (Array.isArray(rawResult) ? rawResult : []);
      setSuggestions(result);
    } catch (err) {
      console.error("AI Error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddMedication = () => {
    setMedications([...medications, { name: '', instructions: '' }]);
  };

  const handleRemoveMedication = (index: number) => {
    if (medications.length <= 1) return;
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleMedicationChange = (index: number, field: 'name' | 'instructions' | 'productId' | 'stockAvailable', value: any) => {
    const newMedications = [...medications];
    (newMedications[index] as any)[field] = value;
    setMedications(newMedications);
  };

  const submitFinalization = async (sig?: string, pubKey?: string) => {
    setSaving(true);
    setClosureStatus('processing');
    setError(null);
    
    try {
      // Descontar stock de medicamentos seleccionados del catálogo
      if (addPrescription && medications.length > 0) {
        for (const med of medications) {
          if (med.productId) {
            await pharmacyRepository.deductStock(med.productId, 1);
          }
        }
      }

      const { data, error: functionError } = await supabase.functions.invoke('finalize-consultation', {
        body: {
          appointmentId: appointmentData.id,
          diagnosis,
          notes,
          medications: addPrescription ? medications : [],
          digitalSignature: sig || null,
          signaturePublicKey: pubKey || null
        }
      });

      if (functionError) throw functionError;

      // Artificial delay for premium feel of the steps
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (data?.pdfUrl) {
        setPdfUrl(data.pdfUrl);
        console.log("PDF Generated:", data.pdfUrl);
      }
      
      setClosureStatus('success');

    } catch (err: any) {
      console.error('Error saving consultation data:', err);
      setError('Ocurrió un error al procesar la consulta: ' + (err.message || 'Verifique su conexión.'));
      setSaving(false);
      setClosureStatus('error');
    }
  };

  const handleVerifyPinAndSign = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPinError(null);

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setPinError('El PIN debe tener exactamente 6 dígitos numéricos.');
      return;
    }

    setIsCryptedSigning(true);
    try {
      let finalSignature = '';
      let finalPublicKey = '';

      if (!localUserPublicKey || !localUserEncryptedPrivateKey) {
        // Primera vez: Generar par de claves y cifrar con el PIN
        const keyPair = await generateKeyPair();
        const exportedPub = await exportPublicKey(keyPair.publicKey);
        const encryptedPriv = await encryptPrivateKey(keyPair.privateKey, pin, user.id);

        // Guardar en Supabase profiles
        const { error: updateProfileError } = await supabase
          .from('profiles')
          .update({
            digital_public_key: exportedPub,
            encrypted_private_key: encryptedPriv
          })
          .eq('id', user.id);

        if (updateProfileError) {
          throw new Error('Error al inicializar tus claves digitales de firma: ' + updateProfileError.message);
        }

        // Actualizar caché local de claves
        setLocalUserPublicKey(exportedPub);
        setLocalUserEncryptedPrivateKey(encryptedPriv);

        finalPublicKey = exportedPub;
        
        // Firmar
        finalSignature = await signPrescription(
          appointmentData.id,
          appointmentData.patientId,
          medications,
          notes,
          keyPair.privateKey
        );
      } else {
        // Médico recurrente: Descifrar clave privada usando el PIN
        let privKey;
        try {
          privKey = await decryptPrivateKey(localUserEncryptedPrivateKey, pin);
        } catch (decryptionErr) {
          throw new Error('PIN incorrecto. No se pudo descifrar la clave de firma.');
        }

        finalPublicKey = localUserPublicKey;

        // Firmar
        finalSignature = await signPrescription(
          appointmentData.id,
          appointmentData.patientId,
          medications,
          notes,
          privKey
        );
      }

      // Guardar firma generada temporalmente y cerrar el modal del PIN
      setDigitalSigValue(finalSignature);
      setSigPublicKeyVal(finalPublicKey);
      setHasDigitalSignature(true);
      setShowPinModal(false);
      
      // Lanzar directamente la finalización con la firma criptográfica activa
      await submitFinalization(finalSignature, finalPublicKey);

    } catch (err: any) {
      console.error('[Signature Error]:', err);
      setPinError(err.message || 'Error al procesar la firma digital.');
    } finally {
      setIsCryptedSigning(false);
    }
  };

  const handleSaveAndFinish = async () => {
    setIsSubmitted(true);
    setError(null);
    
    if (!diagnosis.trim()) {
      setError('El diagnóstico es obligatorio para cerrar la consulta');
      return;
    }
    
    if (addPrescription && medications.length === 0) {
      setError('Debe agregar al menos un medicamento si la receta electrónica está activa');
      return;
    }

    if (addPrescription && medications.some(m => !m.name.trim())) {
      setError('Todos los medicamentos deben tener un nombre');
      return;
    }

    if (!appointmentData) {
      setError('Error: No se pudo recuperar la información del turno.');
      return;
    }

    // Si tiene receta y todavía no se firmó digitalmente con el PIN, abrimos el modal
    if (addPrescription && !hasDigitalSignature) {
      setPin('');
      setPinError(null);
      setShowPinModal(true);
      return;
    }

    // De lo contrario, procedemos con el cierre
    await submitFinalization(digitalSigValue, sigPublicKeyVal);
  };

  const handleAICompose = async () => {
    if (!notes.trim() && !diagnosis.trim()) {
      setError('Escriba algunas notas o un diagnóstico para que el Copiloto AI pueda ayudarlo');
      return;
    }

    setIsGeneratingAI(true);
    setAiSuggestions([]);
    try {
      const { data, error: aiError } = await supabase.functions.invoke('ai-medical-assistant', {
        body: { 
          action: 'professionalize_notes', 
          notes: notes || `Consulta por ${diagnosis}` 
        }
      });
      
      if (aiError) throw aiError;
      
      // El resultado de Gemini a veces viene con markdown o bloques de texto
      // Lo dividimos en párrafos o lo tratamos como una sugerencia única robusta
      if (data.result) {
        setAiSuggestions([data.result]);
      }
    } catch (err) {
      console.error("AI Error:", err);
      setError('El servicio de IA no está disponible en este momento.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium animate-pulse text-lg">Preparando terminal médica...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-12 font-sans selection:bg-teal-500/30" data-testid="post-consultation-page">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-8">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/doctor')}
              className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-white transition-all hover:bg-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-teal-400 text-sm font-bold uppercase tracking-widest mb-1">
                <ShieldCheck className="w-4 h-4" />
                Fase de Finalización
              </div>
              <h1 className="text-4xl font-bold text-white tracking-tight">
                Documentación <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">Clínica</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all duration-300 font-bold text-sm ${
                showHistory 
                ? 'bg-teal-500/10 border-teal-500/50 text-teal-400 shadow-lg shadow-teal-500/10' 
                : 'bg-slate-900/40 border-white/5 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <History className={`w-4 h-4 ${showHistory ? 'animate-pulse' : ''}`} />
              {showHistory ? 'Ocultar Bóveda' : 'Ver Bóveda Médica'}
            </button>

            <div className="flex items-center gap-3 bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-2xl shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Stethoscope className="text-white w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Paciente Atendido</p>
                <p className="text-lg font-bold text-white">
                  {appointmentData?.patientName || 'Paciente Externo'}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className={`grid grid-cols-1 ${showHistory ? 'xl:grid-cols-12' : 'lg:grid-cols-3'} gap-8 transition-all duration-500`}>
          {/* Main Content Area */}
          <div className={`${showHistory ? 'xl:col-span-6' : 'lg:col-span-2'} space-y-8`}>
            {/* Evolution Card */}
            <section className="group bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl transition-all hover:border-teal-500/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400">
                      <ClipboardList className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Evolución Médica</h2>
                  </div>
                  
                  <button 
                    onClick={handleAICompose}
                    disabled={isGeneratingAI}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 text-purple-300 hover:text-white transition-all hover:scale-105 disabled:opacity-50 shadow-lg shadow-purple-500/5"
                  >
                    <Sparkles className={`w-4 h-4 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">Profesionalizar con AI</span>
                  </button>
                </div>

                {/* Quick Symptom Pills */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {['Fiebre', 'Cefalea', 'Tos', 'Mialgias', 'Náuseas', 'Estable'].map(symptom => (
                    <button
                      key={symptom}
                      onClick={() => setNotes(prev => prev ? `${prev}, ${symptom}` : symptom)}
                      className="px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-500 hover:text-teal-400 hover:border-teal-500/30 transition-all"
                    >
                      + {symptom}
                    </button>
                  ))}
                </div>
                
                {aiSuggestions.length > 0 && (
                  <div className="mb-6 space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest ml-1">Sugerencias de Redacción AI</p>
                    <div className="grid grid-cols-1 gap-2">
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setNotes(s);
                            setAiSuggestions([]);
                          }}
                          className="p-4 bg-purple-500/5 border border-purple-500/10 hover:border-purple-500/40 rounded-2xl text-xs text-slate-300 text-left transition-all group/sugg"
                        >
                          <div className="flex justify-between items-start gap-3">
                            <span>{s}</span>
                            <CheckCircle2 className="w-4 h-4 text-purple-500 opacity-0 group-hover/sugg:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="relative">
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all min-h-[220px] placeholder:text-slate-600 text-lg leading-relaxed shadow-inner"
                    placeholder="Describa el estado del paciente, síntomas reportados y observaciones generales..."
                  />
                  <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono">
                    {notes.length} caracteres
                  </div>
                </div>
            </section>

            {/* Diagnosis Card (Ancho Completo y con más espacio) */}
            <section className="group bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl transition-all hover:border-blue-500/30">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Diagnóstico Principal</h2>
                </div>
                
                <button 
                  onClick={handleAiSuggestDiagnosis}
                  disabled={isAnalyzing || !notes.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:text-white transition-all hover:scale-105 disabled:opacity-50 shadow-lg shadow-emerald-500/5 cursor-pointer"
                >
                  <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-bold uppercase tracking-wider">Sugerir con AI</span>
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="relative">
                  <textarea
                    id="diagnosis"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    rows={3}
                    className={`w-full bg-slate-950/50 border rounded-2xl p-5 text-slate-200 focus:outline-none focus:ring-2 transition-all font-bold text-lg leading-relaxed ${
                      isSubmitted && error && !diagnosis 
                        ? 'border-red-500/50 ring-red-500/20 ring-4' 
                        : 'border-slate-800 focus:ring-blue-500/50 focus:border-blue-500/50 shadow-inner'
                    }`}
                    placeholder="Escriba el diagnóstico principal del paciente en detalle (p. ej. Hipertensión Arterial Primaria)..."
                  />
                  {diagnosis && (
                    <div className="absolute right-4 top-4">
                      <CheckCircle2 className="w-6 h-6 text-teal-500" />
                    </div>
                  )}
                </div>

                {suggestions.length > 0 && (
                  <div className="space-y-3 animate-in slide-in-from-top duration-300 bg-slate-950/30 p-5 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Lightbulb size={12} className="text-amber-400" />
                      Codificación Sugerida (CIE-10 / AI)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setDiagnosis(s)}
                          className="px-3 py-2 bg-slate-900 border border-white/5 hover:border-emerald-500/40 rounded-xl text-[11px] text-slate-300 font-bold transition-all text-left hover:scale-[1.02] active:scale-95 cursor-pointer"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isSubmitted && error && !diagnosis && (
                  <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-in fade-in zoom-in duration-200">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p className="font-medium">{error}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Prescription Section */}
            <section className={`transition-all duration-500 ${addPrescription ? 'opacity-100 scale-100' : 'opacity-90 scale-[0.98]'}`}>
              <div className={`bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl transition-all ${addPrescription ? 'border-blue-500/30 ring-1 ring-blue-500/20' : ''}`}>
                <div 
                  className="p-8 flex items-center justify-between cursor-pointer group"
                  onClick={() => {
                    const nextState = !addPrescription;
                    setAddPrescription(nextState);
                    if (nextState && medications.length === 0) {
                      setMedications([{ name: '', instructions: '' }]);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl transition-all ${addPrescription ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 group-hover:text-blue-400'}`}>
                      <Pill className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Receta Electrónica</h2>
                      <p className="text-sm text-slate-500 font-medium">Emisión de indicaciones farmacológicas</p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full transition-all relative ${addPrescription ? 'bg-blue-600' : 'bg-slate-800'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md ${addPrescription ? 'left-7' : 'left-1'}`}></div>
                  </div>
                </div>

                {addPrescription && (
                  <div className="px-8 pb-8 space-y-6 animate-in slide-in-from-top duration-300">
                    <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent mb-6"></div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {medications.map((med, index) => (
                        <MedicationCard 
                          key={index}
                          med={med}
                          index={index}
                          onChange={handleMedicationChange}
                          onRemove={handleRemoveMedication}
                          showRemove={medications.length > 1}
                        />
                      ))}

                      {medications.length === 0 && (
                        <div className="py-16 text-center border-2 border-dashed border-slate-800/50 rounded-[2rem] bg-slate-950/20 group/empty hover:border-blue-500/20 transition-all duration-500">
                          <div className="relative w-20 h-20 mx-auto mb-6">
                            <div className="absolute inset-0 bg-blue-500/10 blur-2xl rounded-full animate-pulse"></div>
                            <div className="relative bg-slate-900 border border-white/5 w-full h-full rounded-2xl flex items-center justify-center text-slate-700 group-hover/empty:text-blue-400 transition-colors">
                              <Pill className="w-10 h-10" />
                            </div>
                          </div>
                          <h4 className="text-slate-400 font-bold mb-1">Sin medicamentos</h4>
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Agregue indicaciones para la receta</p>
                        </div>
                      )}

                      <button 
                        onClick={handleAddMedication}
                        className="w-full py-5 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all flex items-center justify-center gap-3 font-bold text-xs uppercase tracking-widest"
                      >
                        <Plus size={18} />
                        {medications.length === 0 ? 'Iniciar Receta' : 'Agregar Medicamento'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar Area (Actions only - Diagnosis moved to center) */}
          <div className={`${showHistory ? 'xl:col-span-3' : 'lg:col-span-1'} space-y-8`}>

            {/* Action Card */}
            <section className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/5 rounded-3xl p-8 shadow-2xl">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Acción de Cierre</h3>
              <div className="space-y-4">
                <Button
                  onClick={handleSaveAndFinish}
                  isLoading={saving}
                  variant={diagnosis.trim() ? "primary" : "secondary"}
                  icon={<Save className="w-5 h-5" />}
                  className={`h-16 text-lg font-bold rounded-2xl shadow-xl transition-all active:scale-95 ${
                    diagnosis.trim() 
                    ? 'shadow-teal-500/20 bg-teal-500 hover:bg-teal-400 text-slate-950' 
                    : 'shadow-none bg-slate-800/50 text-slate-500 grayscale opacity-70'
                  } ${isSubmitted && !diagnosis.trim() ? 'animate-shake border-red-500/50' : ''}`}
                >
                  Finalizar Consulta
                </Button>
                
                {isSubmitted && !diagnosis.trim() && (
                  <div className="flex items-center justify-center gap-2 py-2 px-4 bg-red-500/10 border border-red-500/20 rounded-xl animate-in slide-in-from-top-2 duration-300">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                      Diagnóstico Requerido
                    </p>
                  </div>
                )}
                
                <p className="text-[10px] text-center text-slate-600 font-medium px-4 leading-relaxed">
                  Al finalizar, se enviará la receta al paciente y se archivará la historia clínica de forma segura.
                </p>
              </div>
            </section>


            {/* Quick Summary Card */}
            <div className="p-6 border border-white/5 bg-slate-900/20 rounded-2xl">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Resumen del Turno
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">ID Sesión</span>
                  <span className="text-slate-300 font-mono">#{appointmentId?.slice(-6)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Médico</span>
                  <span className="text-slate-300 font-semibold">{user.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Fecha</span>
                  <span className="text-slate-300">{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Patient History Sidebar (Bóveda Médica) */}
          {showHistory && (
            <div className="xl:col-span-3 space-y-8 animate-in slide-in-from-right duration-500">
              <section className="bg-slate-900/60 backdrop-blur-3xl border border-teal-500/20 rounded-[2.5rem] flex flex-col h-full min-h-[600px] shadow-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-3xl pointer-events-none"></div>
                
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-400">
                      <FolderOpen size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight leading-none">Bóveda Médica</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Historial del Paciente</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/40 border-b border-white/5 flex gap-2">
                  <button 
                    onClick={() => setHistoryTab('records')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                      historyTab === 'records' ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'bg-slate-900 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Evoluciones
                  </button>
                  <button 
                    onClick={() => setHistoryTab('documents')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                      historyTab === 'documents' ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'bg-slate-900 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Estudios
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {isFetchingHistory ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-10 h-10 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin mb-4"></div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-teal-500/60">Consultando archivo...</p>
                    </div>
                  ) : historyTab === 'records' ? (
                    patientRecords.length > 0 ? (
                      patientRecords.map((record) => (
                        <div key={record.id} className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 hover:border-teal-500/20 transition-all group">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest px-3 py-1 bg-teal-500/10 rounded-full">{record.date}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{record.type}</span>
                          </div>
                          <h4 className="font-bold text-white mb-2 leading-tight group-hover:text-teal-400 transition-colors">{record.diagnosis}</h4>
                          <p className="text-xs text-slate-400 line-clamp-3 italic mb-4">"{record.notes}"</p>
                          <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                            <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-bold text-teal-500">
                              {record.doctorName?.charAt(0)}
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dr. {record.doctorName?.split(' ').pop()}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-20 bg-slate-950/20 rounded-3xl border border-white/5 border-dashed">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sin antecedentes registrados</p>
                      </div>
                    )
                  ) : (
                    patientDocuments.length > 0 ? (
                      patientDocuments.map((doc) => (
                        <div key={doc.id} className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 hover:border-teal-500/20 transition-all group">
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-3 rounded-xl bg-slate-950 border border-white/5 text-teal-500">
                              {doc.type === 'lab_result' ? <FlaskConical size={18} /> : 
                               doc.type === 'imaging' ? <ImageIcon size={18} /> : 
                               <FileGeneric size={18} />}
                            </div>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{doc.date}</span>
                          </div>
                          <h4 className="font-bold text-white mb-1 leading-tight group-hover:text-teal-400 transition-colors">{doc.title}</h4>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                            {doc.type === 'lab_result' ? 'Laboratorio' : doc.type === 'imaging' ? 'Imagen' : 'Documento'}
                          </p>
                          <div className="flex gap-2">
                            <a 
                              href={doc.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex-1 py-3 bg-white/5 hover:bg-teal-500 text-white hover:text-slate-950 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                            >
                              <ExternalLink size={12} /> Ver
                            </a>
                            <button className="p-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-all">
                              <Download size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-20 bg-slate-950/20 rounded-3xl border border-white/5 border-dashed">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sin documentos cargados</p>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
      {/* PIN Signature Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#020617]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-teal-500 to-blue-500"></div>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-teal-500/10 text-teal-400 rounded-2xl border border-teal-500/20">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {!localUserPublicKey ? 'Configurar Firma Digital' : 'Firma de Receta Digital'}
                </h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Firma Electrónica Avanzada</p>
              </div>
            </div>

            <form onSubmit={handleVerifyPinAndSign} className="space-y-6">
              {!localUserPublicKey ? (
                <div className="p-4 rounded-2xl bg-teal-500/5 border border-teal-500/20 text-xs text-slate-300 leading-relaxed">
                  Es tu primera firma en MEDINEX. Generaremos un par de **claves asimétricas ECDSA (P-256)** exclusivas para vos. 
                  Por favor, elegí un **PIN numérico de 6 dígitos**. Este PIN se usará de forma local para cifrar tu clave de firma.
                </div>
              ) : (
                <p className="text-slate-400 text-sm leading-relaxed">
                  Por favor, ingresá tu **PIN numérico de 6 dígitos** para autorizar y firmar criptográficamente esta receta.
                </p>
              )}

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  {!localUserPublicKey ? 'Establecer PIN (6 dígitos)' : 'Ingresar PIN de Firma'}
                </label>
                <div className="flex justify-center gap-3 max-w-sm mx-auto" onPaste={handlePinPaste}>
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        pinInputsRef.current[idx] = el;
                      }}
                      type="password"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      maxLength={1}
                      disabled={isCryptedSigning}
                      className="w-12 h-16 bg-slate-950/80 border border-white/10 rounded-2xl text-center font-mono text-2xl text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all outline-none"
                      value={pin[idx] || ''}
                      onChange={(e) => handlePinChange(idx, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(idx, e)}
                    />
                  ))}
                </div>
              </div>

              {pinError && (
                <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs animate-in fade-in zoom-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p className="font-semibold">{pinError}</p>
                </div>
              )}

              <div className="flex justify-end gap-4 pt-2">
                <button
                  type="button"
                  disabled={isCryptedSigning}
                  onClick={() => setShowPinModal(false)}
                  className="px-6 py-3.5 text-slate-400 font-bold hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCryptedSigning || pin.length !== 6}
                  className="px-8 py-3.5 bg-teal-500 hover:bg-teal-400 text-[#020617] rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCryptedSigning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin"></div>
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <span>{!localUserPublicKey ? 'Configurar y Firmar' : 'Confirmar Firma'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CompletionOverlay />
    </div>
  );
};

export default PostConsultation;
