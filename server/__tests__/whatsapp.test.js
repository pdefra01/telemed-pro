import { describe, it, expect, vi } from 'vitest';
import {
  normalizeArgentinePhone,
  buildPrescriptionMessage,
  buildPaymentLinkMessage,
  createWahaClient,
  sendPrescriptionViaWhatsApp,
  sendPaymentLinkViaWhatsApp,
  extractStoragePathFromPublicUrl,
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

  it('sends a text message with the api key and the chat id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ id: 'msg-2' }));
    const client = createWahaClient({ ...config, fetchFn });

    const result = await client.sendText({ phone: '5491112345678', text: 'Hola, tu link' });

    expect(result).toEqual({ id: 'msg-2' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://waha:3000/api/sendText');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Api-Key']).toBe('secret');
    const body = JSON.parse(init.body);
    expect(body.session).toBe('default');
    expect(body.chatId).toBe('5491112345678@c.us');
    expect(body.text).toBe('Hola, tu link');
  });

  it('throws a descriptive error when sendText gets an error status', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'session not ready' });
    const client = createWahaClient({ ...config, fetchFn });

    await expect(client.sendText({ phone: '5491112345678', text: 'x' })).rejects.toThrow(/422.*session not ready/);
  });
});

describe('buildPaymentLinkMessage', () => {
  it('greets the affiliate by name and includes the payment link', () => {
    const msg = buildPaymentLinkMessage({ fullName: 'Ana Pérez', paymentUrl: 'https://mp.example/pay/123' });
    expect(msg).toContain('Ana Pérez');
    expect(msg).toContain('https://mp.example/pay/123');
  });

  it('falls back to a neutral greeting without a full name', () => {
    const msg = buildPaymentLinkMessage({ paymentUrl: 'https://mp.example/pay/123' });
    expect(msg.startsWith('Hola')).toBe(true);
    expect(msg).not.toContain('undefined');
    expect(msg).toContain('https://mp.example/pay/123');
  });
});

describe('sendPaymentLinkViaWhatsApp', () => {
  const ADHESION = {
    id: 'adh-1',
    titular_phone: '011 15 1234-5678',
    titular_first_name: 'Ana',
    titular_last_name: 'Pérez',
    titular_name: 'Ana Pérez',
  };
  const PAYMENT_URL = 'https://mp.example/pay/abc';

  function createSupabaseStub({ adhesion = ADHESION, lastSent = null } = {}) {
    const inserts = [];
    const from = (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'adhesion_requests') return { data: adhesion, error: null };
          if (table === 'adhesion_payment_link_deliveries') return { data: lastSent, error: null };
          return { data: null, error: null };
        },
        insert: async (row) => {
          inserts.push(row);
          return { error: null };
        },
      };
      return chain;
    };
    return { client: { from }, inserts };
  }

  function setup(overrides = {}) {
    const stub = createSupabaseStub(overrides.db);
    const waha = {
      isSessionReady: vi.fn().mockResolvedValue(true),
      sendText: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      ...overrides.waha,
    };
    const now = overrides.now || (() => new Date('2026-09-20T12:00:00Z'));
    const ctx = { supabaseAdmin: stub.client, waha, now };
    return { ctx, waha, inserts: stub.inserts };
  }

  const run = (ctx, adhesionRequestId = 'adh-1', paymentUrl = PAYMENT_URL) =>
    sendPaymentLinkViaWhatsApp(ctx, { adhesionRequestId, paymentUrl });

  it('sends the payment link to the normalized titular number and logs success', async () => {
    const { ctx, waha, inserts } = setup();

    const result = await run(ctx);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'sent' });
    const call = waha.sendText.mock.calls[0][0];
    expect(call.phone).toBe('5491112345678');
    expect(call.text).toContain('Ana');
    expect(call.text).toContain(PAYMENT_URL);
    expect(inserts).toEqual([
      expect.objectContaining({ adhesion_request_id: 'adh-1', channel: 'whatsapp', status: 'sent' }),
    ]);
  });

  it('returns 404 when the adhesion request does not exist', async () => {
    const { ctx, waha } = setup({ db: { adhesion: null } });
    const result = await run(ctx);
    expect(result.status).toBe(404);
    expect(waha.sendText).not.toHaveBeenCalled();
  });

  it('logs a failure and returns 422 when the titular phone is unusable', async () => {
    const { ctx, waha, inserts } = setup({ db: { adhesion: { ...ADHESION, titular_phone: 'No especificado' } } });
    const result = await run(ctx);
    expect(result.status).toBe(422);
    expect(result.body.status).toBe('failed');
    expect(waha.sendText).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ status: 'failed', error: 'invalid_phone', channel: 'whatsapp' });
  });

  it('logs a failure and returns 503 when the WhatsApp session is not ready', async () => {
    const { ctx, waha, inserts } = setup({ waha: { isSessionReady: vi.fn().mockResolvedValue(false) } });
    const result = await run(ctx);
    expect(result.status).toBe(503);
    expect(waha.sendText).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ status: 'failed', error: 'session_not_ready' });
  });

  it('logs a failure and returns 502 when the gateway rejects the send', async () => {
    const { ctx, inserts } = setup({ waha: { sendText: vi.fn().mockRejectedValue(new Error('WAHA 500: boom')) } });
    const result = await run(ctx);
    expect(result.status).toBe(502);
    expect(result.body.status).toBe('failed');
    expect(inserts[0]).toMatchObject({ status: 'failed' });
    expect(inserts[0].error).toContain('boom');
  });

  it('returns 409 without sending when the link was already sent in the last minute (whatsapp guard)', async () => {
    const { ctx, waha, inserts } = setup({ db: { lastSent: { created_at: '2026-09-20T11:59:30Z' } } });
    const result = await run(ctx);
    expect(result.status).toBe(409);
    expect(result.body.status).toBe('already_sent');
    expect(waha.sendText).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it('allows a resend once the previous send is older than a minute', async () => {
    const { ctx, waha } = setup({ db: { lastSent: { created_at: '2026-09-20T11:58:00Z' } } });
    const result = await run(ctx);
    expect(result.status).toBe(200);
    expect(waha.sendText).toHaveBeenCalledTimes(1);
  });
});

