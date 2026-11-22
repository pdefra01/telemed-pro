import React, { useState } from 'react';
import { ExternalLink, FileText, Pill } from 'lucide-react';
import type { Prescription } from '../../types';
import { attendedMemberLabel } from '../../utils/attendedMember';
import { formatHistoryDateTime } from '../../utils/clinicalHistoryFormat';
import { formatDoctorName } from '../../utils/doctorName';
import { sendPrescriptionWhatsapp } from '../../utils/prescriptionWhatsapp';

interface ChartPrescriptionsPanelProps {
  /** The patient's prescriptions, newest first (consultation and standalone ones). */
  prescriptions: Prescription[];
  /** Only the issuing doctor can resend a prescription (the server enforces it too). */
  currentDoctorId: string;
}

type ResendState = { status: 'idle' | 'sending' | 'sent' | 'failed'; message?: string };

/**
 * "Recetas" tab of the doctor's patient chart. Lists every prescription,
 * including the ones issued without a video call, so they can be resent later.
 */
const ChartPrescriptionsPanel: React.FC<ChartPrescriptionsPanelProps> = ({ prescriptions, currentDoctorId }) => {
  const [resend, setResend] = useState<Record<string, ResendState>>({});

  const handleResend = async (id: string) => {
    setResend((prev) => ({ ...prev, [id]: { status: 'sending' } }));
    const result = await sendPrescriptionWhatsapp(id);
    setResend((prev) => ({ ...prev, [id]: result.ok ? { status: 'sent' } : { status: 'failed', message: result.message } }));
  };

  if (prescriptions.length === 0) {
    return (
      <div className="text-center py-20">
        <Pill size={28} className="text-slate-700 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Este paciente todavía no tiene recetas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((rx) => {
        const state = resend[rx.id] ?? { status: 'idle' };
        const memberLabel = attendedMemberLabel(rx);
        return (
          <article key={rx.id} className="bg-white/[0.03] rounded-xl p-4 sm:p-5 border border-white/5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
              <span className="text-xs font-bold text-slate-300">{formatHistoryDateTime(rx.date)}</span>
              {!rx.appointmentId && (
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">Sin consulta</span>
              )}
              <span className="text-xs text-slate-500 sm:ml-auto">{formatDoctorName(rx.doctorTitle, rx.doctorName)}</span>
            </div>
            {memberLabel && <p className="text-sm font-semibold text-teal-400 mb-1">{memberLabel}</p>}

            {rx.medications?.length > 0 && (
              <ul className="space-y-1.5">
                {rx.medications.map((med, i) => (
                  <li key={i}>
                    <p className="font-bold text-white">{med.name}</p>
                    {med.instructions && <p className="text-sm text-slate-400">{med.instructions}</p>}
                  </li>
                ))}
              </ul>
            )}
            {rx.notes && <p className="mt-2 text-slate-300 text-sm whitespace-pre-wrap break-words">{rx.notes}</p>}
            {rx.externalPrescriptionUrl && (
              <a
                href={rx.externalPrescriptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-blue-400 hover:text-blue-300"
              >
                <ExternalLink size={14} /> Receta de obra social
              </a>
            )}
            {!rx.medications?.length && !rx.notes && !rx.externalPrescriptionUrl && (
              <p className="text-sm text-slate-500 flex items-center gap-2"><FileText size={14} /> Receta sin detalle.</p>
            )}

            {rx.doctorId === currentDoctorId && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleResend(rx.id)}
                  disabled={state.status === 'sending'}
                  className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold disabled:opacity-50"
                >
                  {state.status === 'sending' ? 'Enviando...' : 'Reenviar por WhatsApp'}
                </button>
                {state.status === 'sent' && <span className="text-xs text-emerald-400">Receta enviada por WhatsApp.</span>}
                {state.status === 'failed' && <span className="text-xs text-red-400">{state.message}</span>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default ChartPrescriptionsPanel;
