import { describe, it, expect, vi } from 'vitest';
import {
  buildPatientAuthUser,
  buildActivationUrl,
  buildActivationEmail,
  sendActivationEmail,
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