describe('sendPrescriptionViaWhatsApp', () => {
  const PRESCRIPTION = {
    id: 'rx-1',
    doctor_id: 'doc-1',
    patient_id: 'pat-1',
    doctor_name: 'Sergio Dib Ashur',
    pdf_url: 'https://storage.example/signed/receta.pdf?token=old',
    pdf_path: 'pat-1/rx-1-1690000000000.pdf',
  };
  const PATIENT = { full_name: 'Ana Pérez', phone: '011 15 1234-5678' };
  const FRESH_SIGNED_URL = 'https://storage.example/object/sign/prescriptions_pdfs/pat-1/rx-1-1690000000000.pdf?token=fresh';

  /**
   * Chainable fake of the few Supabase calls the service makes. `inserts`
   * collects every row written to prescription_deliveries. `storage` lets
   * tests control the `createSignedUrl` outcome (default: success).
   */
  function createSupabaseStub({
    prescription = PRESCRIPTION,
    patient = PATIENT,
    lastSent = null,
    createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: FRESH_SIGNED_URL }, error: null }),
  } = {}) {
    const inserts = [];
    const from = (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'prescriptions') return { data: prescription, error: null };
          if (table === 'profiles') return { data: patient, error: null };
          if (table === 'prescription_deliveries') return { data: lastSent, error: null };
          return { data: null, error: null };
        },
        insert: async (row) => {
          inserts.push(row);
          return { error: null };
        },
      };
      return chain;
    };
    const storage = { from: () => ({ createSignedUrl }) };
    return { client: { from, storage }, inserts, createSignedUrl };
  }

  const pdfFetch = () =>
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });

  function setup(overrides = {}) {
    const stub = createSupabaseStub(overrides.db);
    const waha = {
      isSessionReady: vi.fn().mockResolvedValue(true),
      sendFile: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      ...overrides.waha,
    };
    const fetchFn = overrides.fetchFn || pdfFetch();
    const now = overrides.now || (() => new Date('2026-09-20T12:00:00Z'));
    const ctx = { supabaseAdmin: stub.client, waha, fetchFn, now };
    return { ctx, waha, fetchFn, inserts: stub.inserts, createSignedUrl: stub.createSignedUrl };
  }

  const run = (ctx, requesterId = 'doc-1') =>
    sendPrescriptionViaWhatsApp(ctx, { prescriptionId: 'rx-1', requesterId });

  it('sends the PDF to the normalized patient number and logs success', async () => {
    const { ctx, waha, inserts, fetchFn, createSignedUrl } = setup();

    const result = await run(ctx);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'sent' });
    expect(createSignedUrl).toHaveBeenCalledWith(PRESCRIPTION.pdf_path, 60 * 60 * 48);
    expect(fetchFn).toHaveBeenCalledWith(FRESH_SIGNED_URL);
    const call = waha.sendFile.mock.calls[0][0];
    expect(call.phone).toBe('5491112345678');
    expect(call.filename).toMatch(/\.pdf$/);
    expect(call.caption).toContain('Ana Pérez');
    expect(call.caption).not.toMatch(/https?:\/\//);
    expect([...call.bytes]).toEqual([1, 2, 3]);
    expect(inserts).toEqual([
      expect.objectContaining({ prescription_id: 'rx-1', status: 'sent', requested_by: 'doc-1' }),
    ]);
  });

  it('mints a fresh signed URL from a legacy row that only has pdf_url', async () => {
    const legacyPublicUrl = `https://xyz.supabase.co/storage/v1/object/public/prescriptions_pdfs/${PRESCRIPTION.pdf_path}`;
    const { ctx, fetchFn, createSignedUrl } = setup({
      db: { prescription: { ...PRESCRIPTION, pdf_path: null, pdf_url: legacyPublicUrl } },
    });

    const result = await run(ctx);

    expect(result.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(PRESCRIPTION.pdf_path, 60 * 60 * 48);
    expect(fetchFn).toHaveBeenCalledWith(FRESH_SIGNED_URL);
  });

  it('returns 422 no_pdf when there is neither a usable pdf_path nor a parseable legacy pdf_url', async () => {
    const { ctx, waha } = setup({
      db: { prescription: { ...PRESCRIPTION, pdf_path: null, pdf_url: 'https://storage.example/not-a-bucket-url.pdf' } },
    });
    const result = await run(ctx);
    expect(result.status).toBe(422);
    expect(result.body).toEqual({ error: 'no_pdf' });
    expect(waha.sendFile).not.toHaveBeenCalled();
  });

  it('logs a failure and returns 502 when minting the signed URL fails', async () => {
    const { ctx, waha, inserts } = setup({
      db: { createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error('object not found') }) },
    });
    const result = await run(ctx);
    expect(result.status).toBe(502);
    expect(waha.sendFile).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ status: 'failed', error: 'pdf_unavailable' });
  });

  it('returns 404 when the prescription does not exist', async () => {
    const { ctx, waha } = setup({ db: { prescription: null } });
    const result = await run(ctx);
    expect(result.status).toBe(404);
    expect(waha.sendFile).not.toHaveBeenCalled();
  });

  it('returns 403 and sends nothing when the requester is not the issuing doctor', async () => {
    const { ctx, waha, inserts } = setup();
    const result = await run(ctx, 'someone-else');
    expect(result.status).toBe(403);
    expect(waha.sendFile).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it('logs a failure and returns 422 when the patient phone is unusable', async () => {
    const { ctx, waha, inserts } = setup({ db: { patient: { full_name: 'Ana', phone: 'No especificado' } } });
    const result = await run(ctx);
    expect(result.status).toBe(422);
    expect(result.body.status).toBe('failed');
    expect(waha.sendFile).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ status: 'failed', error: 'invalid_phone' });
  });

  it('logs a failure and returns 503 when the WhatsApp session is not ready', async () => {
    const { ctx, waha, inserts } = setup({ waha: { isSessionReady: vi.fn().mockResolvedValue(false) } });
    const result = await run(ctx);
    expect(result.status).toBe(503);
    expect(waha.sendFile).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ status: 'failed', error: 'session_not_ready' });
  });

  it('logs a failure and returns 502 when the gateway rejects the send', async () => {
    const { ctx, inserts } = setup({ waha: { sendFile: vi.fn().mockRejectedValue(new Error('WAHA 500: boom')) } });
    const result = await run(ctx);
    expect(result.status).toBe(502);
    expect(result.body.status).toBe('failed');
    expect(inserts[0]).toMatchObject({ status: 'failed' });
    expect(inserts[0].error).toContain('boom');
  });

  it('logs a failure and returns 502 when the PDF cannot be downloaded', async () => {
    const { ctx, waha, inserts } = setup({ fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 404 }) });
    const result = await run(ctx);
    expect(result.status).toBe(502);
    expect(waha.sendFile).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ status: 'failed', error: 'pdf_unavailable' });
  });

  it('returns 409 without sending when the prescription was already sent in the last minute', async () => {
    const { ctx, waha, inserts } = setup({ db: { lastSent: { created_at: '2026-09-20T11:59:30Z' } } });
    const result = await run(ctx);
    expect(result.status).toBe(409);
    expect(result.body.status).toBe('already_sent');
    expect(waha.sendFile).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it('allows a resend once the previous send is older than a minute', async () => {
    const { ctx, waha } = setup({ db: { lastSent: { created_at: '2026-09-20T11:58:00Z' } } });
    const result = await run(ctx);
    expect(result.status).toBe(200);
    expect(waha.sendFile).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when the prescription has no generated PDF', async () => {
    const { ctx, waha } = setup({ db: { prescription: { ...PRESCRIPTION, pdf_url: null, pdf_path: null } } });
    const result = await run(ctx);
    expect(result.status).toBe(422);
    expect(waha.sendFile).not.toHaveBeenCalled();
  });
});

describe('extractStoragePathFromPublicUrl', () => {
  it('extracts the path from a well-formed public bucket URL', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/public/prescriptions_pdfs/pat-1/rx-1-123.pdf';
    expect(extractStoragePathFromPublicUrl(url, 'prescriptions_pdfs')).toBe('pat-1/rx-1-123.pdf');
  });

  it('returns null when the URL does not match the expected prefix', () => {
    expect(extractStoragePathFromPublicUrl('https://example.com/foo.pdf', 'prescriptions_pdfs')).toBeNull();
  });

  it('returns null on missing input', () => {
    expect(extractStoragePathFromPublicUrl(null, 'prescriptions_pdfs')).toBeNull();
    expect(extractStoragePathFromPublicUrl(undefined, 'prescriptions_pdfs')).toBeNull();
  });
});
