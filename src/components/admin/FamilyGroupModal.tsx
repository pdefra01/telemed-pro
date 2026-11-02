import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { familyMemberRepository } from '../../repositories/FamilyMemberRepository';
import { formatHistoryDate } from '../../utils/clinicalHistoryFormat';
import type { FamilyMember } from '../../types';

type Member = FamilyMember & { dni?: string; birthDate?: string };

const RELATION_OPTIONS = ['cónyuge', 'hijo/a', 'padre/madre', 'hermano/a', 'otro'] as const;
const EMPTY_FORM = { fullName: '', relation: 'hijo/a', birthDate: '', dni: '' };

interface Props {
  patientId: string;
  patientName: string;
  familyGroupId?: string;
  onClose: () => void;
}

/** Admin view of an affiliate's family group, with add / edit / remove. */
export const FamilyGroupModal: React.FC<Props> = ({ patientId, patientName, familyGroupId, onClose }) => {
  const [groupId, setGroupId] = useState<string | undefined>(familyGroupId);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id?: string) => {
    if (!id) {
      setMembers([]);
      setIsLoading(false);
      return;
    }
    try {
      setMembers(await familyMemberRepository.getByFamilyGroup(id));
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudo cargar el grupo familiar.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // The list the page holds can be stale (a group may have been created since
  // it loaded), so without an id the real one is read from the profile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let id = familyGroupId;
      if (!id) {
        try {
          id = await familyMemberRepository.findFamilyGroupId(patientId);
        } catch (lookupError: any) {
          if (!cancelled) {
            setError(lookupError?.message || 'No se pudo cargar el grupo familiar.');
            setIsLoading(false);
          }
          return;
        }
      }
      if (cancelled) return;
      setGroupId(id);
      await load(id);
    })();
    return () => { cancelled = true; };
  }, [familyGroupId, patientId, load]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (member: Member) => {
    setError(null);
    setEditingId(member.id);
    setForm({ fullName: member.name, relation: member.relation, birthDate: member.birthDate ?? '', dni: member.dni ?? '' });
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    if (!form.fullName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      let targetGroup = groupId;
      if (editingId) {
        await familyMemberRepository.updateMember(editingId, { ...form });
      } else {
        // An affiliate without a group gets one on the first member added.
        targetGroup = groupId ?? await familyMemberRepository.ensureFamilyGroup(patientId);
        setGroupId(targetGroup);
        await familyMemberRepository.addMember(targetGroup, { ...form });
      }
      await load(targetGroup);
      resetForm();
    } catch (saveError: any) {
      setError(saveError?.message || 'No se pudo guardar el integrante.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (member: Member) => {
    if (!window.confirm(`¿Quitar a ${member.name} del grupo familiar? Sus estudios cargados quedan con el titular, pero pierden la etiqueta "Familiar".`)) return;
    setError(null);
    try {
      await familyMemberRepository.removeMember(member.id);
      if (editingId === member.id) resetForm();
      await load(groupId);
    } catch (removeError: any) {
      setError(removeError?.message || 'No se pudo quitar al integrante.');
    }
  };

  const field = 'w-full bg-slate-950/50 border border-white/5 px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-3xl relative">
        <div className="px-5 py-3 border-b border-white/5 bg-slate-950/40 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-white">Grupo familiar</h3>
            <p className="text-xs text-slate-400 truncate">{patientName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <p className="text-sm text-slate-400">Cargando...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-500">Este afiliado no tiene integrantes cargados.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{member.name}</p>
                    <p className="text-xs text-slate-400">
                      {member.relation}
                      {member.dni ? ` · DNI ${member.dni}` : ''}
                      {member.birthDate ? ` · ${formatHistoryDate(member.birthDate)} (${member.age} años)` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(member)}
                      aria-label={`Editar ${member.name}`}
                      className="p-2 bg-white/5 hover:bg-blue-500/20 text-blue-400 rounded-xl border border-white/5"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      aria-label={`Quitar ${member.name}`}
                      className="p-2 bg-white/5 hover:bg-red-500/20 text-red-400 rounded-xl border border-white/5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-white/5 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {editingId ? 'Editar integrante' : 'Agregar integrante'}
            </h4>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Nombre completo"
              aria-label="Nombre completo"
              className={field}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={form.relation}
                onChange={(e) => setForm({ ...form, relation: e.target.value })}
                aria-label="Parentesco"
                className={field}
              >
                {RELATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                aria-label="Fecha de nacimiento"
                className={field}
              />
              <input
                type="text"
                inputMode="numeric"
                value={form.dni}
                onChange={(e) => setForm({ ...form, dni: e.target.value })}
                placeholder="DNI"
                aria-label="DNI"
                className={field}
              />
            </div>
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold disabled:opacity-50"
              >
                {editingId ? 'Guardar cambios' : 'Agregar integrante'}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
