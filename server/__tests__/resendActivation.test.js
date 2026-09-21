import { describe, it, expect, vi } from 'vitest';
import { resendActivationHandler, isPlaceholderEmail, RESEND_COOLDOWN_MS } from '../resendActivation.js';

function createRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function createSupabase({ authUser = { id: 'p1', email: 'juan@test.com' }, authError = null, profile = { id: 'p1', role: 'patient', full_name: 'Juan Pérez' }, linkError = null } = {}) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: authUser }, error: authError })),
        generateLink: vi.fn(async () => (linkError ? { data: null, error: linkError } : { data: { properties: { hashed_token: 'tok' } }, error: null })),
      },
    },
    from: () => {
      const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: profile, error: null }) };
      return b;
    },
  };
}

function setup({ supabase = createSupabase(), sendMail = vi.fn(async () => ({})), publicAppUrl = 'https://app.test', now = () => 1000 } = {}) {
  const handler = resendActivationHandler({
    supabaseAdmin: supabase,
    createMailTransporter: async () => ({ sendMail }),
    fromAddress: 'no-reply@test.com',
    publicAppUrl,
    now,
  });
  return { handler, sendMail, supabase };
}

const call = async (handler, body = { profileId: 'p1' }) => {
  const res = createRes();
  await handler({ body, user: { id: 'admin-1' } }, res);
  return res;
};

describe('isPlaceholderEmail', () => {
  it('detects the DNI placeholder domain only', () => {
    expect(isPlaceholderEmail('30123456@medinex-paciente.com')).toBe(true);
    expect(isPlaceholderEmail('Juan@Test.com')).toBe(false);
    expect(isPlaceholderEmail(undefined)).toBe(false);
  });
});

describe('resendActivationHandler', () => {
  it('503 when supabaseAdmin is missing', async () => {
    const h = resendActivationHandler({ supabaseAdmin: null });
    expect((await call(h)).statusCode).toBe(503);
  });

  it('400 when profileId is missing', async () => {
    const { handler } = setup();
    expect((await call(handler, {})).statusCode).toBe(400);
  });

  it('404 when the auth user does not exist', async () => {
    const { handler } = setup({ supabase: createSupabase({ authUser: null }) });
    expect((await call(handler)).statusCode).toBe(404);
  });

  it('404 when the profile does not exist', async () => {
    const { handler } = setup({ supabase: createSupabase({ profile: null }) });
    expect((await call(handler)).statusCode).toBe(404);
  });

  it('400 when the profile is not a patient', async () => {
    const { handler, sendMail } = setup({ supabase: createSupabase({ profile: { id: 'p1', role: 'doctor', full_name: 'Dr' } }) });
    const res = await call(handler);
    expect(res.statusCode).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('400 with a clear message for the placeholder email', async () => {
    const { handler, sendMail } = setup({ supabase: createSupabase({ authUser: { id: 'p1', email: '30123456@medinex-paciente.com' } }) });
    const res = await call(handler);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/email real/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends the activation email and answers ok', async () => {
    const { handler, sendMail } = setup();
    const res = await call(handler);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, sent: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('juan@test.com');
    expect(sendMail.mock.calls[0][0].text).toContain('Juan Pérez');
  });

  it('429 with remaining seconds inside the cooldown, allowed after the clock advances', async () => {
    let t = 1000;
    const { handler, sendMail } = setup({ now: () => t });
    expect((await call(handler)).statusCode).toBe(200);
    t += 20_000;
    const blocked = await call(handler);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body.retryAfterSeconds).toBe(40);
    expect(blocked.body.error).toContain('40');
    expect(sendMail).toHaveBeenCalledTimes(1);
    t += RESEND_COOLDOWN_MS;
    expect((await call(handler)).statusCode).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('cooldown is per profile', async () => {
    const { handler } = setup();
    expect((await call(handler, { profileId: 'p1' })).statusCode).toBe(200);
    expect((await call(handler, { profileId: 'p2' })).statusCode).toBe(200);
  });

  it('502 missing_public_app_url', async () => {
    const { handler } = setup({ publicAppUrl: '' });
    const res = await call(handler);
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ ok: false, reason: 'missing_public_app_url' });
    expect(res.body.error).toMatch(/PUBLIC_APP_URL/);
  });

  it('502 generate_link_failed', async () => {
    const { handler } = setup({ supabase: createSupabase({ linkError: { message: 'boom' } }) });
    const res = await call(handler);
    expect(res.statusCode).toBe(502);
    expect(res.body.reason).toBe('generate_link_failed');
  });

  it('502 send_failed mentions SMTP, and failures do not start the cooldown', async () => {
    const sendMail = vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValue({});
    const { handler } = setup({ sendMail });
    const res = await call(handler);
    expect(res.statusCode).toBe(502);
    expect(res.body.reason).toBe('send_failed');
    expect(res.body.error).toMatch(/SMTP/);
    expect((await call(handler)).statusCode).toBe(200);
  });

  it('never logs the email or token', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { handler } = setup();
    await call(handler);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain('admin-1');
    expect(logged).toContain('p1');
    expect(logged).not.toContain('juan@test.com');
    expect(logged).not.toContain('tok');
    spy.mockRestore();
  });
});
