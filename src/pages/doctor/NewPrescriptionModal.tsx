import React, { useEffect, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { MedicationCard, MedicationItem } from './MedicationCard';
import { familyMemberRepository } from '../../repositories/FamilyMemberRepository';
import { issueStandalonePrescription } from '../../utils/issuePrescription';
import { sendPrescriptionWhatsapp } from '../../utils/prescriptionWhatsapp';
import { validateExternalPrescriptionUrl } from '../../utils/externalPrescriptionUrl';

interface NewPrescriptionModalProps {
  patientId: string;
  patientName: string;
  onClose: () => void;
}

type WhatsappState = { status: 'idle' | 'sending' | 'sent' | 'failed'; message?: string };

const emptyMedication = (): MedicationItem => ({ name: '', instructions: '' });

/**
 * Receta issued by a doctor to an affiliate (titular or family member) without
 * a video consultation. Delivered from the company WhatsApp after issuing.
 */
const NewPrescriptionModal: React.FC<NewPrescriptionModalProps> = ({ patientId, patientName, onClose }) => {
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [familyMemberId, setFamilyMemberId] = useState('');
  const [mode, setMode] = useState<'medinex' | 'obra_social'>('medinex');
  const [medications, setMedications] = useState<MedicationItem[]>([emptyMedication()]);
  const [indications, setIndications] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsappState>({ status: 'idle' });

  // The family group only adds options; without it the receta goes to the titular.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const groupId = await familyMemberRepository.findFamilyGroupId(patientId);
        if (!groupId) return;
        const group = await familyMemberRepository.getByFamilyGroup(groupId);
        if (!cancelled) setMembers(group.map((m) => ({ id: m.id, label: m.relation ? `${m.name} (${m.relation})` : m.name })));
      } catch (err) {
        console.warn('No se pudo cargar el grupo familiar:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  const handleMedicationChange = (index: number, field: 'name' | 'instructions' | 'productId' | 'stockAvailable', value: any) => {
    setMedications((prev) => prev.map((med, i) => {
      if (i !== index) return med;
      // A typed name no longer refers to the picked catalog product (issue #35).
      if (field === 'name') return { ...med, name: value, productId: undefined, stockAvailable: undefined };
      return { ...med, [field]: value };
    }));
  };

  const sendWhatsapp = async (id: string) => {
    setWhatsapp({ status: 'sending' });
    const result = await sendPrescriptionWhatsapp(id);
    setWhatsapp(result.ok ? { status: 'sent' } : { status: 'failed', message: result.message });
  };

  const handleIssue = async () => {
    setError(null);
    const isObraSocial = mode === 'obra_social';
    const filled = isObraSocial ? [] : medications.filter((m) => m.name.trim() || m.instructions.trim());

    if (filled.some((m) => !m.name.trim())) {
      setError('Cada medicamento necesita un nombre.');
      return;
    }
    if (isObraSocial) {
      const urlError = validateExternalPrescriptionUrl(externalUrl);
      if (urlError) {
        setError(urlError);
        return;
      }
    } else if (filled.length === 0 && !indications.trim()) {
      setError('Cargá al menos un medicamento o indicaciones.');
      return;
    }

    setIssuing(true);
    const result = await issueStandalonePrescription({
      patientId,
      familyMemberId: familyMemberId || null,
      medications: filled.map((m) => ({
        name: m.name.trim(),
        instructions: m.instructions.trim(),
        ...(m.productId ? { productId: m.productId } : {}),
      })),
      indications: indications.trim(),
      ...(isObraSocial ? { externalPrescriptionUrl: externalUrl.trim() } : {}),
    });
    setIssuing(false);

    // 'in' narrows the union even without strictNullChecks.
    if ('message' in result) {
      setError(result.message);
      return;
    }
    setPrescriptionId(result.prescriptionId);
    await sendWhatsapp(result.prescriptionId);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={issuing ? undefined : onClose}></div>
      <div role="dialog" aria-label="Nueva receta" className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[94vh] overflow-hidden flex flex-col shadow-3xl">
        <div className="px-4 sm:px-6 py-3 border-b border-white/5 bg-slate-950/40 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 min-w-0">
            <h3 className="font-bold text-xl text-white tracking-tight">Nueva receta</h3>
            <span className="font-bold text-lg text-emerald-400 tracking-tight truncate">{patientName}</span>
          </div>
          <button
            onClick={onClose}
            disabled={issuing}
            aria-label="Cerrar nueva receta"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-red-500/20 transition-all disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6 custom-scrollbar flex-1 space-y-5">
          {prescriptionId ? (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-lg font-bold text-white">Receta emitida</p>
              <p className="text-sm text-slate-400">El paciente ya la ve en su historial.</p>
              {whatsapp.status === 'sending' && <p className="text-xs text-slate-400">Enviando por WhatsApp...</p>}
              {whatsapp.status === 'sent' && <p className="text-xs text-emerald-400">Receta enviada por WhatsApp.</p>}
              {whatsapp.status === 'failed' && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-red-400">{whatsapp.message}</p>
                  <button
                    type="button"
                    onClick={() => sendWhatsapp(prescriptionId)}
                    className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20"
                  >
                    Reenviar por WhatsApp
                  </button>
                </div>
              )}
              <button type="button" onClick={onClose} className="mt-4 px-6 py-2 rounded-xl bg-white/5 text-slate-200 text-sm font-bold hover:bg-white/10">
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="new-prescription-for" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Para</label>
                <select
                  id="new-prescription-for"
                  value={familyMemberId}
                  onChange={(e) => setFamilyMemberId(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">{patientName} (titular)</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>

              <div className="flex p-1 bg-slate-950/60 rounded-xl border border-white/5 gap-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMode('medinex')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold ${mode === 'medinex' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  Receta Medinex
                </button>
                <button
                  type="button"
                  onClick={() => setMode('obra_social')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold ${mode === 'obra_social' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  Receta de obra social
                </button>
              </div>

              {mode === 'medinex' ? (
                <div className="space-y-4">
                  {medications.map((med, index) => (
                    <MedicationCard
                      key={index}
                      med={med}
                      index={index}
                      onChange={handleMedicationChange}
                      onRemove={(i) => setMedications((prev) => prev.filter((_, j) => j !== i))}
                      showRemove={medications.length > 1}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setMedications((prev) => [...prev, emptyMedication()])}
                    className="flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300"
                  >
                    <Plus size={14} /> Agregar medicamento
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="new-prescription-url" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Link de la receta de obra social</label>
                  <input
                    id="new-prescription-url"
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="new-prescription-indications" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Indicaciones</label>
                <textarea
                  id="new-prescription-indications"
                  value={indications}
                  onChange={(e) => setIndications(e.target.value)}
                  rows={3}
                  placeholder="Reposo, dieta, controles..."
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleIssue}
                  disabled={issuing}
                  className="px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 text-sm font-bold hover:bg-emerald-400 disabled:opacity-50"
                >
                  {issuing ? 'Emitiendo...' : 'Emitir receta'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewPrescriptionModal;
