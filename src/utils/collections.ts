import { CollectionActionType, CollectionStatus } from '../types';

export const COLLECTION_ACTION_TYPES: CollectionActionType[] = ['call', 'whatsapp', 'visit', 'note', 'promise'];

export const COLLECTION_ACTION_LABELS: Record<CollectionActionType, string> = {
  call: 'Llamada',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  note: 'Nota',
  promise: 'Promesa de pago',
};

export const COLLECTION_STATUS_LABELS: Record<CollectionStatus, string> = {
  overdue: 'En mora',
  pending: 'Pendiente',
  current: 'Al día',
};

export const COLLECTION_STATUS_BADGE: Record<CollectionStatus, string> = {
  overdue: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  current: 'bg-emerald-100 text-emerald-700',
};

/** `YYYY-MM-DD` → `d/m/yyyy`, without going through a timezone-dependent Date. */
export const formatDateOnly = (value: string): string => {
  const [year, month, day] = value.split('-').map(Number);
  return `${day}/${month}/${year}`;
};

export const formatTimestamp = (iso: string): string => new Date(iso).toLocaleDateString('es-AR');

export const gestionesLabel = (count: number): string =>
  count === 0 ? 'Sin gestiones' : count === 1 ? '1 gestión' : `${count} gestiones`;
