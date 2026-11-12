import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Prospect, ProspectStatus, User } from '../../types';
import { PROSPECT_PAGE_SIZE, ProspectInput, prospectRepository } from '../../repositories/ProspectRepository';
import { TeamAdvisor, supervisorRepository } from '../../repositories/SupervisorRepository';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PROSPECT_STATUSES, PROSPECT_STATUS_BADGE, PROSPECT_STATUS_LABELS } from '../../utils/prospectStatus';
import { MonthlyProgress } from './MonthlyProgress';

interface ProspectsProps {
  user: User;
  title?: string;
}

type Counts = Record<ProspectStatus, number>;

const EMPTY_FORM: Required<ProspectInput> = { fullName: '', phone: '', email: '', notes: '' };
const NAME_REQUIRED = 'El nombre es obligatorio.';
const ADVISOR_REQUIRED = 'Elegí el asesor.';

const zeroCounts = (): Counts => Object.fromEntries(PROSPECT_STATUSES.map((s) => [s, 0])) as Counts;
const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-AR') : null);
const selectClass = 'px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm';

/** Name, phone, email and notes: shared by the create and the edit form. */
const ProspectFields: React.FC<{
  idPrefix: string;
  value: Required<ProspectInput>;
  onChange: (value: Required<ProspectInput>) => void;
  nameError?: string;
}> = ({ idPrefix, value, onChange, nameError }) => (
  <>
    <Input
      label="Nombre y apellido"
      name={`${idPrefix}-name`}
      value={value.fullName}
      onChange={(e) => onChange({ ...value, fullName: e.target.value })}
      error={nameError}
    />
    <div className="grid gap-3 sm:grid-cols-2">
      <Input label="Teléfono" name={`${idPrefix}-phone`} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
      <Input label="Email" name={`${idPrefix}-email`} type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
    </div>
    <div>
      <label htmlFor={`${idPrefix}-notes`} className="block text-xs font-semibold text-slate-700 mb-1.5 pl-1">Notas</label>
      <textarea
        id={`${idPrefix}-notes`}
        rows={2}
        value={value.notes}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
        className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
      />
    </div>
  </>
);

/**
 * CRM prospects. An advisor manages their own; a supervisor (their team) and an
 * admin (everyone) also see the owning advisor, create prospects for an advisor
 * and reassign them. Row-level security decides the scope; only the advisor deletes.
 */
