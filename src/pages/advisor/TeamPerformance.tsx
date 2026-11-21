import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AdvisorMonthMetrics } from '../../types';
import { advisorPerformanceRepository } from '../../repositories/AdvisorPerformanceRepository';
import { Supervisor, supervisorRepository } from '../../repositories/SupervisorRepository';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { TeamActivityTrends } from './TeamActivityTrends';
import { formatMonthLabel, monthStart, shiftMonth } from '../../utils/month';
import { conversionRate, formatCurrency, progressPercent } from '../../utils/performance';

interface TeamPerformanceProps {
  title?: string;
  /** Admin only: lets the user narrow the cards and the table to one supervisor's team. */
  showSupervisorFilter?: boolean;
}

/** 'all' = every advisor, 'none' = advisors without a supervisor, otherwise a supervisor id. */
type SupervisorFilter = 'all' | 'none' | string;

const ALL = 'all';
const NONE = 'none';

const inScope = (row: AdvisorMonthMetrics, filter: SupervisorFilter) =>
  filter === ALL || (filter === NONE ? !row.supervisorId : row.supervisorId === filter);

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/** "4 de 6" with a bar when there is a goal; the bare figure and "sin meta" otherwise. */
const Against: React.FC<{ testId: string; value: number; goal?: number; format: (n: number) => string; label: string }> = ({
  testId, value, goal, format, label,
}) => (
  <div data-testid={testId} className="min-w-28">
    {goal !== undefined ? (
      <>
        <span className="font-semibold text-slate-900">{format(value)} de {format(goal)}</span>
        <div className="mt-1"><ProgressBar percent={progressPercent(value, goal)} label={label} /></div>
      </>
    ) : (
      <>
        <span className="font-semibold text-slate-900">{format(value)}</span>
        <span className="ml-1 text-xs text-gray-500">sin meta</span>
      </>
    )}
  </div>
);

