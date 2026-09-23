import { describe, it, expect, vi } from 'vitest';
import {
  buildPatientAuthUser,
  buildActivationUrl,
  buildActivationEmail,
  sendActivationEmail,
  buildPaymentLinkEmail,
  sendPaymentLinkEmail,
} from '../affiliateActivation.js';

function buildRequest(overrides = {}) {
  return {
    titular_email: 'juan@test.com',
    titular_dni: '30123456',
    titular_first_name: 'Juan',
    titular_last_name: 'Pérez',
    titular_name: 'Juan Pérez',
    ...overrides,
  };
}

describe('buildPatientAuthUser', () => {
  it('never includes a password key derived from the DNI', () => {
    const payload = buildPatientAuthUser(buildRequest());
    expect(payload).not.toHaveProperty('password');
  });

  it('keeps email_confirm true and metadata (role, full_name, dni)', () => {
    const payload = buildPatientAuthUser(buildRequest());
    expect(payload.email_confirm).toBe(true);
    expect(payload.user_metadata).toEqual({
      role: 'patient',
      full_name: 'Juan Pérez',
      dni: '30123456',
    });
  });

  it('uses titular_email when present', () => {
    const payload = buildPatientAuthUser(buildRequest({ titular_email: 'real@test.com' }));
    expect(payload.email).toBe('real@test.com');
  });

  it('falls back to the synthetic <dni>@medinex-paciente.com address when titular_email is absent', () => {
    const payload = buildPatientAuthUser(buildRequest({ titular_email: '' }));
    expect(payload.email).toBe('30123456@medinex-paciente.com');
  });
});

describe('buildActivationUrl', () => {
  it('builds a hash-route URL with the token_hash', () => {
    const url = buildActivationUrl('https://medinex.com', 'abc123');
    expect(url).toBe('https://medinex.com/#/activar?token_hash=abc123');
  });

  it('trims a trailing slash from the base URL', () => {
    const url = buildActivationUrl('https://medinex.com/', 'abc123');
    expect(url).toBe('https://medinex.com/#/activar?token_hash=abc123');
  });

  it('URL-encodes the token hash', () => {
    const url = buildActivationUrl('https://medinex.com', 'a+b/c=');
    expect(url).toBe('https://medinex.com/#/activar?token_hash=a%2Bb%2Fc%3D');
  });
});

describe('buildActivationEmail', () => {
  it('contains the activation URL, a subject, and no credential claim', () => {
    const email = buildActivationEmail({
      fullName: 'Juan Pérez',
      activationUrl: 'https://medinex.com/#/activar?token_hash=abc',
    });
    expect(email.subject).toBe('Activá tu cuenta Medinex');
    expect(email.text).toContain('https://medinex.com/#/activar?token_hash=abc');
    expect(email.html).toContain('https://medinex.com/#/activar?token_hash=abc');
    expect(email.text.toLowerCase()).not.toContain('dni');
    expect(email.text.toLowerCase()).not.toContain('contraseña temporal');
    expect(email.html.toLowerCase()).not.toContain('dni');
  });
});

describe('sendActivationEmail', () => {
  const publicAppUrl = 'https://medinex.com';
  const fromAddress = 'no-reply@medinex.com';

  function buildDeps({ generateLinkResult, sendMailImpl } = {}) {
    const supabaseAdmin = {
      auth: {
        admin: {
          generateLink: vi.fn().mockResolvedValue(
            generateLinkResult || { data: { properties: { hashed_token: 'tok-1' } }, error: null }
          ),
        },
      },
    };
    const sendMail = sendMailImpl || vi.fn().mockResolvedValue({ messageId: 'x' });
    const createMailTransporter = vi.fn().mockResolvedValue({ sendMail });
    return { supabaseAdmin, createMailTransporter, sendMail };
  }

  it('returns {sent:true} on the happy path and sends via the injected transporter', async () => {
    const { supabaseAdmin, createMailTransporter, sendMail } = buildDeps();

    const result = await sendActivationEmail(
      { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
      { email: 'juan@test.com', fullName: 'Juan Pérez' }
    );

    expect(result).toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'juan@test.com' }));
  });

  it('returns {sent:false, reason} and never throws when generateLink errors', async () => {
    const { supabaseAdmin, createMailTransporter } = buildDeps({
      generateLinkResult: { data: null, error: { message: 'boom' } },
    });

    const result = await sendActivationEmail(
      { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
      { email: 'juan@test.com', fullName: 'Juan Pérez' }
    );

    expect(result).toEqual({ sent: false, reason: 'generate_link_failed' });
  });

  it('returns {sent:false, reason} and never throws when sendMail rejects', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { supabaseAdmin, createMailTransporter } = buildDeps({ sendMailImpl: sendMail });

    const result = await sendActivationEmail(
      { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
      { email: 'juan@test.com', fullName: 'Juan Pérez' }
    );

    expect(result).toEqual({ sent: false, reason: 'send_failed' });
  });

  it('returns {sent:false, reason: "missing_public_app_url"} without calling generateLink when PUBLIC_APP_URL is empty', async () => {
    const { supabaseAdmin, createMailTransporter } = buildDeps();

    const result = await sendActivationEmail(
      { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl: '' },
      { email: 'juan@test.com', fullName: 'Juan Pérez' }
    );

    expect(result).toEqual({ sent: false, reason: 'missing_public_app_url' });
    expect(supabaseAdmin.auth.admin.generateLink).not.toHaveBeenCalled();
  });
});

