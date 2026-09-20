import React, { useState } from 'react';
import { Briefcase } from 'lucide-react';
import { Plan } from '../../types';
import { planRepository } from '../../repositories/PlanRepository';
import { useToast } from '../../context/ToastContext';

interface PlanFormModalProps {
  plan: Plan | null; // null => create mode, otherwise edit mode
  /** Create-mode prefill (used by "Crear nueva versión"). Ignored when editing. */
  draft?: Omit<Plan, 'id'> | null;
  /** Edit mode: the plan has affiliates/coverage windows, so price/terms are locked. */
  inUse?: boolean;
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

/**
 * Mirrors the DB CHECK(paid_months >= 1) — billing duration applies to every
 * plan regardless of quota being unlimited, so this is never skipped.
 */
export function isValidPaidMonths(value: number): boolean {
  return Number.isFinite(value) && value >= 1;
}

/** Mirrors the DB CHECK(bonus_months >= 0). */
export function isValidBonusMonths(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export const PLAN_KIND_LABELS = {
  individual: 'Individual',
  familiar: 'Familiar',
} as const;

export const PAYMENT_OPTION_LABELS = {
  standard: 'Estándar',
  card_debit: 'Débito tarjeta',
  prepaid_6: 'Semestral',
  prepaid_12: 'Anual',
} as const;

/**
 * Mirrors the DB rules on the catalog columns: an offered plan needs kind and
 * option, Individual only has the 'standard' option, commission >= 0.
 * Returns a Spanish error message or null when valid.
 */
export function validateCatalogFields(input: {
  isOffered: boolean;
  planKind: string;
  paymentOption: string;
  commission: number;
}): string | null {
  if (input.isOffered && !input.planKind) {
    return 'Un plan ofrecido necesita un tipo (Individual o Familiar).';
  }
  if (input.isOffered && !input.paymentOption) {
    return 'Un plan ofrecido necesita una opción de pago.';
  }
  if (input.planKind === 'individual' && input.paymentOption && input.paymentOption !== 'standard') {
    return 'El plan Individual solo admite la opción de pago Estándar.';
  }
  if (!Number.isFinite(input.commission) || input.commission < 0) {
    return 'La comisión del asesor debe ser un número válido mayor o igual a 0.';
  }
  return null;
}

/** Turns a Supabase/Postgres error into a readable Spanish message. */
export function mapPlanSaveError(err: any): string {
  const message: string = err?.message || '';
  if (err?.code === '23505' || message.includes('plans_one_offered_per_option_idx')) {
    return 'Ya hay un plan ofrecido con ese tipo y opción de pago. Retire el otro plan primero.';
  }
  if (message.includes('esta en uso')) {
    return 'Este plan está en uso: para cambiar el precio o las condiciones cree una nueva versión.';
  }
  return message || 'Error al guardar el plan.';
}

/** Prefill for "Crear nueva versión": same terms, new name, not offered, never default. */
export function buildNewVersionDraft(plan: Plan): Omit<Plan, 'id'> {
  const { id: _id, ...rest } = plan;
  return {
    ...rest,
    name: `${plan.name} (nueva versión)`,
    isOffered: false,
    isDefault: false,
  };
}

const PlanFormModal: React.FC<PlanFormModalProps> = ({ plan, draft = null, inUse = false, onClose, onSaved }) => {
  const { toast } = useToast();
  const isEditing = !!plan;
  const lockTerms = isEditing && inUse;
  const source: Partial<Plan> | null = plan ?? draft;

  const [name, setName] = useState(source?.name ?? '');
  const [monthlyCost, setMonthlyCost] = useState(source ? String(source.monthlyCost) : '');
  const [isUnlimited, setIsUnlimited] = useState(source?.isUnlimited ?? false);
  const [bonifiedConsultations, setBonifiedConsultations] = useState(
    source ? String(source.bonifiedConsultations) : ''
  );
  const [maxFamilyMembers, setMaxFamilyMembers] = useState(source ? String(source.maxFamilyMembers) : '');
  const [paidMonths, setPaidMonths] = useState(source ? String(source.paidMonths) : '1');
  const [bonusMonths, setBonusMonths] = useState(source ? String(source.bonusMonths) : '0');
  const [planKind, setPlanKind] = useState<string>(source?.planKind ?? '');
  const [paymentOption, setPaymentOption] = useState<string>(source?.paymentOption ?? '');
  const [commission, setCommission] = useState(String(source?.advisorCommissionAmount ?? 0));
  const [isOffered, setIsOffered] = useState(source?.isOffered ?? false);
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
    const parsedPaidMonths = Number(paidMonths);
    if (!isValidPaidMonths(parsedPaidMonths)) {
      setError('Los meses pagos deben ser un número válido mayor o igual a 1.');
      return;
    }
    const parsedBonusMonths = Number(bonusMonths);
    if (!isValidBonusMonths(parsedBonusMonths)) {
      setError('Los meses bonificados deben ser un número válido mayor o igual a 0.');
      return;
    }

    const catalogError = validateCatalogFields({
      isOffered,
      planKind,
      paymentOption,
      commission: Number(commission),
    });
    if (catalogError) {
      setError(catalogError);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        planKind: (planKind || null) as Plan['planKind'],
        paymentOption: (paymentOption || null) as Plan['paymentOption'],
        isOffered,
        advisorCommissionAmount: Number(commission),
        name: name.trim(),
        monthlyCost: parsedCost,
        isUnlimited,
        bonifiedConsultations: resolveBonifiedConsultations(isUnlimited, Number(bonifiedConsultations)),
        maxFamilyMembers: Math.trunc(parsedFamilyMembers),
        paidMonths: Math.trunc(parsedPaidMonths),
        bonusMonths: Math.trunc(parsedBonusMonths),
        // isDefault is never set here — PlanRepository.mapPlanToRow() ignores it
        // deliberately; use the dedicated "Marcar como Plan por Defecto" action
        // instead, which unsets the previous default atomically.
        isDefault: plan?.isDefault ?? false,
      };

      if (isEditing && plan) {
        if (lockTerms) {
          // The DB trigger rejects any change to price/terms of a plan in use;
          // send only what stays editable.
          await planRepository.update(plan.id, { name: payload.name, isOffered });
        } else {
          await planRepository.update(plan.id, payload);
        }
        toast('Plan actualizado con éxito.', 'success');
      } else {
        await planRepository.create(payload);
        toast('Plan creado con éxito.', 'success');
      }
      onSaved();
    } catch (err: any) {
      console.error('Error guardando el plan:', err);
      const message = mapPlanSaveError(err);
      setError(message);
      toast(message, 'error');
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
            <h3 className="text-xl font-bold text-white">{isEditing ? `Editar Plan: ${plan?.name}` : draft ? 'Nueva versión de plan' : 'Nuevo Plan de Cobertura'}</h3>
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

        {lockTerms && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-2xl p-3.5 mb-6 font-medium leading-relaxed">
            Este plan está en uso: para cambiar el precio cree una nueva versión. Solo se pueden editar el nombre y si está ofrecido.
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

          <fieldset disabled={lockTerms} className="space-y-5 border-0 p-0 m-0 min-w-0 disabled:opacity-60">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Tipo de Plan:
              </label>
              <select
                value={planKind}
                onChange={(e) => setPlanKind(e.target.value)}
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="">Sin tipo</option>
                {Object.entries(PLAN_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Opción de Pago:
              </label>
              <select
                value={paymentOption}
                onChange={(e) => setPaymentOption(e.target.value)}
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="">Sin opción</option>
                {Object.entries(PAYMENT_OPTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Meses Pagos:
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={paidMonths}
                onChange={(e) => setPaidMonths(e.target.value)}
                placeholder="Ej. 12"
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Meses Bonificados:
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={bonusMonths}
                onChange={(e) => setBonusMonths(e.target.value)}
                placeholder="Ej. 2"
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 -mt-3">
            Duración total de cobertura: {(Number(paidMonths) || 0) + (Number(bonusMonths) || 0)} meses
            (ej. Plan 12+2 = 12 meses pagos + 2 meses de regalo).
          </p>

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

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Comisión fija del asesor ($):
            </label>
            <input
              type="number"
              min="0"
              step="1"
              required
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="Ej. 25000"
              className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          </fieldset>

          <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-3">
            <input
              type="checkbox"
              id="isOffered"
              checked={isOffered}
              onChange={(e) => setIsOffered(e.target.checked)}
              className="w-4 h-4 text-emerald-500 bg-slate-950 border-white/10 rounded focus:ring-emerald-500/20 cursor-pointer"
            />
            <label htmlFor="isOffered" className="text-xs font-semibold text-slate-200 cursor-pointer">
              Ofrecido a nuevas altas
              <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                Solo puede haber un plan ofrecido por tipo y opción de pago. Retirado = no se vende, pero los afiliados lo conservan.
              </span>
            </label>
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
