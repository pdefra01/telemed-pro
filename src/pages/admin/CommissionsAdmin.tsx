import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommissionGenerationResult, CommissionLine, CommissionLiquidation } from '../../types';
import { commissionRepository } from '../../repositories/CommissionRepository';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../utils/performance';
import { formatMonthLabel } from '../../utils/month';
import { toLocalDateStr } from '../../utils/localDate';
import { closedMonths, LIQUIDATION_STATUS_BADGE, LIQUIDATION_STATUS_LABELS } from '../../utils/commissions';
import { CommissionLineList, DetailToggle, paymentLabel } from '../advisor/Commissions';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const generationLine = (r: CommissionGenerationResult) =>
  [
    plural(r.advisors, 'asesor', 'asesores'),
    plural(r.commissionsAttached, 'comisión', 'comisiones'),
    plural(r.retainedCount, 'retenida', 'retenidas'),
    `Total ${formatCurrency(r.totalAmount)}`,
  ].join(' · ');

const smallButton = 'px-2.5 py-1 rounded-lg text-xs font-semibold';
const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-xl bg-white';

/**
 * Admin: monthly commission liquidations (S3). Generate a closed month, review each advisor's lines
 * (exclude with a reason / include while draft), approve, and record the payment.
 */
export const CommissionsAdmin: React.FC = () => {
  const months = useMemo(() => closedMonths(new Date()), []);
  const [month, setMonth] = useState(months[0]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [liquidations, setLiquidations] = useState<CommissionLiquidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [lines, setLines] = useState<CommissionLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const openDetailRef = useRef<string | null>(null);

  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payment, setPayment] = useState({ paidAt: toLocalDateStr(), method: '', reference: '' });

  const loadLiquidations = useCallback(async (m: string) => {
    setLiquidations(await commissionRepository.listLiquidations({ month: m }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    setDetailId(null);
    openDetailRef.current = null;
    Promise.all([commissionRepository.getSummary(), commissionRepository.listLiquidations({ month })])
      .then(([summary, rows]) => {
        if (cancelled) return;
        setNames(Object.fromEntries(summary.map((s) => [s.advisorId, s.advisorName])));
        setLiquidations(rows);
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'No se pudieron cargar las liquidaciones.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const nameOf = (advisorId: string) => names[advisorId] ?? 'Asesor';

  /** The liquidation's lines, plus the advisor's retained ones (out of every liquidation while the debit is rejected). */
  const loadLines = async (l: CommissionLiquidation) => {
    const attached = await commissionRepository.listCommissions(l.id);
    const retained = l.status === 'draft' && l.retainedCount > 0
      ? (await commissionRepository.listCommissions()).filter(
          (c) => c.advisorId === l.advisorId && c.liquidationId === null && c.status === 'retained'
        )
      : [];
    if (openDetailRef.current === l.id) setLines([...attached, ...retained]);
  };

  const toggleDetail = async (l: CommissionLiquidation) => {
    setExcludingId(null);
    if (detailId === l.id) {
      openDetailRef.current = null;
      setDetailId(null);
      return;
    }
    openDetailRef.current = l.id;
    setDetailId(l.id);
    setLines([]);
    setLinesLoading(true);
    try {
      await loadLines(l);
    } catch (err) {
      if (openDetailRef.current === l.id) setError(errorMessage(err, 'No se pudo cargar el detalle.'));
    } finally {
      if (openDetailRef.current === l.id) setLinesLoading(false);
    }
  };

  /** Runs an admin action, shows the database message on failure and refreshes the month. */
  const run = async (action: () => Promise<void>, after?: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await loadLiquidations(month);
      if (after) await after();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo completar la operación.'));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = () =>
    run(async () => {
      setResult(null);
      setResult(generationLine(await commissionRepository.generate(month)));
    });

  const handleApprove = (l: CommissionLiquidation) => {
    const ok = window.confirm(
      `¿Aprobar la liquidación de ${nameOf(l.advisorId)} (${formatMonthLabel(l.month)}) por ${formatCurrency(l.totalAmount)}? Después no se puede modificar.`
    );
    if (!ok) return;
    run(() => commissionRepository.approve(l.id));
  };

  const startPayment = (l: CommissionLiquidation) => {
    setPayingId(payingId === l.id ? null : l.id);
    setPayment({ paidAt: toLocalDateStr(), method: '', reference: '' });
  };

  const handlePay = (e: React.FormEvent, l: CommissionLiquidation) => {
    e.preventDefault();
    const ok = window.confirm(`¿Registrar el pago de ${formatCurrency(l.totalAmount)} a ${nameOf(l.advisorId)}?`);
    if (!ok) return;
    run(async () => {
      await commissionRepository.pay(l.id, payment);
      setPayingId(null);
    });
  };

  const handleExclude = (l: CommissionLiquidation, c: CommissionLine) =>
    run(async () => {
      await commissionRepository.exclude(c.id, reason);
      setExcludingId(null);
      setReason('');
    }, () => loadLines(l));

  const handleInclude = (l: CommissionLiquidation, c: CommissionLine) =>
    run(() => commissionRepository.include(c.id), () => loadLines(l));

  const lineActions = (l: CommissionLiquidation) => (c: CommissionLine) => {
    if (l.status !== 'draft') return null;
    if (c.status === 'excluded') {
      return c.planName ? (
        <button type="button" disabled={busy} onClick={() => handleInclude(l, c)} className={`${smallButton} text-teal-700 hover:bg-teal-50`}>
          Incluir
        </button>
      ) : null;
    }
    if (c.status !== 'generated' && c.status !== 'retained') return null;
    if (excludingId !== c.id) {
      return (
        <button type="button" disabled={busy} onClick={() => { setExcludingId(c.id); setReason(''); }} className={`${smallButton} text-red-700 hover:bg-red-50`}>
          Excluir
        </button>
      );
    }
    return (
      <span className="flex w-full flex-wrap items-center gap-2">
        <input
          aria-label="Motivo de la exclusión"
          placeholder="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1 px-2 py-1 border border-slate-300 rounded-lg bg-white"
        />
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={() => handleExclude(l, c)}
          className={`${smallButton} bg-red-600 text-white hover:bg-red-700 disabled:opacity-50`}
        >
          Confirmar exclusión
        </button>
        <button type="button" onClick={() => setExcludingId(null)} className={`${smallButton} text-gray-600 hover:bg-gray-100`}>
          Cancelar
        </button>
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl font-black text-[#003366]">Comisiones</h1>
        <div className="flex gap-2 items-center">
          <label htmlFor="commission-month" className="text-sm font-semibold text-slate-700">Mes</label>
          <select
            id="commission-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl bg-white capitalize"
          >
            {months.map((m) => (
              <option key={m} value={m}>{formatMonthLabel(m)}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={handleGenerate}
            className="px-3 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
          >
            Generar liquidación
          </button>
        </div>
      </header>

      {result && <p data-testid="generation-result" className="text-sm text-gray-700">{result}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Cargando liquidaciones…</p>
      ) : liquidations.length === 0 ? (
        <p className="text-gray-500">No hay liquidaciones de este mes.</p>
      ) : (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {liquidations.map((l) => {
            const paid = paymentLabel(l);
            return (
              <li key={l.id} data-testid={`liquidation-${l.id}`} className="px-3 py-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-slate-900">{nameOf(l.advisorId)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LIQUIDATION_STATUS_BADGE[l.status]}`}>
                    {LIQUIDATION_STATUS_LABELS[l.status]}
                  </span>
                  {l.retainedCount > 0 && (
                    <span className="text-sm text-red-700">Retenida {formatCurrency(l.retainedAmount)} ({l.retainedCount})</span>
                  )}
                  {paid && <span className="text-sm text-gray-500">{paid}</span>}
                  <span className="ml-auto font-black text-slate-900">{formatCurrency(l.totalAmount)}</span>
                  {l.status === 'draft' && (
                    <button type="button" disabled={busy} onClick={() => handleApprove(l)} className={`${smallButton} bg-teal-600 text-white hover:bg-teal-700`}>
                      Aprobar
                    </button>
                  )}
                  {l.status === 'approved' && (
                    <button type="button" disabled={busy} onClick={() => startPayment(l)} className={`${smallButton} bg-teal-600 text-white hover:bg-teal-700`}>
                      Registrar pago
                    </button>
                  )}
                  <DetailToggle open={detailId === l.id} onClick={() => toggleDetail(l)} />
                </div>

                {payingId === l.id && l.status === 'approved' && (
                  <form onSubmit={(e) => handlePay(e, l)} className="rounded-lg bg-gray-50 p-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor={`paid-at-${l.id}`} className="block text-xs font-semibold text-slate-700 mb-1">Fecha de pago</label>
                        <input id={`paid-at-${l.id}`} type="date" required value={payment.paidAt}
                          onChange={(e) => setPayment({ ...payment, paidAt: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`method-${l.id}`} className="block text-xs font-semibold text-slate-700 mb-1">Medio de pago</label>
                        <input id={`method-${l.id}`} required placeholder="Transferencia" value={payment.method}
                          onChange={(e) => setPayment({ ...payment, method: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`reference-${l.id}`} className="block text-xs font-semibold text-slate-700 mb-1">Referencia</label>
                        <input id={`reference-${l.id}`} value={payment.reference}
                          onChange={(e) => setPayment({ ...payment, reference: e.target.value })} className={inputClass} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" isLoading={busy}>Confirmar pago</Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => setPayingId(null)}>Cancelar</Button>
                    </div>
                  </form>
                )}

                {detailId === l.id && (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    {linesLoading ? <p className="text-gray-500">Cargando…</p> : <CommissionLineList lines={lines} actions={lineActions(l)} />}
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

export default CommissionsAdmin;
