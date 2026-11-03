import React, { useEffect, useState } from 'react';
import { whatsappStatusRepository } from '../../repositories/WhatsappStatusRepository';

const POLL_MS = 60_000;

type Tone = 'ok' | 'bad' | 'warn' | 'idle';

const DISPLAY: Record<string, { label: string; tone: Tone }> = {
  WORKING: { label: 'WhatsApp conectado', tone: 'ok' },
  SCAN_QR_CODE: { label: 'WhatsApp: hay que vincular el celular', tone: 'bad' },
  STOPPED: { label: 'WhatsApp caído', tone: 'bad' },
  FAILED: { label: 'WhatsApp caído', tone: 'bad' },
  STARTING: { label: 'WhatsApp iniciando', tone: 'warn' },
  UNREACHABLE: { label: 'WhatsApp sin respuesta', tone: 'warn' },
  NOT_CONFIGURED: { label: 'WhatsApp sin configurar', tone: 'idle' },
};

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500 shadow-[0_0_10px_#10b981]',
  bad: 'bg-red-500 shadow-[0_0_10px_#ef4444]',
  warn: 'bg-amber-500 shadow-[0_0_10px_#f59e0b]',
  idle: 'bg-slate-500',
};

/** Live state of the company WhatsApp session, refreshed every minute. Admin only. */
export const WhatsappStatusBadge: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await whatsappStatusRepository.getStatus();
        if (active) setStatus(next);
      } catch {
        if (active) setStatus('UNREACHABLE');
      }
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!status) return null;

  const display = DISPLAY[status] ?? { label: `WhatsApp: ${status}`, tone: 'warn' as Tone };
  return (
    <div className="flex items-center space-x-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl backdrop-blur-sm">
      <div className={`w-2 h-2 rounded-full ${DOT[display.tone]}`}></div>
      <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{display.label}</span>
    </div>
  );
};