export const Prospects: React.FC<ProspectsProps> = ({ user, title }) => {
  const team = user.role === 'supervisor' || user.role === 'admin';
  const canDelete = user.role === 'advisor';

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [counts, setCounts] = useState<Counts>(zeroCounts);
  const [advisors, setAdvisors] = useState<TeamAdvisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advisorsError, setAdvisorsError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formAdvisor, setFormAdvisor] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  // rows read from the server so far: the offset of the next page
  const loadedFromServer = useRef(0);
  const filtering = advisorFilter !== 'all' || statusFilter !== 'all' || search.trim() !== '';

  useEffect(() => {
    let cancelled = false;
    // The header counts every prospect in scope, not just the loaded page. A supervisor
    // picks among their own team only; the admin among every advisor. Without that list
    // the prospects still show (each row carries its advisor's name).
    Promise.all([
      prospectRepository.list({ limit: PROSPECT_PAGE_SIZE, offset: 0 }),
      prospectRepository.countByStatus(),
      team
        ? supervisorRepository
            .listAdvisors(user.role === 'supervisor' ? { supervisorId: user.id } : {})
            .catch(() => {
              if (!cancelled) setAdvisorsError(true);
              return [] as TeamAdvisor[];
            })
        : Promise.resolve([] as TeamAdvisor[]),
    ])
      .then(([rows, totals, teamAdvisors]) => {
        if (cancelled) return;
        loadedFromServer.current = rows.length;
        setProspects(rows);
        setHasMore(rows.length === PROSPECT_PAGE_SIZE);
        setCounts(totals);
        setAdvisors(teamAdvisors);
      })
      .catch(() => { if (!cancelled) setLoadError('No se pudieron cargar los prospectos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [team, user.id, user.role]);

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
        (advisorFilter === 'all' || p.advisorId === advisorFilter) &&
        (statusFilter === 'all' || p.status === statusFilter) &&
        (!term || p.fullName.toLowerCase().includes(term))
    );
  }, [prospects, advisorFilter, statusFilter, search]);

  const moveCount = (from: ProspectStatus | null, to: ProspectStatus | null) =>
    setCounts((current) => {
      const next = { ...current };
      if (from) next[from] = Math.max(0, next[from] - 1);
      if (to) next[to] += 1;
      return next;
    });

  const replace = (before: Prospect, updated: Prospect) => {
    setProspects((current) => current.map((p) => (p.id === updated.id ? updated : p)));
    if (before.status !== updated.status) moveCount(before.status, updated.status);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setFormError(NAME_REQUIRED);
      return;
    }
    if (team && !formAdvisor) {
      setFormError(ADVISOR_REQUIRED);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await prospectRepository.create(team ? formAdvisor : user.id, form);
      loadedFromServer.current += 1;
      setProspects((current) => [created, ...current]);
      moveCount(null, created.status);
      setForm(EMPTY_FORM);
      setFormAdvisor('');
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
      replace(p, await prospectRepository.update(p.id, patch));
    }, 'No se pudo actualizar el prospecto.');

  const handleContact = (p: Prospect) =>
    run(async () => {
      replace(p, await prospectRepository.update(p.id, { lastContactAt: new Date().toISOString() }));
    }, 'No se pudo registrar el contacto.');

  const handleReassign = (p: Prospect, advisorId: string) =>
    run(async () => {
      replace(p, await prospectRepository.update(p.id, { advisorId }));
    }, 'No se pudo reasignar el prospecto.');

  const startEdit = (p: Prospect) => {
    setEditingId(p.id);
    setEditError(null);
    setEditForm({ fullName: p.fullName, phone: p.phone ?? '', email: p.email ?? '', notes: p.notes ?? '' });
  };

  const handleEdit = async (e: React.FormEvent, p: Prospect) => {
    e.preventDefault();
    if (!editForm.fullName.trim()) {
      setEditError(NAME_REQUIRED);
      return;
    }
    setEditError(null);
    try {
      replace(p, await prospectRepository.update(p.id, editForm));
      setEditingId(null);
    } catch {
      setEditError('No se pudo guardar el prospecto.');
    }
  };

  const handleDelete = (p: Prospect) => {
    if (!window.confirm(`¿Eliminar a ${p.fullName}?`)) return;
    return run(async () => {
      await prospectRepository.remove(p.id);
      loadedFromServer.current = Math.max(0, loadedFromServer.current - 1);
      setProspects((current) => current.filter((x) => x.id !== p.id));
      moveCount(p.status, null);
    }, 'No se pudo eliminar el prospecto.');
  };

  const advisorName = (p: Prospect) => p.advisorName ?? advisors.find((a) => a.id === p.advisorId)?.name ?? 'Asesor sin nombre';

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-[#003366]">{title ?? (team ? 'Prospectos del equipo' : 'Mis prospectos')}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            {PROSPECT_STATUSES.map((s) => (
              <span key={s} data-testid={`summary-${s}`}>
                <strong className="text-slate-900">{counts[s]}</strong> {PROSPECT_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus size={16} /> Nuevo prospecto
        </button>
      </header>

      {!team && <MonthlyProgress />}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          {team && (
            <div>
              <label htmlFor="prospect-advisor" className="block text-xs font-semibold text-slate-700 mb-1.5 pl-1">Asesor</label>
              <select id="prospect-advisor" value={formAdvisor} onChange={(e) => setFormAdvisor(e.target.value)} className={`w-full ${selectClass}`}>
                <option value="">Elegí un asesor</option>
                {advisors.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <ProspectFields
            idPrefix="prospect"
            value={form}
            onChange={setForm}
            nameError={formError === NAME_REQUIRED ? formError : undefined}
          />
          {formError && formError !== NAME_REQUIRED && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <Button type="submit" isLoading={saving}>Guardar prospecto</Button>
        </form>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          aria-label="Buscar prospecto"
          placeholder="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        {team && (
          <select aria-label="Filtrar por asesor" value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className={selectClass}>
            <option value="all">Todos los asesores</option>
            {advisors.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | 'all')}
          className={selectClass}
        >
          <option value="all">Todos los estados</option>
          {PROSPECT_STATUSES.map((s) => (
            <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
      {advisorsError && <p className="text-sm text-amber-700">No se pudo cargar la lista de asesores.</p>}

      {loading ? (
        <p className="text-gray-500">Cargando prospectos…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : prospects.length === 0 ? (
        <p className="text-gray-500">{team ? 'Todavía no hay prospectos en el equipo.' : 'Todavía no cargaste prospectos.'}</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-500">No hay prospectos para ese filtro.</p>
      ) : (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {visible.map((p) => {
            const open = openId === p.id;
            const others = advisors.filter((a) => a.id !== p.advisorId);
            return (
              <li key={p.id} data-testid={`prospect-${p.id}`} className="px-3 py-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-slate-900">{p.fullName}</span>
                  {p.source === 'lead_survey' && <span className="text-xs text-indigo-700">Desde encuesta</span>}
                  {team && <span className="text-sm text-gray-500">{advisorName(p)}</span>}
                  {p.phone && <span className="text-sm text-gray-500">{p.phone}</span>}
                  <span className="text-xs text-gray-400">
                    {formatDate(p.lastContactAt) ? `Últ. contacto ${formatDate(p.lastContactAt)}` : 'Sin contacto'}
                  </span>
                  <select
                    aria-label="Estado"
                    value={p.status}
                    onChange={(e) => handleStatusChange(p, e.target.value as ProspectStatus)}
                    className={`ml-auto px-2 py-1 rounded-lg text-xs font-semibold border-0 ${PROSPECT_STATUS_BADGE[p.status]}`}
                  >
                    {PROSPECT_STATUSES.map((s) => (
                      <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => { setOpenId(open ? null : p.id); setEditingId(null); }}
                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100"
                  >
                    Detalle {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {open && editingId !== p.id && (
                  <div className="rounded-lg bg-gray-50 p-3 space-y-2 text-sm">
                    {(p.email || p.notes) && (
                      <div className="space-y-1 text-gray-600">
                        {p.email && <p>{p.email}</p>}
                        {p.notes && <p>{p.notes}</p>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => handleContact(p)} className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-white">
                        Registrar contacto
                      </button>
                      <button type="button" onClick={() => startEdit(p)} className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-white">
                        Editar
                      </button>
                      {team && (
                        <select
                          aria-label="Reasignar a"
                          value=""
                          onChange={(e) => e.target.value && handleReassign(p, e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded-lg bg-white text-xs"
                        >
                          <option value="">Reasignar a…</option>
                          {others.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => handleDelete(p)} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {open && editingId === p.id && (
                  <form onSubmit={(e) => handleEdit(e, p)} className="rounded-lg bg-gray-50 p-3 space-y-3">
                    <ProspectFields
                      idPrefix={`edit-${p.id}`}
                      value={editForm}
                      onChange={setEditForm}
                      nameError={editError === NAME_REQUIRED ? editError : undefined}
                    />
                    {editError && editError !== NAME_REQUIRED && <p role="alert" className="text-sm text-red-600">{editError}</p>}
                    <div className="flex gap-2">
                      <Button type="submit">Guardar cambios</Button>
                      <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
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
