import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AdvisorDayActivity, AdvisorMonthMetrics } from '../../types';
import { advisorPerformanceRepository } from '../../repositories/AdvisorPerformanceRepository';
import { buildDailySeries, DailyPoint, summarizeActivity } from '../../utils/activityTrends';
import { monthStart } from '../../utils/month';

interface TeamActivityTrendsProps {
  /** `YYYY-MM-01` */
  month: string;
  /** The advisors in scope (already narrowed by the supervisor filter); they give the names and goals. */
  advisors: AdvisorMonthMetrics[];
}

const ALL = 'all';

const COLORS = {
  primary: '#003366',
  sky: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  muted: '#94a3b8',
  grid: '#e2e8f0',
};

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatNumber = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/** The day the pace is judged on: today in the current month, the last day in a past month, none in a future one. */
const judgedDay = (month: string, series: DailyPoint[], today: Date): DailyPoint | undefined => {
  const current = monthStart(today);
  if (month > current) return undefined;
  return month === current ? series[today.getDate() - 1] : series[series.length - 1];
};

const SummaryCard: React.FC<{ testId: string; label: string; value: number; hint?: string }> = ({ testId, label, value, hint }) => (
  <div data-testid={testId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
    <p className="text-xs font-semibold text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

const ChartCard: React.FC<{ title: string; children: React.ReactElement }> = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
    <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  </div>
);

const axisProps = { tickLine: false, axisLine: false, tick: { fill: '#64748b', fontSize: 11 } } as const;

/**
 * Day-by-day activity of the advisors in scope for one month: prospects, collection actions,
 * sales against the goal's pace, and payment links. The database scopes the rows.
 */
export const TeamActivityTrends: React.FC<TeamActivityTrendsProps> = ({ month, advisors }) => {
  const [rows, setRows] = useState<AdvisorDayActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advisorFilter, setAdvisorFilter] = useState<string>(ALL);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    advisorPerformanceRepository
      .getDailyActivity(month)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setLoadError('No se pudo cargar la actividad diaria.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  // An advisor that left the scope (another supervisor was picked) falls back to everyone.
  const selected = advisors.find((a) => a.advisorId === advisorFilter);
  const inScope = selected ? [selected] : advisors;

  const goals = inScope.map((a) => a.goalAffiliates).filter((g): g is number => g !== undefined);
  const goal = goals.length > 0 ? goals.reduce((sum, g) => sum + g, 0) : undefined;

  const today = new Date();
  const scopeKey = inScope.map((a) => a.advisorId).join(',');
  const series = useMemo(
    () => buildDailySeries(rows, month, { advisorIds: new Set(scopeKey.split(',')), goal, today: isoDate(today) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, month, scopeKey, goal],
  );
  const summary = summarizeActivity(series);
  const judged = goal !== undefined ? judgedDay(month, series, today) : undefined;

  return (
    <section className="space-y-4" aria-labelledby="activity-trends-title">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 id="activity-trends-title" className="text-lg font-black text-[#003366]">Actividad día a día</h2>
        <select
          aria-label="Asesor"
          value={selected ? selected.advisorId : ALL}
          onChange={(e) => setAdvisorFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-slate-900"
        >
          <option value={ALL}>Todos los asesores</option>
          {advisors.map((a) => <option key={a.advisorId} value={a.advisorId}>{a.advisorName}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando actividad…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : (
        <>
          {judged && judged.cumulativeSold !== undefined && judged.pace !== undefined && (
            <div
              data-testid="pace-status"
              className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-sm text-slate-700"
            >
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  judged.cumulativeSold >= judged.pace ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {judged.cumulativeSold >= judged.pace ? 'Al día' : 'Atrasado'}
              </span>
              <span>
                {judged.cumulativeSold} afiliados al día {judged.day} · el ritmo para la meta de {formatNumber(goal!)} pide {formatNumber(judged.pace)}.
              </span>
            </div>
          )}

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <SummaryCard testId="trend-prospects" label="Prospectos cargados" value={summary.prospectsLoaded} hint={`${summary.prospectsAffiliated} convertidos`} />
            <SummaryCard testId="trend-actions" label="Gestiones de cobranza" value={summary.collectionActions} />
            <SummaryCard testId="trend-sales" label="Afiliados nuevos" value={summary.affiliatesSold} />
            <SummaryCard
              testId="trend-links"
              label="Links de pago enviados"
              value={summary.linksSent}
              hint={summary.linksPaidRate === null ? undefined : `${summary.linksPaidRate}% pagados`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Afiliados acumulados vs. ritmo de la meta">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="cumulativeSold" name="Afiliados" stroke={COLORS.primary} strokeWidth={2} dot={false} />
                {goal !== undefined && (
                  <Line type="linear" dataKey="pace" name="Ritmo de la meta" stroke={COLORS.muted} strokeDasharray="6 4" dot={false} />
                )}
              </LineChart>
            </ChartCard>

            <ChartCard title="Prospectos por día">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip />
                <Legend />
                <Bar dataKey="prospectsLoaded" name="Cargados" fill={COLORS.sky} radius={[4, 4, 0, 0]} />
                <Bar dataKey="prospectsAffiliated" name="Convertidos" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Gestiones de cobranza por día">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip />
                <Bar dataKey="collectionActions" name="Gestiones" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Links de pago por día">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip />
                <Legend />
                <Bar dataKey="linksSent" name="Enviados" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="linksPaid" name="Pagados" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>
        </>
      )}
    </section>
  );
};
