import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CommissionLine, CommissionLiquidation, CommissionSummary } from '../../types';
import { commissionRepository } from '../../repositories/CommissionRepository';
import { useCommissionsVisible } from '../../hooks/useCommissionsVisible';
import { formatCurrency } from '../../utils/performance';
import { formatMonthLabel } from '../../utils/month';
import { formatDateOnly } from '../../utils/collections';
import {
  COMMISSION_STATUS_LABELS,
  LIQUIDATION_STATUS_BADGE,
  LIQUIDATION_STATUS_LABELS,
} from '../../utils/commissions';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export const detailButtonClass =
  'inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100';

/** "Detalle ▾" toggle shared by the commission screens. */
export const DetailToggle: React.FC<{ open: boolean; onClick: () => void; label?: string }> = ({ open, onClick, label = 'Detalle' }) => (
  <button type="button" aria-expanded={open} onClick={onClick} className={detailButtonClass}>
    {label} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
  </button>
);

/** "Pagada el 5/10/2026 · Transferencia · OP-1" */
export const paymentLabel = (l: CommissionLiquidation): string | null =>
  l.status === 'paid' && l.paidAt
    ? [`Pagada el ${formatDateOnly(l.paidAt)}`, l.paymentMethod, l.paymentReference].filter(Boolean).join(' · ')
    : null;

/** Lines of a liquidation: affiliate, plan, amount, status and the reason of a retained or excluded line. */
export const CommissionLineList: React.FC<{
  lines: CommissionLine[];
  actions?: (line: CommissionLine) => React.ReactNode;
  /** Show the advisor on each line (lists that mix advisors). */
  showAdvisor?: boolean;
}> = ({ lines, actions, showAdvisor = false }) =>
  lines.length === 0 ? (
    <p className="text-gray-500">No hay comisiones.</p>
  ) : (
    <ul className="divide-y divide-gray-200">
      {lines.map((c) => {
        const reason = c.status === 'excluded' ? c.exclusionReason : c.status === 'retained' ? c.retainedReason : null;
        return (
          <li key={c.id} data-testid={`line-${c.id}`} className="py-1.5 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-slate-900">{c.affiliateName ?? 'Afiliado'}</span>
              {showAdvisor && <span className="text-gray-500">{c.advisorName}</span>}
              {c.planName && <span className="text-gray-500">{c.planName}</span>}
              <span className="text-gray-700">
                {COMMISSION_STATUS_LABELS[c.status]}
                {reason ? ` · ${reason}` : ''}
              </span>
              <span className="ml-auto font-semibold text-slate-900">{formatCurrency(c.amount)}</span>
              {actions?.(c)}
            </div>
          </li>
        );
      })}
    </ul>
  );

interface Totals {
  generated: number;
  retained: number;
  toCollect: number;
  collected: number;
}

const totalsOf = (rows: CommissionSummary[]): Totals =>
  rows.reduce(
    (t, r) => ({
      generated: t.generated + r.generatedAmount,
      retained: t.retained + r.retainedAmount,
      toCollect: t.toCollect + r.toCollectAmount,
      collected: t.collected + r.collectedAmount,
    }),
    { generated: 0, retained: 0, toCollect: 0, collected: 0 }
  );

/** Key of the open detail: a liquidation id, or `pending:<advisorId>` for the commissions not liquidated yet. */
type DetailKey = string;
const pendingKey = (advisorId: string | null) => `pending:${advisorId ?? 'all'}`;

interface CommissionsProps {
  title?: string;
  /** Supervisor view: one row per advisor of the team, with the drill-down. Read-only either way. */
  team?: boolean;
}

/**
 * The advisor's and the supervisor's commission screen. While the switch in Configuración
 * is off they see a notice instead, and nothing is read (the database returns nothing either).
 */
export const Commissions: React.FC<CommissionsProps> = (props) => {
  const visible = useCommissionsVisible();
  if (visible === null) return <p className="max-w-5xl mx-auto text-gray-500">Cargando comisiones…</p>;
  if (!visible) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <h1 className="text-2xl font-black text-[#003366]">{props.title ?? 'Comisiones'}</h1>
        <p className="text-gray-600">Las comisiones no están disponibles.</p>
      </div>
    );
  }
  return <CommissionsContent {...props} />;
};

/**
 * Commissions of an advisor (own) or of a supervisor's team: generated, retained (debit rejected),
 * approved to collect and collected, the monthly liquidations and their lines on demand. Read-only:
 * only the admin acts on liquidations (CommissionsAdmin).
 */
