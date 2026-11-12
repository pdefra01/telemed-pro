import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CollectionAction, CollectionActionType, CollectionAffiliate, CollectionStatus } from '../../types';
import { collectionRepository } from '../../repositories/CollectionRepository';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../utils/performance';
import {
  COLLECTION_ACTION_LABELS,
  COLLECTION_ACTION_TYPES,
  COLLECTION_STATUS_BADGE,
  COLLECTION_STATUS_LABELS,
  formatDateOnly,
  formatTimestamp,
  gestionesLabel,
} from '../../utils/collections';

type StatusFilter = 'debt' | 'all' | CollectionStatus;

interface CollectionsProps {
  title?: string;
  /**
   * Supervisor / admin view: every advisor in scope, with the owning advisor on
   * each row, an advisor filter and a per-advisor summary.
   */
  team?: boolean;
}

const EMPTY_FORM = { actionType: 'call' as CollectionActionType, note: '', promisedDate: '' };

const STATUSES: CollectionStatus[] = ['overdue', 'pending', 'current'];

/**
 * Collections of the affiliates an advisor brought: who owes what, and the
 * follow-up (calls, messages, visits, notes, promises to pay). The advisor, the
 * supervisor of their team and the admin can log actions; the database decides.
 */
export const Collections: React.FC<CollectionsProps> = ({ title = 'Cobranzas', team = false }) => {
  const [affiliates, setAffiliates] = useState<CollectionAffiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('debt');
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The open row shows the secondary details and the history.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [history, setHistory] = useState<CollectionAction[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // The affiliate whose history is open now: a late answer for another one is dropped.
  const openHistoryRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    collectionRepository
      .listAffiliates()
      .then((rows) => { if (!cancelled) setAffiliates(rows); })
      .catch(() => { if (!cancelled) setLoadError('No se pudieron cargar las cobranzas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const result: Record<CollectionStatus, number> = { overdue: 0, pending: 0, current: 0 };
    affiliates.forEach((a) => { result[a.paymentStatus] += 1; });
    return result;
  }, [affiliates]);

  const totalOwed = useMemo(
    () => affiliates.filter((a) => a.paymentStatus !== 'current').reduce((sum, a) => sum + a.balance, 0),
    [affiliates]
  );

  const advisors = useMemo(() => {
    const byId = new Map<string, { name: string; overdue: number; pending: number; current: number; owed: number }>();
    affiliates.forEach((a) => {
      const entry = byId.get(a.advisorId) ?? { name: a.advisorName, overdue: 0, pending: 0, current: 0, owed: 0 };
      entry[a.paymentStatus] += 1;
      if (a.paymentStatus !== 'current') entry.owed += a.balance;
      byId.set(a.advisorId, entry);
    });
    return [...byId.entries()].sort((x, y) => x[1].name.localeCompare(y[1].name, 'es'));
  }, [affiliates]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return affiliates.filter((a) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'debt' ? a.paymentStatus !== 'current' : a.paymentStatus === statusFilter);
      const matchesAdvisor = !team || advisorFilter === 'all' || a.advisorId === advisorFilter;
      return matchesStatus && matchesAdvisor && (!term || a.affiliateName.toLowerCase().includes(term));
    });
  }, [affiliates, statusFilter, advisorFilter, search, team]);

  const startAction = (affiliateId: string) => {
    setEditingId(affiliateId);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent, affiliate: CollectionAffiliate) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const created = await collectionRepository.createAction(affiliate.affiliateId, {
        actionType: form.actionType,
        note: form.note,
        promisedDate: form.actionType === 'promise' ? form.promisedDate : undefined,
      });
      setAffiliates((current) =>
        current.map((a) =>
          a.affiliateId === affiliate.affiliateId
            ? {
                ...a,
                lastActionAt: created.createdAt,
                lastActionType: created.actionType,
                promisedDate: created.actionType === 'promise' ? created.promisedDate : a.promisedDate,
                actionsCount: a.actionsCount + 1,
              }
            : a
        )
      );
      if (detailId === affiliate.affiliateId) setHistory((current) => [created, ...current]);
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la gestión.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDetail = async (affiliateId: string) => {
    if (detailId === affiliateId) {
      openHistoryRef.current = null;
      setDetailId(null);
      return;
    }
    openHistoryRef.current = affiliateId;
    setDetailId(affiliateId);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const rows = await collectionRepository.listActions(affiliateId);
      if (openHistoryRef.current === affiliateId) setHistory(rows);
    } catch {
      if (openHistoryRef.current === affiliateId) setHistoryError('No se pudo cargar el historial.');
    } finally {
      if (openHistoryRef.current === affiliateId) setHistoryLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <h1 className="text-2xl font-black text-[#003366]">{title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {STATUSES.map((s) => (
            <span key={s} data-testid={`summary-${s}`}>
              <strong className="text-slate-900">{counts[s]}</strong> {COLLECTION_STATUS_LABELS[s]}
            </span>
          ))}
          <span data-testid="summary-debt">
            Deuda <strong className="text-slate-900">{formatCurrency(totalOwed)}</strong>
          </span>
        </div>
      </header>

      {team && advisors.length > 0 && (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 text-sm">
          {advisors.map(([id, s]) => (
            <li key={id} data-testid={`advisor-summary-${id}`} className="px-3 py-2 flex flex-wrap items-center justify-between gap-x-4">
              <span className="font-semibold text-slate-900">{s.name}</span>
              <span className="text-gray-600">
                En mora: {s.overdue} · Pendientes: {s.pending} · Al día: {s.current} · Deuda: <strong className="text-slate-900">{formatCurrency(s.owed)}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          aria-label="Buscar afiliado"
          placeholder="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        {team && (
          <select
            aria-label="Filtrar por asesor"
            value={advisorFilter}
            onChange={(e) => setAdvisorFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl bg-white"
          >
            <option value="all">Todos los asesores</option>
            {advisors.map(([id, s]) => (
              <option key={id} value={id}>{s.name}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 border border-slate-300 rounded-xl bg-white"
        >
          <option value="debt">Con deuda</option>
          <option value="all">Todos</option>
          <option value="overdue">En mora</option>
          <option value="pending">Pendientes</option>
          <option value="current">Al día</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando cobranzas…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : affiliates.length === 0 ? (
        <p className="text-gray-500">Todavía no hay afiliados para seguir.</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-500">No hay afiliados para ese filtro.</p>
      ) : (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {visible.map((a) => {
            const open = detailId === a.affiliateId;
            return (
              <li key={a.affiliateId} data-testid={`collection-${a.affiliateId}`} className="px-3 py-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-slate-900">{a.affiliateName}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLLECTION_STATUS_BADGE[a.paymentStatus]}`}>
                    {COLLECTION_STATUS_LABELS[a.paymentStatus]}
                  </span>
                  {team && <span className="text-sm text-gray-500">{a.advisorName}</span>}
                  {a.affiliatePhone && <span className="text-sm text-gray-500">{a.affiliatePhone}</span>}
                  {a.promisedDate && <span className="text-sm font-semibold text-gray-700">Promete pagar el {formatDateOnly(a.promisedDate)}</span>}
                  <span className="ml-auto font-black text-slate-900">{formatCurrency(a.balance)}</span>
                  <button
                    type="button"
                    onClick={() => startAction(a.affiliateId)}
                    className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
                  >
                    Registrar gestión
                  </button>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleDetail(a.affiliateId)}
                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100"
                  >
                    Detalle {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {editingId === a.affiliateId && (
                  <form onSubmit={(e) => handleSave(e, a)} className="rounded-lg bg-gray-50 p-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`action-type-${a.affiliateId}`} className="block text-xs font-semibold text-slate-700 mb-1">Tipo de gestión</label>
                        <select
                          id={`action-type-${a.affiliateId}`}
                          value={form.actionType}
                          onChange={(e) => setForm({ ...form, actionType: e.target.value as CollectionActionType })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                        >
                          {COLLECTION_ACTION_TYPES.map((t) => (
                            <option key={t} value={t}>{COLLECTION_ACTION_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                      {form.actionType === 'promise' && (
                        <div>
                          <label htmlFor={`promised-${a.affiliateId}`} className="block text-xs font-semibold text-slate-700 mb-1">Fecha prometida</label>
                          <input
                            id={`promised-${a.affiliateId}`}
                            type="date"
                            value={form.promisedDate}
                            onChange={(e) => setForm({ ...form, promisedDate: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor={`note-${a.affiliateId}`} className="block text-xs font-semibold text-slate-700 mb-1">Nota</label>
                      <textarea
                        id={`note-${a.affiliateId}`}
                        rows={2}
                        value={form.note}
                        onChange={(e) => setForm({ ...form, note: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
                    <div className="flex gap-2">
                      <Button type="submit" isLoading={saving}>Guardar gestión</Button>
                      <Button type="button" variant="outline" disabled={saving} onClick={() => setEditingId(null)}>Cancelar</Button>
                    </div>
                  </form>
                )}

                {open && (
                  <div className="rounded-lg bg-gray-50 p-3 space-y-2 text-sm">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
                      {a.planName && <span>{a.planName}</span>}
                      {a.paidThrough && <span>Cobertura hasta {formatTimestamp(a.paidThrough)}</span>}
                      <span>{gestionesLabel(a.actionsCount)}</span>
                      {a.lastActionType && a.lastActionAt && (
                        <span>Última: {COLLECTION_ACTION_LABELS[a.lastActionType]} ({formatTimestamp(a.lastActionAt)})</span>
                      )}
                    </div>
                    <div data-testid={`history-${a.affiliateId}`} className="space-y-1">
                      {historyError ? (
                        <p role="alert" className="text-red-600">{historyError}</p>
                      ) : historyLoading ? (
                        <p className="text-gray-500">Cargando historial…</p>
                      ) : history.length === 0 ? (
                        <p className="text-gray-500">Todavía no hay gestiones registradas.</p>
                      ) : (
                        <ul className="space-y-1">
                          {history.map((h) => (
                            <li key={h.id}>
                              <span className="font-semibold text-slate-900">{COLLECTION_ACTION_LABELS[h.actionType]}</span>
                              <span className="text-gray-500"> — {formatTimestamp(h.createdAt)}{h.createdByName ? ` · ${h.createdByName}` : ''}</span>
                              {h.promisedDate && <span className="text-gray-700"> · Promete pagar el {formatDateOnly(h.promisedDate)}</span>}
                              {h.note && <p className="text-gray-600">{h.note}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
