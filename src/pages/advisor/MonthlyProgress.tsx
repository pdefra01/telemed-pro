import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AdvisorMonthMetrics } from '../../types';
import { advisorPerformanceRepository } from '../../repositories/AdvisorPerformanceRepository';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatMonthLabel, monthStart, shiftMonth } from '../../utils/month';
import { conversionRate, formatCurrency, progressPercent } from '../../utils/performance';

interface GoalCardProps {
  testId: string;
  title: string;
  value: number;
  goal?: number;
  format: (n: number) => string;
}

const GoalCard: React.FC<GoalCardProps> = ({ testId, title, value, goal, format }) => (
  <div data-testid={testId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
    <p className="text-xs font-semibold text-gray-500">{title}</p>
    {goal !== undefined ? (
      <>
        <p className="text-lg font-black text-slate-900">{format(value)} de {format(goal)}</p>
        <ProgressBar percent={progressPercent(value, goal)} label={`Avance de ${title.toLowerCase()}`} />
      </>
    ) : (
      <>
        <p className="text-lg font-black text-slate-900">{format(value)}</p>
        <p className="text-xs text-gray-400">Sin meta para este mes</p>
      </>
    )}
  </div>
);

const Figure: React.FC<{ testId: string; label: string; children: React.ReactNode }> = ({ testId, label, children }) => (
  <div data-testid={testId} className="text-center">
    <p className="text-xl font-black text-slate-900">{children}</p>
    <p className="text-xs font-semibold text-gray-500">{label}</p>
  </div>
);

/** The logged advisor's month: goal progress, prospect funnel and follow-up alerts. */
export const MonthlyProgress: React.FC = () => {
  const currentMonth = monthStart(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [metrics, setMetrics] = useState<AdvisorMonthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    advisorPerformanceRepository
      .getMonthlyMetrics(month)
      .then((rows) => { if (!cancelled) setMetrics(rows[0] ?? null); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar tu avance del mes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const rate = metrics ? conversionRate(metrics.prospectsAffiliated, metrics.prospectsLoaded) : null;

  return (
    <section aria-label="Mi mes" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-[#003366]">Mi mes</h2>
        <div className="flex items-center gap-2">
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
            disabled={month >= currentMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando tu avance…</p>
      ) : error ? (
        <p role="alert" className="text-red-600">{error}</p>
      ) : !metrics ? (
        <p className="text-gray-500">Sin datos para este mes.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <GoalCard testId="goal-affiliates" title="Afiliados" value={metrics.affiliatesSold} goal={metrics.goalAffiliates} format={(n) => String(n)} />
            <GoalCard testId="goal-revenue" title="Ingresos (cuota mensual)" value={metrics.revenue} goal={metrics.goalRevenue} format={formatCurrency} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Figure testId="funnel-loaded" label="Prospectos cargados">{metrics.prospectsLoaded}</Figure>
            <Figure testId="funnel-contacted" label="Contactados">{metrics.prospectsContacted}</Figure>
            <Figure testId="funnel-affiliated" label="Afiliados">{metrics.prospectsAffiliated}</Figure>
            <Figure testId="funnel-conversion" label="Conversión">{rate === null ? '—' : `${rate}%`}</Figure>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div data-testid="stale-prospects" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xl font-black text-slate-900">{metrics.prospectsStale}</p>
              <p className="text-xs font-semibold text-gray-500">Prospectos sin seguimiento hace 7 días o más</p>
            </div>
            <div data-testid="links-shared" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xl font-black text-slate-900">{metrics.linksShared}</p>
              <p className="text-xs font-semibold text-gray-500">Links compartidos (acumulado)</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
