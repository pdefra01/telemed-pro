import { ProspectStatus } from '../types';

/** Pipeline order, also the order shown in selects and filters. */
export const PROSPECT_STATUSES: ProspectStatus[] = ['new', 'contacted', 'interested', 'affiliated', 'lost'];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  interested: 'Interesado',
  affiliated: 'Afiliado',
  lost: 'Perdido',
};

export const PROSPECT_STATUS_BADGE: Record<ProspectStatus, string> = {
  new: 'bg-slate-100 text-slate-700',
  contacted: 'bg-blue-100 text-blue-700',
  interested: 'bg-amber-100 text-amber-700',
  affiliated: 'bg-emerald-100 text-emerald-700',
  lost: 'bg-red-100 text-red-700',
};