describe('buildPaymentLinkEmail', () => {
  it('contains the payment URL, a subject, and the HTML-escaped full name', () => {
    const email = buildPaymentLinkEmail({
      fullName: 'Juan <script>Pérez</script>',
      paymentUrl: 'https://mp.example/pay/abc',
    });
    expect(email.subject).toBe('Completá el pago de tu adhesión a Medinex');
    expect(email.text).toContain('https://mp.example/pay/abc');
    expect(email.text).toContain('Juan <script>Pérez</script>');
    expect(email.html).toContain('https://mp.example/pay/abc');
    expect(email.html).not.toContain('<script>Pérez</script>');
    expect(email.html).toContain('Juan &lt;script&gt;Pérez&lt;/script&gt;');
  });
});

describe('sendPaymentLinkEmail', () => {
  const fromAddress = 'no-reply@medinex.com';
  const ADHESION = { id: 'adh-1' };
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
    const sendMail = overrides.sendMailImpl || vi.fn().mockResolvedValue({ messageId: 'x' });
    const createMailTransporter = vi.fn().mockResolvedValue({ sendMail });
    const now = overrides.now || (() => new Date('2026-09-20T12:00:00Z'));
    const ctx = { supabaseAdmin: stub.client, createMailTransporter, fromAddress, now };
    return { ctx, sendMail, createMailTransporter, inserts: stub.inserts };
  }

  const run = (ctx, overrides = {}) =>
    sendPaymentLinkEmail(ctx, {
      adhesionRequestId: 'adh-1',
      email: 'juan@test.com',
      fullName: 'Juan Pérez',
      paymentUrl: PAYMENT_URL,
      ...overrides,
    });

  it('sends the payment link email and logs success', async () => {
    const { ctx, sendMail, inserts } = setup();

    const result = await run(ctx);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'sent' });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: `"Medinex" <${fromAddress}>`,
        to: 'juan@test.com',
        subject: 'Completá el pago de tu adhesión a Medinex',
      })
    );
    expect(sendMail.mock.calls[0][0].text).toContain(PAYMENT_URL);
    expect(inserts).toEqual([
      expect.objectContaining({ adhesion_request_id: 'adh-1', channel: 'email', status: 'sent' }),
    ]);
  });

  it('returns 404 when the adhesion request does not exist', async () => {
    const { ctx, sendMail } = setup({ db: { adhesion: null } });
    const result = await run(ctx);
    expect(result.status).toBe(404);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('returns 409 without sending when the link was already sent in the last minute (email guard)', async () => {
    const { ctx, sendMail, inserts } = setup({ db: { lastSent: { created_at: '2026-09-20T11:59:30Z' } } });
    const result = await run(ctx);
    expect(result.status).toBe(409);
    expect(result.body.status).toBe('already_sent');
    expect(sendMail).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it('logs a failure and returns 422 when the email is missing or unusable', async () => {
    const { ctx, sendMail, inserts } = setup();
    const result = await run(ctx, { email: '   ' });
    expect(result.status).toBe(422);
    expect(result.body.status).toBe('failed');
    expect(sendMail).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ status: 'failed', error: 'invalid_email', channel: 'email' });
  });

  it('allows a resend once the previous send is older than a minute', async () => {
    const { ctx, sendMail } = setup({ db: { lastSent: { created_at: '2026-09-20T11:58:00Z' } } });
    const result = await run(ctx);
    expect(result.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('logs a failure and returns 502 when the transporter throws, and never throws itself', async () => {
    const sendMailImpl = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { ctx, inserts } = setup({ sendMailImpl });

    const result = await run(ctx);

    expect(result.status).toBe(502);
    expect(result.body.status).toBe('failed');
    expect(inserts[0]).toMatchObject({ status: 'failed', channel: 'email' });
    expect(inserts[0].error).toContain('smtp down');
  });

  it('still returns the sent result even when the delivery-log insert fails', async () => {
    const stub = createSupabaseStub();
    stub.client.from = ((original) => (table) => {
      const chain = original(table);
      if (table === 'adhesion_payment_link_deliveries') {
        return { ...chain, insert: async () => ({ error: { message: 'insert failed' } }) };
      }
      return chain;
    })(stub.client.from);
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });
    const createMailTransporter = vi.fn().mockResolvedValue({ sendMail });
    const ctx = {
      supabaseAdmin: stub.client,
      createMailTransporter,
      fromAddress,
      now: () => new Date('2026-09-20T12:00:00Z'),
    };

    const result = await run(ctx);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'sent' });
    expect(sendMail).toHaveBeenCalled();
  });
});