const CommissionsContent: React.FC<CommissionsProps> = ({ title = 'Comisiones', team = false }) => {
  const [summary, setSummary] = useState<CommissionSummary[]>([]);
  const [liquidations, setLiquidations] = useState<CommissionLiquidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openAdvisor, setOpenAdvisor] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [lines, setLines] = useState<CommissionLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [linesError, setLinesError] = useState<string | null>(null);
  // The detail open now: a late answer for another one is dropped.
  const openDetailRef = useRef<DetailKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([commissionRepository.getSummary(), commissionRepository.listLiquidations()])
      .then(([s, l]) => {
        if (cancelled) return;
        setSummary(s);
        setLiquidations(l);
      })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err, 'No se pudieron cargar las comisiones.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totals = useMemo(() => totalsOf(summary), [summary]);

  const toggleDetail = async (key: DetailKey, advisorId: string | null) => {
    if (detail === key) {
      openDetailRef.current = null;
      setDetail(null);
      return;
    }
    openDetailRef.current = key;
    setDetail(key);
    setLines([]);
    setLinesError(null);
    setLinesLoading(true);
    try {
      const isPending = key.startsWith('pending:');
      const rows = await commissionRepository.listCommissions(
        isPending ? { ...(advisorId ? { advisorId } : {}), unattachedOnly: true } : { liquidationId: key }
      );
      if (openDetailRef.current === key) setLines(rows);
    } catch (err) {
      if (openDetailRef.current === key) setLinesError(errorMessage(err, 'No se pudo cargar el detalle.'));
    } finally {
      if (openDetailRef.current === key) setLinesLoading(false);
    }
  };

  const renderDetail = (key: DetailKey) =>
    detail === key && (
      <div className="rounded-lg bg-gray-50 p-3 text-sm">
        {linesError ? (
          <p role="alert" className="text-red-600">{linesError}</p>
        ) : linesLoading ? (
          <p className="text-gray-500">Cargando…</p>
        ) : (
          <CommissionLineList lines={lines} />
        )}
      </div>
    );

  /** The liquidations of one advisor (or all in scope), plus the commissions not liquidated yet. */
  const renderLiquidations = (advisorId: string | null, rows: CommissionLiquidation[], hasPending: boolean) => (
    <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
      {hasPending && (
        <li data-testid="liquidation-pending" className="px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-slate-900">Sin liquidar</span>
            <span className="ml-auto" />
            <DetailToggle open={detail === pendingKey(advisorId)} onClick={() => toggleDetail(pendingKey(advisorId), advisorId)} />
          </div>
          {renderDetail(pendingKey(advisorId))}
        </li>
      )}
      {rows.map((l) => {
        const paid = paymentLabel(l);
        return (
          <li key={l.id} data-testid={`liquidation-${l.id}`} className="px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-slate-900 capitalize">{formatMonthLabel(l.month)}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LIQUIDATION_STATUS_BADGE[l.status]}`}>
                {LIQUIDATION_STATUS_LABELS[l.status]}
              </span>
              {paid && <span className="text-sm text-gray-500">{paid}</span>}
              <span className="ml-auto font-black text-slate-900">{formatCurrency(l.totalAmount)}</span>
              <DetailToggle open={detail === l.id} onClick={() => toggleDetail(l.id, advisorId)} />
            </div>
            {renderDetail(l.id)}
          </li>
        );
      })}
      {!hasPending && rows.length === 0 && <li className="px-3 py-2.5 text-gray-500">Todavía no hay liquidaciones.</li>}
    </ul>
  );

  const hasPending = (rows: CommissionSummary[]) => rows.some((r) => r.generatedCount > 0 || r.retainedCount > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <h1 className="text-2xl font-black text-[#003366]">{title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          <span data-testid="total-generated">Generada <strong className="text-slate-900">{formatCurrency(totals.generated)}</strong></span>
          <span data-testid="total-retained">Retenida <strong className="text-slate-900">{formatCurrency(totals.retained)}</strong></span>
          <span data-testid="total-to-collect">A cobrar <strong className="text-slate-900">{formatCurrency(totals.toCollect)}</strong></span>
          <span data-testid="total-collected">Cobrada <strong className="text-slate-900">{formatCurrency(totals.collected)}</strong></span>
        </div>
      </header>

      {loading ? (
        <p className="text-gray-500">Cargando comisiones…</p>
      ) : loadError ? (
        <p role="alert" className="text-red-600">{loadError}</p>
      ) : team ? (
        summary.length === 0 ? (
          <p className="text-gray-500">No hay asesores en el equipo.</p>
        ) : (
          <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 text-sm">
            {summary.map((s) => {
              const open = openAdvisor === s.advisorId;
              return (
                <li key={s.advisorId} data-testid={`advisor-${s.advisorId}`} className="px-3 py-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-semibold text-slate-900">{s.advisorName}</span>
                    <span className="text-gray-600">
                      Generada {formatCurrency(s.generatedAmount)} · Retenida {formatCurrency(s.retainedAmount)} · A cobrar{' '}
                      <strong className="text-slate-900">{formatCurrency(s.toCollectAmount)}</strong> · Cobrada {formatCurrency(s.collectedAmount)}
                    </span>
                    <span className="ml-auto" />
                    <DetailToggle open={open} label="Liquidaciones" onClick={() => setOpenAdvisor(open ? null : s.advisorId)} />
                  </div>
                  {open &&
                    renderLiquidations(
                      s.advisorId,
                      liquidations.filter((l) => l.advisorId === s.advisorId),
                      hasPending([s])
                    )}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        renderLiquidations(null, liquidations, hasPending(summary))
      )}
    </div>
  );
};
