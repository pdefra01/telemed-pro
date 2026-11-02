import { supabase } from '../services/supabase';

export const WHATSAPP_ERROR_MESSAGES: Record<string, string> = {
  invalid_phone: 'El paciente no tiene un teléfono válido cargado.',
  session_not_ready: 'El WhatsApp de la empresa no está conectado.',
  whatsapp_disabled: 'El envío por WhatsApp no está configurado.',
};
// Resend failures the server reports under `error` (not `reason`): retrying cannot fix them.
const WHATSAPP_SERVER_ERROR_MESSAGES: Record<string, string> = {
  no_pdf: 'Esta receta no tiene un PDF generado, por eso no se puede reenviar.',
  no_content: 'Esta receta no tiene contenido para enviar.',
  forbidden: 'Solo el médico que emitió la receta puede reenviarla.',
  prescription_not_found: 'No se encontró la receta.',
};
export const WHATSAPP_GENERIC_ERROR = 'No se pudo enviar el WhatsApp. Podés reintentar.';

export type PrescriptionWhatsappResult = { ok: boolean; message?: string };

/**
 * Delivers a prescription to the patient from the company's WhatsApp number
 * (server-side): the doctor's own number is never used or shown.
 */
export async function sendPrescriptionWhatsapp(prescriptionId: string): Promise<PrescriptionWhatsappResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/prescriptions/${prescriptionId}/send-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok || body?.status === 'already_sent') return { ok: true };
    const message = WHATSAPP_ERROR_MESSAGES[body?.reason] || WHATSAPP_SERVER_ERROR_MESSAGES[body?.error];
    return { ok: false, message: message || WHATSAPP_GENERIC_ERROR };
  } catch (err) {
    console.error('Error enviando la receta por WhatsApp:', err);
    return { ok: false, message: WHATSAPP_GENERIC_ERROR };
  }
}
