import { supabase } from '../services/supabase';

export const ISSUE_PRESCRIPTION_GENERIC_ERROR = 'No se pudo emitir la receta. Revisá tu conexión e intentá de nuevo.';

export interface StandalonePrescriptionInput {
  patientId: string;
  familyMemberId: string | null;
  medications: { name: string; instructions: string; productId?: string }[];
  indications: string;
  externalPrescriptionUrl?: string;
}

export type IssuePrescriptionResult = { ok: true; prescriptionId: string } | { ok: false; message: string };

/**
 * Issues a receta without a video consultation through the issue-prescription
 * edge function, which checks the caller is a doctor and stores the PDF.
 */
export async function issueStandalonePrescription(input: StandalonePrescriptionInput): Promise<IssuePrescriptionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('issue-prescription', { body: input });
    if (!error && typeof data?.prescriptionId === 'string') {
      return { ok: true, prescriptionId: data.prescriptionId };
    }
    // A non-2xx response carries the server's explanation in its JSON body.
    const context = (error as { context?: Response } | null)?.context;
    const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    return { ok: false, message: typeof body?.error === 'string' ? body.error : ISSUE_PRESCRIPTION_GENERIC_ERROR };
  } catch (err) {
    console.error('Error emitiendo la receta:', err);
    return { ok: false, message: ISSUE_PRESCRIPTION_GENERIC_ERROR };
  }
}