/** One headline figure of the month; `goal` adds "de N" and a progress bar. */
const MetricCard: React.FC<{ testId: string; label: string; value: string; goal?: string; percent?: number; hint?: string }> = ({
  testId, label, value, goal, percent, hint,
}) => (
  <div data-testid={testId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
    <p className="text-xs font-semibold text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-black text-slate-900">
      {value}
      {goal !== undefined && <span className="text-base font-semibold text-gray-500"> de {goal}</span>}
    </p>
    {goal !== undefined && percent !== undefined && (
      <div className="mt-2"><ProgressBar percent={percent} label={`Avance de ${label.toLowerCase()}`} /></div>
    )}
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

/**
 * Team goals and metrics for one month. The database scopes the rows: a
 * supervisor sees (and sets goals for) their team, an admin sees every advisor.
 */
export const TeamPerformance: React.FC<TeamPerformanceProps> = ({ title = 'Metas y métricas', showSupervisorFilter = false }) => {
  const [month, setMonth] = useState(monthStart(new Date()));
  const [allRows, setRows] = useState<AdvisorMonthMetrics[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorsError, setSupervisorsError] = useState<string | null>(null);
  const [supervisorFilter, setSupervisorFilter] = useState<SupervisorFilter>(ALL);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ affiliates: '', revenue: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setEditingId(null);
    advisorPerformanceRepository
      .getMonthlyMetrics(month)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setLoadError('No se pudieron cargar las métricas del equipo.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  useEffect(() => {
    if (!showSupervisorFilter) return;
    let cancelled = false;
    supervisorRepository
      .listSupervisors()
      .then((data) => { if (!cancelled) setSupervisors(data); })
      .catch(() => { if (!cancelled) setSupervisorsError('No se pudieron cargar los supervisores.'); });
    return () => { cancelled = true; };
  }, [showSupervisorFilter]);

  const rows = allRows.filter((r) => inScope(r, supervisorFilter));
  const editing = rows.find((r) => r.advisorId === editingId) ?? null;

  const startEditing = (row: AdvisorMonthMetrics) => {
    setEditingId(row.advisorId);
    setForm({
      affiliates: row.goalAffiliates !== undefined ? String(row.goalAffiliates) : '',
      revenue: row.goalRevenue !== undefined ? String(row.goalRevenue) : '',
    });
    setFormError(null);
  };

  const patchRow = (advisorId: string, patch: Partial<AdvisorMonthMetrics>) =>
    setRows((current) => current.map((r) => (r.advisorId === advisorId ? { ...r, ...patch } : r)));

  const toNumberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const targetAffiliates = toNumberOrNull(form.affiliates);
    const targetRevenue = toNumberOrNull(form.revenue);

    setSaving(true);
    setFormError(null);
    try {
      await advisorPerformanceRepository.saveGoal(editing.advisorId, month, { targetAffiliates, targetRevenue });
      patchRow(editing.advisorId, {
        goalAffiliates: targetAffiliates ?? undefined,
        goalRevenue: targetRevenue ?? undefined,
      });
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la meta.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await advisorPerformanceRepository.deleteGoal(editing.advisorId, month);
      patchRow(editing.advisorId, { goalAffiliates: undefined, goalRevenue: undefined });
      setEditingId(null);
    } catch {
      setFormError('No se pudo quitar la meta.');
    } finally {
      setSaving(false);
    }
  };

  const goalAffiliatesTotal = rows.some((r) => r.goalAffiliates !== undefined)
    ? sum(rows.map((r) => r.goalAffiliates ?? 0))
    : undefined;
  const goalRevenueTotal = rows.some((r) => r.goalRevenue !== undefined)
    ? sum(rows.map((r) => r.goalRevenue ?? 0))
    : undefined;
  const affiliatesTotal = sum(rows.map((r) => r.affiliatesSold));
  const revenueTotal = sum(rows.map((r) => r.revenue));
  const teamConversion = conversionRate(sum(rows.map((r) => r.prospectsAffiliated)), sum(rows.map((r) => r.prospectsLoaded)));
  const emptyMessage = allRows.length > 0 && supervisorFilter !== ALL
    ? (supervisorFilter === NONE ? 'Todos los asesores tienen supervisor.' : 'Este supervisor no tiene asesores asignados.')
    : 'No hay asesores para mostrar.';

  return (
    <div className="max-w-6xl mx-auto space-y-6 text-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-[#003366]">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {showSupervisorFilter && (
            <select
              aria-label="Supervisor"
              value={supervisorFilter}
              onChange={(e) => { setSupervisorFilter(e.target.value); setEditingId(null); }}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-slate-900"
            >
              <option value={ALL}>Todos los supervisores</option>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={NONE}>Sin supervisor</option>
            </select>
          )}
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700 capitalize min-w-32 text-center">{formatMonthLabel(month)}</span>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {supervisorsError && <p role="alert" className="text-sm text-red-600">{supervisorsError}</p>}

      {loading ? (
        <p className="text-gray-500">Cargando métricas…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">{emptyMessage}</p>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <MetricCard testId="card-advisors" label="Asesores" value={String(rows.length)} />
            <MetricCard
              testId="card-affiliates"
              label="Afiliados"
              value={String(affiliatesTotal)}
              goal={goalAffiliatesTotal !== undefined ? String(goalAffiliatesTotal) : undefined}
              percent={progressPercent(affiliatesTotal, goalAffiliatesTotal)}
              hint={goalAffiliatesTotal === undefined ? 'sin meta' : undefined}
            />
            <MetricCard
              testId="card-revenue"
              label="Ingresos"
              value={formatCurrency(revenueTotal)}
              goal={goalRevenueTotal !== undefined ? formatCurrency(goalRevenueTotal) : undefined}
              percent={progressPercent(revenueTotal, goalRevenueTotal)}
              hint={goalRevenueTotal === undefined ? 'sin meta' : 'cuota mensual'}
            />
            <MetricCard testId="card-unconfirmed" label="Pendientes de pago" value={String(sum(rows.map((r) => r.affiliatesUnconfirmed)))} />
            <MetricCard testId="card-prospects" label="Prospectos cargados" value={String(sum(rows.map((r) => r.prospectsLoaded)))} />
            <MetricCard testId="card-conversion" label="Conversión" value={teamConversion === null ? '—' : `${teamConversion}%`} />
            <MetricCard testId="card-stale" label="Sin seguimiento (7+ días)" value={String(sum(rows.map((r) => r.prospectsStale)))} />
            <MetricCard testId="card-links" label="Links compartidos" value={String(sum(rows.map((r) => r.linksShared)))} />
          </div>

          <TeamActivityTrends month={month} advisors={rows} />

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                  <th className="p-3">Asesor</th>
                  <th className="p-3">Afiliados</th>
                  <th className="p-3">Ingresos (cuota mensual)</th>
                  <th className="p-3">Pendientes de pago</th>
                  <th className="p-3">Prospectos cargados</th>
                  <th className="p-3">Conversión</th>
                  <th className="p-3">Sin seguimiento (7+ días)</th>
                  <th className="p-3">Links compartidos</th>
                  <th className="p-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const rate = conversionRate(r.prospectsAffiliated, r.prospectsLoaded);
                  return (
                    <tr key={r.advisorId} data-testid={`perf-${r.advisorId}`}>
                      <td className="p-3 font-semibold text-slate-900">{r.advisorName}</td>
                      <td className="p-3">
                        <Against testId={`sold-${r.advisorId}`} value={r.affiliatesSold} goal={r.goalAffiliates} format={String} label={`Avance de afiliados de ${r.advisorName}`} />
                      </td>
                      <td className="p-3">
                        <Against testId={`revenue-${r.advisorId}`} value={r.revenue} goal={r.goalRevenue} format={formatCurrency} label={`Avance de ingresos de ${r.advisorName}`} />
                      </td>
                      <td className="p-3" data-testid={`unconfirmed-${r.advisorId}`}>{r.affiliatesUnconfirmed}</td>
                      <td className="p-3">{r.prospectsLoaded}</td>
                      <td className="p-3" data-testid={`conversion-${r.advisorId}`}>{rate === null ? '—' : `${rate}%`}</td>
                      <td className="p-3" data-testid={`stale-${r.advisorId}`}>{r.prospectsStale}</td>
                      <td className="p-3" data-testid={`links-${r.advisorId}`}>{r.linksShared}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          aria-label={`Editar meta de ${r.advisorName}`}
                          onClick={() => startEditing(r)}
                          className="px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Editar meta
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr data-testid="perf-total" className="border-t-2 border-gray-200 font-bold text-slate-900">
                  <td className="p-3">Total</td>
                  <td className="p-3">
                    {sum(rows.map((r) => r.affiliatesSold))}
                    {goalAffiliatesTotal !== undefined && ` de ${goalAffiliatesTotal}`}
                  </td>
                  <td className="p-3">
                    {formatCurrency(sum(rows.map((r) => r.revenue)))}
                    {goalRevenueTotal !== undefined && ` de ${formatCurrency(goalRevenueTotal)}`}
                  </td>
                  <td className="p-3">{sum(rows.map((r) => r.affiliatesUnconfirmed))}</td>
                  <td className="p-3">{sum(rows.map((r) => r.prospectsLoaded))}</td>
                  <td className="p-3" />
                  <td className="p-3">{sum(rows.map((r) => r.prospectsStale))}</td>
                  <td className="p-3">{sum(rows.map((r) => r.linksShared))}</td>
                  <td className="p-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          {editing && (
            <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-slate-900">
                Meta de {editing.advisorName} — <span className="capitalize">{formatMonthLabel(month)}</span>
              </h2>
              <p className="text-sm text-gray-500">Completá una o las dos metas; dejá vacía la que no aplique.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Meta de afiliados"
                  name="goal-affiliates"
                  type="number"
                  min={0}
                  step={1}
                  value={form.affiliates}
                  onChange={(e) => setForm({ ...form, affiliates: e.target.value })}
                />
                <Input
                  label="Meta de ingresos"
                  name="goal-revenue"
                  type="number"
                  min={0}
                  step={1}
                  value={form.revenue}
                  onChange={(e) => setForm({ ...form, revenue: e.target.value })}
                />
              </div>
              {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button type="submit" isLoading={saving}>Guardar meta</Button>
                {(editing.goalAffiliates !== undefined || editing.goalRevenue !== undefined) && (
                  <Button type="button" variant="danger" disabled={saving} onClick={handleRemove}>Quitar meta</Button>
                )}
                <Button type="button" variant="outline" disabled={saving} onClick={() => setEditingId(null)}>Cancelar</Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};
