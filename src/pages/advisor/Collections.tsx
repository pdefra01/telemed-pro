import React, { useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
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
   * Supervisor / admin view: every advisor in scope, with an advisor filter and a
   * per-advisor summary, and no way to log actions (only the advisor does that).
   */
  readOnly?: boolean;
}

const EMPTY_FORM = { actionType: 'call' as CollectionActionType, note: '', promisedDate: '' };

/**
 * Collections of the affiliates an advisor brought: who owes what, and the
 * advisor's follow-up (calls, messages, visits, notes, promises to pay).
 */
export const Collections: React.FC<CollectionsProps> = ({ title = 'Cobranzas', readOnly = false }) => {
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

  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<CollectionAction[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
      const matchesAdvisor = !readOnly || advisorFilter === 'all' || a.advisorId === advisorFilter;
      return matchesStatus && matchesAdvisor && (!term || a.affiliateName.toLowerCase().includes(term));
    });
  }, [affiliates, statusFilter, advisorFilter, search, readOnly]);

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
      if (historyId === affiliate.affiliateId) setHistory((current) => [created, ...current]);
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la gestión.');
    } finally {
      setSaving(false);
    }
  };

  const toggleHistory = async (affiliateId: string) => {
    if (historyId === affiliateId) {
      setHistoryId(null);
      return;
    }
    setHistoryId(affiliateId);
    setHistory([]);
    setHistoryError(null);
    try {
      setHistory(await collectionRepository.listActions(affiliateId));
    } catch {
      setHistoryError('No se pudo cargar el historial.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-black text-[#003366]">{title}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['overdue', 'pending', 'current'] as CollectionStatus[]).map((s) => (
          <div key={s} data-testid={`summary-${s}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-black text-slate-900">{counts[s]}</p>
            <p className="text-xs font-semibold text-gray-500">{COLLECTION_STATUS_LABELS[s]}</p>
          </div>
        ))}
        <div data-testid="summary-debt" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-black text-slate-900">{formatCurrency(totalOwed)}</p>
          <p className="text-xs font-semibold text-gray-500">Deuda total</p>
        </div>
      </div>

      {readOnly && advisors.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {advisors.map(([id, s]) => (
            <div key={id} data-testid={`advisor-summary-${id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="font-bold text-slate-900">{s.name}</p>
              <p className="text-sm text-gray-600">
                En mora: {s.overdue} · Pendientes: {s.pending} · Al día: {s.current}
              </p>
              <p className="text-sm font-semibold text-slate-900">Deuda: {formatCurrency(s.owed)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          aria-label="Buscar afiliado"
          placeholder="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        {readOnly && (
          <select
            aria-label="Filtrar por asesor"
            value={advisorFilter}
            onChange={(e) => setAdvisorFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-300 rounded-xl bg-white"
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
          className="px-4 py-2.5 border border-slate-300 rounded-xl bg-white"
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
        <ul className="space-y-3">
          {visible.map((a) => (
            <li
              key={a.affiliateId}
              data-testid={`collection-${a.affiliateId}`}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{a.affiliateName}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLLECTION_STATUS_BADGE[a.paymentStatus]}`}>
                      {COLLECTION_STATUS_LABELS[a.paymentStatus]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                    {readOnly && <span className="font-semibold text-gray-700">{a.advisorName}</span>}
                    {a.affiliatePhone && <span className="inline-flex items-center gap-1"><Phone size={14} />{a.affiliatePhone}</span>}
                    {a.planName && <span>{a.planName}</span>}
                    {a.paidThrough && <span>Cobertura hasta {formatTimestamp(a.paidThrough)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <span>{gestionesLabel(a.actionsCount)}</span>
                    {a.lastActionType && a.lastActionAt && (
                      <span>Última: {COLLECTION_ACTION_LABELS[a.lastActionType]} ({formatTimestamp(a.lastActionAt)})</span>
                    )}
                    {a.promisedDate && <span className="font-semibold">Promete pagar el {formatDateOnly(a.promisedDate)}</span>}
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2">
                  <p className="text-xl font-black text-slate-900">{formatCurrency(a.balance)}</p>
                  <div className="flex gap-2 flex-wrap">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => startAction(a.affiliateId)}
                        className="px-3 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
                      >
                        Registrar gestión
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleHistory(a.affiliateId)}
                      className="px-3 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Ver historial
                    </button>
                  </div>
                </div>
              </div>

              {!readOnly && editingId === a.affiliateId && (
                <form onSubmit={(e) => handleSave(e, a)} className="rounded-xl bg-gray-50 p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`action-type-${a.affiliateId}`} className="block text-xs font-semibold text-slate-700 mb-1.5">Tipo de gestión</label>
                      <select
                        id={`action-type-${a.affiliateId}`}
                        value={form.actionType}
                        onChange={(e) => setForm({ ...form, actionType: e.target.value as CollectionActionType })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        {COLLECTION_ACTION_TYPES.map((t) => (
                          <option key={t} value={t}>{COLLECTION_ACTION_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    {form.actionType === 'promise' && (
                      <div>
                        <label htmlFor={`promised-${a.affiliateId}`} className="block text-xs font-semibold text-slate-700 mb-1.5">Fecha prometida</label>
                        <input
                          id={`promised-${a.affiliateId}`}
                          type="date"
                          value={form.promisedDate}
                          onChange={(e) => setForm({ ...form, promisedDate: e.target.value })}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`note-${a.affiliateId}`} className="block text-xs font-semibold text-slate-700 mb-1.5">Nota</label>
                    <textarea
                      id={`note-${a.affiliateId}`}
                      rows={2}
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="submit" isLoading={saving}>Guardar gestión</Button>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => setEditingId(null)}>Cancelar</Button>
                  </div>
                </form>
              )}

              {historyId === a.affiliateId && (
                <div data-testid={`history-${a.affiliateId}`} className="rounded-xl bg-gray-50 p-4 space-y-2">
                  {historyError ? (
                    <p role="alert" className="text-sm text-red-600">{historyError}</p>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-gray-500">Todavía no hay gestiones registradas.</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((h) => (
                        <li key={h.id} className="text-sm">
                          <span className="font-semibold text-slate-900">{COLLECTION_ACTION_LABELS[h.actionType]}</span>
                          <span className="text-gray-500"> — {formatTimestamp(h.createdAt)}{h.createdByName ? ` · ${h.createdByName}` : ''}</span>
                          {h.promisedDate && <span className="text-gray-700"> · Promete pagar el {formatDateOnly(h.promisedDate)}</span>}
                          {h.note && <p className="text-gray-600">{h.note}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
