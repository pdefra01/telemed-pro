import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}));

import { sendPrescriptionWhatsapp, WHATSAPP_GENERIC_ERROR } from '../prescriptionWhatsapp';

const reply = (ok: boolean, body: unknown) => ({ ok, json: async () => body }) as Response;

describe('sendPrescriptionWhatsapp', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts to the prescription endpoint with the session token', async () => {
    fetchSpy.mockResolvedValue(reply(true, { status: 'sent' }));
    const result = await sendPrescriptionWhatsapp('rx-1');
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith('/api/prescriptions/rx-1/send-whatsapp', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('treats already_sent as delivered', async () => {
    fetchSpy.mockResolvedValue(reply(false, { status: 'already_sent' }));
    expect(await sendPrescriptionWhatsapp('rx-1')).toEqual({ ok: true });
  });

  it('maps a known failure reason to its message', async () => {
    fetchSpy.mockResolvedValue(reply(false, { reason: 'invalid_phone' }));
    expect(await sendPrescriptionWhatsapp('rx-1')).toEqual({
      ok: false,
      message: 'El paciente no tiene un teléfono válido cargado.',
    });
  });

  it.each([
    ['no_pdf', 'Esta receta no tiene un PDF generado, por eso no se puede reenviar.'],
    ['no_content', 'Esta receta no tiene contenido para enviar.'],
    ['forbidden', 'Solo el médico que emitió la receta puede reenviarla.'],
    ['prescription_not_found', 'No se encontró la receta.'],
  ])('explains the server error "%s" instead of suggesting a retry', async (error, message) => {
    fetchSpy.mockResolvedValue(reply(false, { error }));
    expect(await sendPrescriptionWhatsapp('rx-1')).toEqual({ ok: false, message });
  });

  it('falls back to the generic message on an unknown reason or a network error', async () => {
    fetchSpy.mockResolvedValueOnce(reply(false, { reason: 'boom' }));
    expect(await sendPrescriptionWhatsapp('rx-1')).toEqual({ ok: false, message: WHATSAPP_GENERIC_ERROR });
    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    expect(await sendPrescriptionWhatsapp('rx-1')).toEqual({ ok: false, message: WHATSAPP_GENERIC_ERROR });
  });
});
