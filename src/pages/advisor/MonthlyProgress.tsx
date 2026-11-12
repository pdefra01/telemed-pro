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

/** One goal on one line: the figure, and a bar when a goal was set. */
const GoalCard: React.FC<GoalCardProps> = ({ testId, title, value, goal, format }) => (
  <div data-testid={testId} className="space-y-1">
    <p className="text-sm text-gray-600">
      {title}: <strong className="text-slate-900">{goal !== undefined ? `${format(value)} de ${format(goal)}` : format(value)}</strong>
      {goal === undefined && <span className="text-xs text-gray-400"> · Sin meta</span>}
    </p>
    {goal !== undefined && <ProgressBar percent={progressPercent(value, goal)} label={`Avance de ${title.toLowerCase()}`} />}
  </div>
);

const Figure: React.FC<{ testId: string; label: string; children: React.ReactNode }> = ({ testId, label, children }) => (
  <span data-testid={testId}>
    <strong className="text-slate-900">{children}</strong> {label}
  </span>
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
    <section aria-label="Mi mes" className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-[#003366]">Mi mes</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="p-1 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-semibold text-gray-700 capitalize min-w-28 text-center">{formatMonthLabel(month)}</span>
          <button
            type="button"
            aria-label="Mes siguiente"
            disabled={month >= currentMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando tu avance…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : !metrics ? (
        <p className="text-sm text-gray-500">Sin datos para este mes.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <GoalCard testId="goal-affiliates" title="Afiliados" value={metrics.affiliatesSold} goal={metrics.goalAffiliates} format={(n) => String(n)} />
            <GoalCard testId="goal-revenue" title="Ingresos" value={metrics.revenue} goal={metrics.goalRevenue} format={formatCurrency} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            <Figure testId="funnel-loaded" label="cargados">{metrics.prospectsLoaded}</Figure>
            <Figure testId="funnel-contacted" label="contactados">{metrics.prospectsContacted}</Figure>
            <Figure testId="funnel-affiliated" label="afiliados">{metrics.prospectsAffiliated}</Figure>
            <Figure testId="funnel-conversion" label="conversión">{rate === null ? '—' : `${rate}%`}</Figure>
            <Figure testId="stale-prospects" label="sin seguimiento (7+ días)">{metrics.prospectsStale}</Figure>
            <Figure testId="links-shared" label="links compartidos">{metrics.linksShared}</Figure>
            {metrics.affiliatesUnconfirmed > 0 && (
              <span data-testid="unconfirmed-sales" className="text-amber-800">
                <strong>{metrics.affiliatesUnconfirmed}</strong> ventas aprobadas pendientes de pago
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
};
