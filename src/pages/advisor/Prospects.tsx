import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, Mail, Plus, Trash2, PhoneCall } from 'lucide-react';
import { Prospect, ProspectStatus, User } from '../../types';
import { PROSPECT_PAGE_SIZE, prospectRepository } from '../../repositories/ProspectRepository';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PROSPECT_STATUSES, PROSPECT_STATUS_BADGE, PROSPECT_STATUS_LABELS } from '../../utils/prospectStatus';
import { MonthlyProgress } from './MonthlyProgress';

interface ProspectsProps {
  user: User;
}

const EMPTY_FORM = { fullName: '', phone: '', email: '', notes: '' };

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-AR') : null);

/** The advisor's own prospect database: add, follow up and close prospects. */
export const Prospects: React.FC<ProspectsProps> = ({ user }) => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  // rows read from the server so far: the offset of the next page
  const loadedFromServer = useRef(0);
  const filtering = statusFilter !== 'all' || search.trim() !== '';

  useEffect(() => {
    let cancelled = false;
    prospectRepository
      .list({ limit: PROSPECT_PAGE_SIZE, offset: 0 })
      .then((rows) => {
        if (cancelled) return;
        loadedFromServer.current = rows.length;
        setProspects(rows);
        setHasMore(rows.length === PROSPECT_PAGE_SIZE);
      })
      .catch(() => { if (!cancelled) setLoadError('No se pudieron cargar los prospectos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(false);
    try {
      const rows = await prospectRepository.list({ limit: PROSPECT_PAGE_SIZE, offset: loadedFromServer.current });
      loadedFromServer.current += rows.length;
      // a prospect created meanwhile shifts the pages: skip the ones already listed
      setProspects((current) => {
        const known = new Set(current.map((p) => p.id));
        return [...current, ...rows.filter((p) => !known.has(p.id))];
      });
      setHasMore(rows.length === PROSPECT_PAGE_SIZE);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return prospects.filter(
      (p) =>
        (statusFilter === 'all' || p.status === statusFilter) &&
        (!term || p.fullName.toLowerCase().includes(term))
    );
  }, [prospects, statusFilter, search]);

  const replace = (updated: Prospect) =>
    setProspects((current) => current.map((p) => (p.id === updated.id ? updated : p)));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await prospectRepository.create(user.id, form);
      loadedFromServer.current += 1;
      setProspects((current) => [created, ...current]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch {
      setFormError('No se pudo guardar el prospecto.');
    } finally {
      setSaving(false);
    }
  };

  const run = async (action: () => Promise<void>, message: string) => {
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(message);
    }
  };

  const handleStatusChange = (p: Prospect, status: ProspectStatus) =>
    run(async () => {
      // Moving a prospect to "contacted" is itself a contact: stamp it.
      const patch = status === 'contacted' ? { status, lastContactAt: new Date().toISOString() } : { status };
      replace(await prospectRepository.update(p.id, patch));
    }, 'No se pudo actualizar el prospecto.');

  const handleContact = (p: Prospect) =>
    run(async () => {
      replace(await prospectRepository.update(p.id, { lastContactAt: new Date().toISOString() }));
    }, 'No se pudo registrar el contacto.');

  const handleDelete = (p: Prospect) => {
    if (!window.confirm(`¿Eliminar a ${p.fullName}?`)) return;
    return run(async () => {
      await prospectRepository.remove(p.id);
      loadedFromServer.current = Math.max(0, loadedFromServer.current - 1);
      setProspects((current) => current.filter((x) => x.id !== p.id));
    }, 'No se pudo eliminar el prospecto.');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#003366]">Mis prospectos</h1>
          <p className="text-sm text-gray-500">Cargá y seguí a las personas que todavía no se afiliaron.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 hover:bg-teal-700"
        >
          <Plus size={18} /> Nuevo prospecto
        </button>
      </div>

      <MonthlyProgress />

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <Input
            label="Nombre y apellido"
            name="prospect-name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            error={formError === 'El nombre es obligatorio.' ? formError : undefined}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Teléfono"
              name="prospect-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              label="Email"
              name="prospect-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="prospect-notes" className="block text-xs font-semibold text-slate-700 mb-1.5 pl-1">Notas</label>
            <textarea
              id="prospect-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
            />
          </div>
          {formError && formError !== 'El nombre es obligatorio.' && (
            <p role="alert" className="text-sm text-red-600">{formError}</p>
          )}
          <Button type="submit" isLoading={saving}>Guardar prospecto</Button>
        </form>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          aria-label="Buscar prospecto"
          placeholder="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | 'all')}
          className="px-4 py-2.5 border border-slate-300 rounded-xl bg-white"
        >
          <option value="all">Todos los estados</option>
          {PROSPECT_STATUSES.map((s) => (
            <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}

      {loading ? (
        <p className="text-gray-500">Cargando prospectos…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : prospects.length === 0 ? (
        <p className="text-gray-500">Todavía no cargaste prospectos. Usá “Nuevo prospecto” para empezar.</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-500">No hay prospectos para ese filtro.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <li
              key={p.id}
              data-testid={`prospect-${p.id}`}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">{p.fullName}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PROSPECT_STATUS_BADGE[p.status]}`}>
                    {PROSPECT_STATUS_LABELS[p.status]}
                  </span>
                  {p.source === 'lead_survey' && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Desde encuesta</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  {p.phone && <span className="inline-flex items-center gap-1"><Phone size={14} />{p.phone}</span>}
                  {p.email && <span className="inline-flex items-center gap-1"><Mail size={14} />{p.email}</span>}
                  <span>{formatDate(p.lastContactAt) ? `Último contacto: ${formatDate(p.lastContactAt)}` : 'Sin contacto todavía'}</span>
                </div>
                {p.notes && <p className="text-sm text-gray-600">{p.notes}</p>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  aria-label="Estado"
                  value={p.status}
                  onChange={(e) => handleStatusChange(p, e.target.value as ProspectStatus)}
                  className="px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm"
                >
                  {PROSPECT_STATUSES.map((s) => (
                    <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleContact(p)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <PhoneCall size={14} /> Registrar contacto
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  aria-label="Eliminar"
                  className="p-2 rounded-xl text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loading && !loadError && hasMore && (
        <div className="text-center space-y-2">
          {filtering && <p className="text-xs text-gray-500">La búsqueda y el filtro buscan solo entre los prospectos cargados.</p>}
          {moreError && <p role="alert" className="text-xs text-red-600">No se pudieron cargar más prospectos.</p>}
          <Button type="button" variant="outline" onClick={loadMore} isLoading={loadingMore}>Cargar más</Button>
        </div>
      )}
    </div>
  );
};
