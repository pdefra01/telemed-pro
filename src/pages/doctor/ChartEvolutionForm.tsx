import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { medicalRecordRepository } from '../../repositories/MedicalRecordRepository';
import { useFamilyGroupMembers } from './useFamilyGroupMembers';

interface ChartEvolutionFormProps {
  /** Titular of the chart. */
  patientId: string;
  patientName: string;
  doctor: { id: string; name: string };
  /** Called after the evolution is saved, so the chart can reload its records. */
  onSaved: () => void;
}

/**
 * Adds a new evolution from the doctor's patient chart, outside any video call.
 * It never edits an existing record and carries no appointment id.
 */
const ChartEvolutionForm: React.FC<ChartEvolutionFormProps> = ({ patientId, patientName, doctor, onSaved }) => {
  const [open, setOpen] = useState(false);
  const members = useFamilyGroupMembers(patientId);
  const [familyMemberId, setFamilyMemberId] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setDiagnosis('');
    setNotes('');
    setFamilyMemberId('');
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await medicalRecordRepository.createMedicalRecord({
        patientId,
        familyMemberId: familyMemberId || undefined,
        doctorId: doctor.id,
        doctorName: doctor.name,
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        type: 'consultation',
      });
      close();
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la evolución.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-2"
      >
        <Plus size={14} /> Agregar evolución
      </button>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 sm:p-5 border border-white/5 space-y-3">
      <label className="block text-xs font-bold text-slate-400">
        Para
        <select
          value={familyMemberId}
          onChange={(e) => setFamilyMemberId(e.target.value)}
          aria-label="Para"
          className="mt-1 w-full bg-slate-950/50 border border-white/5 px-4 py-3 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500/50"
        >
          <option value="">{patientName} (titular)</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <input
        type="text"
        value={diagnosis}
        onChange={(e) => setDiagnosis(e.target.value)}
        placeholder="Diagnóstico"
        aria-label="Diagnóstico de la evolución"
        className="w-full bg-slate-950/50 border border-white/5 px-4 py-3 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas de evolución"
        aria-label="Notas de la evolución"
        rows={4}
        className="w-full bg-slate-950/50 border border-white/5 px-4 py-3 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar evolución'}
        </button>
        <button type="button" onClick={close} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white">
          Cancelar
        </button>
      </div>
      <p className="text-[11px] text-slate-500">Se suma a la historia clínica con la fecha y hora actuales. No modifica lo ya registrado.</p>
    </div>
  );
};

export default ChartEvolutionForm;
