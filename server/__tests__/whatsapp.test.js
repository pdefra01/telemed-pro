import { describe, it, expect, vi } from 'vitest';
import {
  normalizeArgentinePhone,
  buildPrescriptionMessage,
  createWahaClient,
} from '../whatsapp.js';

describe('normalizeArgentinePhone', () => {
  it.each([
    ['+54 9 11 1234-5678', '5491112345678'],
    ['5491112345678', '5491112345678'],
    ['54 11 1234-5678', '5491112345678'],
    ['011 1234-5678', '5491112345678'],
    ['1112345678', '5491112345678'],
    ['011 15 1234-5678', '5491112345678'],
    ['0351 15 123-4567', '5493511234567'],
    ['(0351) 423-4567', '5493514234567'],
    ['00 54 9 351 123 4567', '5493511234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeArgentinePhone(input)).toBe(expected);
  });

  it.each([[''], [null], [undefined], ['No especificado'], ['1234'], ['abc']])(
    'returns null for unusable input %s',
    (input) => {
      expect(normalizeArgentinePhone(input)).toBeNull();
    }
  );

  it('keeps a valid non-Argentine international number as digits', () => {
    expect(normalizeArgentinePhone('+598 99 123 456')).toBe('59899123456');
  });
});

describe('buildPrescriptionMessage', () => {
  const base = { patientName: 'Ana Pérez', doctorName: 'Sergio Dib Ashur' };

  it('greets the patient and names the doctor', () => {
    const msg = buildPrescriptionMessage(base);
    expect(msg).toContain('Ana Pérez');
    expect(msg).toContain('Dr. Sergio Dib Ashur');
  });

  it('never includes links or phone numbers', () => {
    const msg = buildPrescriptionMessage({ ...base, doctorPhone: '+5491155550000' });
    expect(msg).not.toMatch(/https?:\/\//i);
    expect(msg).not.toMatch(/\d{8,}/);
  });

  it('falls back to a neutral greeting without a patient name', () => {
    const msg = buildPrescriptionMessage({ doctorName: 'Sergio Dib Ashur' });
    expect(msg.startsWith('Hola')).toBe(true);
    expect(msg).not.toContain('undefined');
  });
});

describe('createWahaClient', () => {
  const config = { baseUrl: 'http://waha:3000/', apiKey: 'secret', session: 'default' };

  const okResponse = (body = {}) => ({ ok: true, status: 201, json: async () => body, text: async () => JSON.stringify(body) });

  it('sends a file as base64 with the api key and the chat id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ id: 'msg-1' }));
    const client = createWahaClient({ ...config, fetchFn });

    const result = await client.sendFile({
      phone: '5491112345678',
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'receta.pdf',
      caption: 'Tu receta',
    });

    expect(result).toEqual({ id: 'msg-1' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://waha:3000/api/sendFile');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Api-Key']).toBe('secret');
    const body = JSON.parse(init.body);
    expect(body.session).toBe('default');
    expect(body.chatId).toBe('5491112345678@c.us');
    expect(body.caption).toBe('Tu receta');
    expect(body.file).toEqual({
      mimetype: 'application/pdf',
      filename: 'receta.pdf',
      data: Buffer.from([1, 2, 3]).toString('base64'),
    });
  });

  it('throws a descriptive error when the gateway answers with an error status', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'session not ready' });
    const client = createWahaClient({ ...config, fetchFn });

    await expect(
      client.sendFile({ phone: '5491112345678', bytes: new Uint8Array([1]), filename: 'r.pdf', caption: 'x' })
    ).rejects.toThrow(/422.*session not ready/);
  });

  it('throws when the gateway is unreachable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = createWahaClient({ ...config, fetchFn });

    await expect(
      client.sendFile({ phone: '5491112345678', bytes: new Uint8Array([1]), filename: 'r.pdf', caption: 'x' })
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('reports the session as ready only when the gateway says WORKING', async () => {
    const working = createWahaClient({ ...config, fetchFn: vi.fn().mockResolvedValue(okResponse({ status: 'WORKING' })) });
    const stopped = createWahaClient({ ...config, fetchFn: vi.fn().mockResolvedValue(okResponse({ status: 'SCAN_QR_CODE' })) });

    await expect(working.isSessionReady()).resolves.toBe(true);
    await expect(stopped.isSessionReady()).resolves.toBe(false);
  });

  it('treats an unreachable gateway as a session that is not ready', async () => {
    const client = createWahaClient({ ...config, fetchFn: vi.fn().mockRejectedValue(new Error('down')) });
    await expect(client.isSessionReady()).resolves.toBe(false);
  });
});
