import React, { useEffect, useMemo, useState } from 'react';
import { Phone, Mail } from 'lucide-react';
import { Prospect, ProspectStatus } from '../../types';
import { prospectRepository } from '../../repositories/ProspectRepository';
import { PROSPECT_STATUSES, PROSPECT_STATUS_BADGE, PROSPECT_STATUS_LABELS } from '../../utils/prospectStatus';

interface TeamProspectsProps {
  title?: string;
}

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-AR') : null);

/**
 * Read-only prospect overview. Row-level security decides the scope: a
 * supervisor gets the prospects of their team, an admin gets all of them.
 */
export const TeamProspects: React.FC<TeamProspectsProps> = ({ title = 'Prospectos del equipo' }) => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    prospectRepository
      .list()
      .then((rows) => { if (!cancelled) setProspects(rows); })
      .catch(() => { if (!cancelled) setLoadError('No se pudieron cargar los prospectos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const advisors = useMemo(() => {
    const byId = new Map<string, string>();
    prospects.forEach((p) => byId.set(p.advisorId, p.advisorName ?? 'Asesor sin nombre'));
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [prospects]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(PROSPECT_STATUSES.map((s) => [s, 0])) as Record<ProspectStatus, number>;
    prospects.forEach((p) => { result[p.status] += 1; });
    return result;
  }, [prospects]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return prospects.filter(
      (p) =>
        (advisorFilter === 'all' || p.advisorId === advisorFilter) &&
        (statusFilter === 'all' || p.status === statusFilter) &&
        (!term || p.fullName.toLowerCase().includes(term))
    );
  }, [prospects, advisorFilter, statusFilter, search]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-black text-[#003366]">{title}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {PROSPECT_STATUSES.map((s) => (
          <div key={s} data-testid={`summary-${s}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-black text-slate-900">{counts[s]}</p>
            <p className="text-xs font-semibold text-gray-500">{PROSPECT_STATUS_LABELS[s]}</p>
          </div>
        ))}
      </div>

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
          aria-label="Filtrar por asesor"
          value={advisorFilter}
          onChange={(e) => setAdvisorFilter(e.target.value)}
          className="px-4 py-2.5 border border-slate-300 rounded-xl bg-white"
        >
          <option value="all">Todos los asesores</option>
          {advisors.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
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

      {loading ? (
        <p className="text-gray-500">Cargando prospectos…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : prospects.length === 0 ? (
        <p className="text-gray-500">Todavía no hay prospectos en el equipo.</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-500">No hay prospectos para ese filtro.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <li
              key={p.id}
              data-testid={`team-prospect-${p.id}`}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-1"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900">{p.fullName}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PROSPECT_STATUS_BADGE[p.status]}`}>
                  {PROSPECT_STATUS_LABELS[p.status]}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                <span className="font-semibold text-gray-700">{p.advisorName ?? 'Asesor sin nombre'}</span>
                {p.phone && <span className="inline-flex items-center gap-1"><Phone size={14} />{p.phone}</span>}
                {p.email && <span className="inline-flex items-center gap-1"><Mail size={14} />{p.email}</span>}
                <span>{formatDate(p.lastContactAt) ? `Último contacto: ${formatDate(p.lastContactAt)}` : 'Sin contacto todavía'}</span>
              </div>
              {p.notes && <p className="text-sm text-gray-600">{p.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
