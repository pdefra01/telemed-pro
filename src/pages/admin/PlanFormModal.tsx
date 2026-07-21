import React, { useState } from 'react';
import { Briefcase } from 'lucide-react';
import { Plan } from '../../types';
import { planRepository } from '../../repositories/PlanRepository';
import { useToast } from '../../context/ToastContext';

interface PlanFormModalProps {
  plan: Plan | null; // null => create mode, otherwise edit mode
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Resuelve el valor de `bonifiedConsultations` que se persiste según el toggle
 * de "ilimitado". Cuando el plan es ilimitado, el campo numérico no tiene
 * significado real y nunca debe persistirse como si aplicara un tope finito.
 */
export function resolveBonifiedConsultations(isUnlimited: boolean, rawValue: number): number {
  if (isUnlimited) return 0;
  if (!Number.isFinite(rawValue) || rawValue < 0) return 0;
  return Math.trunc(rawValue);
}

const PlanFormModal: React.FC<PlanFormModalProps> = ({ plan, onClose, onSaved }) => {
  const { toast } = useToast();
  const isEditing = !!plan;

  const [name, setName] = useState(plan?.name ?? '');
  const [monthlyCost, setMonthlyCost] = useState(plan ? String(plan.monthlyCost) : '');
  const [isUnlimited, setIsUnlimited] = useState(plan?.isUnlimited ?? false);
  const [bonifiedConsultations, setBonifiedConsultations] = useState(
    plan ? String(plan.bonifiedConsultations) : ''
  );
  const [maxFamilyMembers, setMaxFamilyMembers] = useState(plan ? String(plan.maxFamilyMembers) : '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('El nombre del plan es obligatorio.');
      return;
    }
    const parsedCost = Number(monthlyCost);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setError('El costo mensual debe ser un número válido mayor o igual a 0.');
      return;
    }
    const parsedFamilyMembers = Number(maxFamilyMembers);
    if (!Number.isFinite(parsedFamilyMembers) || parsedFamilyMembers < 0) {
      setError('El máximo de familiares debe ser un número válido mayor o igual a 0.');
      return;
    }
    if (!isUnlimited) {
      const parsedBonified = Number(bonifiedConsultations);
      if (!Number.isFinite(parsedBonified) || parsedBonified < 0) {
        setError('Las consultas bonificadas deben ser un número válido mayor o igual a 0.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        monthlyCost: parsedCost,
        isUnlimited,
        bonifiedConsultations: resolveBonifiedConsultations(isUnlimited, Number(bonifiedConsultations)),
        maxFamilyMembers: Math.trunc(parsedFamilyMembers),
        // isDefault is never set here — PlanRepository.mapPlanToRow() ignores it
        // deliberately; use the dedicated "Marcar como Plan por Defecto" action
        // instead, which unsets the previous default atomically.
        isDefault: plan?.isDefault ?? false,
      };

      if (isEditing && plan) {
        await planRepository.update(plan.id, payload);
        toast('Plan actualizado con éxito.', 'success');
      } else {
        await planRepository.create(payload);
        toast('Plan creado con éxito.', 'success');
      }
      onSaved();
    } catch (err: any) {
      console.error('Error guardando el plan:', err);
      setError(err.message || 'Error al guardar el plan.');
      toast('Error al guardar el plan.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#0f172a]/95 border border-white/10 rounded-[2.5rem] p-6 sm:p-8 w-full max-w-md shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500"></div>

        <div className="flex items-center space-x-4 mb-6">
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Briefcase size={22} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{isEditing ? `Editar Plan: ${plan?.name}` : 'Nuevo Plan de Cobertura'}</h3>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">
              {isEditing ? 'Actualizar parámetros' : 'Definir parámetros del plan'}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs rounded-2xl p-3.5 mb-6 font-medium leading-relaxed">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Nombre del Plan:
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Plan Familiar Medinex"
              className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Costo Mensual ($):
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={monthlyCost}
                onChange={(e) => setMonthlyCost(e.target.value)}
                placeholder="Ej. 50000"
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Máx. Familiares:
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={maxFamilyMembers}
                onChange={(e) => setMaxFamilyMembers(e.target.value)}
                placeholder="Ej. 4"
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-3">
            <input
              type="checkbox"
              id="isUnlimited"
              checked={isUnlimited}
              onChange={(e) => setIsUnlimited(e.target.checked)}
              className="w-4 h-4 text-emerald-500 bg-slate-950 border-white/10 rounded focus:ring-emerald-500/20 cursor-pointer"
            />
            <label htmlFor="isUnlimited" className="text-xs font-semibold text-slate-200 cursor-pointer">
              Consultas bonificadas <span className="text-emerald-400 font-bold">ilimitadas</span>
              <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                El plan no tiene tope mensual de consultas bonificadas.
              </span>
            </label>
          </div>

          <div>
            <label
              className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${
                isUnlimited ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              Consultas Bonificadas (mensual):
            </label>
            <input
              type="number"
              min="0"
              step="1"
              disabled={isUnlimited}
              required={!isUnlimited}
              value={isUnlimited ? '' : bonifiedConsultations}
              onChange={(e) => setBonifiedConsultations(e.target.value)}
              placeholder={isUnlimited ? '∞ (ilimitado)' : 'Ej. 6'}
              className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-white/5 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 bg-white/5 text-slate-400 rounded-xl text-xs font-bold hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PlanFormModal;
