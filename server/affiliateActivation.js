// server/affiliateActivation.js
//
// Best-effort activation-email flow for approved affiliates
// (sdd/affiliate-credential-provisioning). Mirrors server/mercadopago.js's
// convention: this module owns everything domain-specific about
// activation-link generation and email delivery — server.js keeps only
// routing/orchestration around it.
//
// `sendActivationEmail` NEVER throws — mirrors `notifyPaymentSettled`
// (server.js) so a failure here can never block or fail the approval
// response (spec "Best-Effort Activation Email (Non-Blocking)").
//
// The activation link is NOT delivered through GoTrue's `redirect_to`
// machinery. It is built here from `generateLink(...).properties.hashed_token`
// and consumed by `supabase.auth.verifyOtp({ type: 'recovery', token_hash })`
// on `/activar` (design D2) — forced by the app being a HashRouter.

/**
 * Pure builder for the Supabase Auth `createUser` payload. Never includes a
 * `password` key (not even `password: undefined`) — approved affiliates get
 * their password via the activation-email recovery link, not a DNI-derived
 * secret (spec "No Plaintext-DNI Password On Approval").
 */
export function buildPatientAuthUser(request) {
  const targetEmail = request.titular_email?.trim() || `${request.titular_dni.trim()}@medinex-paciente.com`;
  const titularFullName =
    `${request.titular_first_name || ''} ${request.titular_last_name || ''}`.trim() || request.titular_name;

  return {
    email: targetEmail,
    email_confirm: true,
    user_metadata: {
      role: 'patient',
      full_name: titularFullName,
      dni: request.titular_dni.trim(),
    },
  };
}

/**
 * Builds the `/activar` link consumed by SetPassword.tsx via `verifyOtp`
 * (design D2). Trims a trailing slash from the base URL and URL-encodes the
 * token hash.
 */
export function buildActivationUrl(baseUrl, tokenHash) {
  const trimmedBase = (baseUrl || '').replace(/\/+$/, '');
  return `${trimmedBase}/#/activar?token_hash=${encodeURIComponent(tokenHash)}`;
}

/** Escapes HTML special characters so untrusted text (the applicant's own
 * self-submitted name) can never break out of the surrounding markup when
 * interpolated into the HTML email body (Judgment Day finding). */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pure builder for the activation email's content. No DNI, no password,
 * ever, in the message (design "Interfaces / Contracts"). `fullName` is
 * applicant-controlled (public /adhesion form) and MUST be HTML-escaped
 * before interpolation into `html` — the plain-text `text` body needs no
 * escaping.
 */
export function buildActivationEmail({ fullName, activationUrl }) {
  const subject = 'Activá tu cuenta Medinex';
  const text = `Hola ${fullName},\n\nTu afiliación fue aprobada. Para activar tu cuenta y crear tu contraseña, ingresá al siguiente enlace:\n${activationUrl}\n\nEste enlace es de un solo uso y vence pronto. Si el enlace venció, contactate con administración.`;
  const safeFullName = escapeHtml(fullName);
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #10b981, #0d9488); padding: 32px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; letter-spacing: 0.05em;">MED<span style="color: #fff;">IN</span>EX</h1>
        <p style="margin: 4px 0 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.8;">Salud Digital</p>
      </div>
      <div style="padding: 40px 32px;">
        <h2 style="margin: 0 0 8px; font-size: 20px; color: #f1f5f9;">¡Hola, ${safeFullName}!</h2>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Tu afiliación fue aprobada. Creá tu contraseña para empezar a usar Medinex.</p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${activationUrl}" style="display: inline-block; background: #10b981; color: #0f172a; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px;">Crear mi contraseña</a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.6;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br/><span style="word-break: break-all;">${activationUrl}</span></p>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">Este enlace es de un solo uso y vence pronto. Si venció, contactate con administración.</p>
      </div>
      <div style="border-top: 1px solid #1e293b; padding: 16px 32px; text-align: center;">
        <p style="color: #475569; font-size: 11px; margin: 0;">Medinex &mdash; Plataforma de Salud Digital</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

// Minimum gap between two successful sends of the same adhesion payment
// link over email. Independent from the WhatsApp guard in server/whatsapp.js
// (different channel, own row in `adhesion_payment_link_deliveries`) — same
// 60s value, redeclared here because whatsapp.js does not export its
// constant.
const PAYMENT_LINK_RESEND_GUARD_MS = 60_000;

/**
 * Pure builder for the payment-link email's content, styled consistently
 * with `buildActivationEmail`. `fullName` is applicant-controlled and MUST
 * be HTML-escaped before interpolation into `html` — the plain-text `text`
 * body needs no escaping.
 */
export function buildPaymentLinkEmail({ fullName, paymentUrl }) {
  const subject = 'Completá el pago de tu adhesión a Medinex';
  const text = `Hola ${fullName},\n\nEste es el link para completar el pago de tu adhesión a Medinex:\n${paymentUrl}\n\nSi tenés alguna consulta, contactate con administración.`;
  const safeFullName = escapeHtml(fullName);
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #10b981, #0d9488); padding: 32px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; letter-spacing: 0.05em;">MED<span style="color: #fff;">IN</span>EX</h1>
        <p style="margin: 4px 0 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.8;">Salud Digital</p>
      </div>
      <div style="padding: 40px 32px;">
        <h2 style="margin: 0 0 8px; font-size: 20px; color: #f1f5f9;">¡Hola, ${safeFullName}!</h2>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Completá el pago de tu adhesión a Medinex para terminar de activar tu cuenta.</p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${paymentUrl}" style="display: inline-block; background: #10b981; color: #0f172a; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px;">Pagar con Mercado Pago</a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.6;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br/><span style="word-break: break-all;">${paymentUrl}</span></p>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">Si tenés alguna consulta, contactate con administración.</p>
      </div>
      <div style="border-top: 1px solid #1e293b; padding: 16px 32px; text-align: center;">
        <p style="color: #475569; font-size: 11px; margin: 0;">Medinex &mdash; Plataforma de Salud Digital</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

/**
 * Sends the Mercado Pago payment link over email for an adhesion request.
 * NEVER throws — same contract as `sendActivationEmail`. `email`, `fullName`
 * and `paymentUrl` are resolved by the caller (the send-payment-link
 * endpoint, which already fetched/created the MP link); this function only
 * delivers it and logs the attempt to `adhesion_payment_link_deliveries`
 * (channel: 'email'), mirroring `sendPaymentLinkViaWhatsApp`
 * (server/whatsapp.js) so both channels return the same `{ status, body }`
 * shape for the HTTP layer.
 */
export async function sendPaymentLinkEmail(
  { supabaseAdmin, createMailTransporter, fromAddress, now = () => new Date() },
  { adhesionRequestId, email, fullName, paymentUrl }
) {
  const { data: adhesion } = await supabaseAdmin
    .from('adhesion_requests')
    .select('id')
    .eq('id', adhesionRequestId)
    .maybeSingle();

  if (!adhesion) return { status: 404, body: { error: 'adhesion_request_not_found' } };

  const record = async (status, error = null) => {
    const { error: insertError } = await supabaseAdmin.from('adhesion_payment_link_deliveries').insert({
      adhesion_request_id: adhesion.id,
      channel: 'email',
      status,
      error,
      requested_by: null,
    });
    if (insertError) console.error('[affiliateActivation] could not log payment link delivery:', insertError.message);
  };
  const fail = async (httpStatus, reason) => {
    await record('failed', reason.slice(0, 500));
    return { status: httpStatus, body: { status: 'failed', reason } };
  };

  const { data: lastSent } = await supabaseAdmin
    .from('adhesion_payment_link_deliveries')
    .select('created_at')
    .eq('adhesion_request_id', adhesion.id)
    .eq('channel', 'email')
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastSent && now() - new Date(lastSent.created_at) < PAYMENT_LINK_RESEND_GUARD_MS) {
    return { status: 409, body: { status: 'already_sent' } };
  }

  const { subject, text, html } = buildPaymentLinkEmail({ fullName, paymentUrl });

  try {
    const transporter = await createMailTransporter();
    await transporter.sendMail({
      from: `"Medinex" <${fromAddress}>`,
      to: email,
      subject,
      text,
      html,
    });
  } catch (err) {
    return fail(502, `send_failed: ${err?.message || err}`);
  }

  await record('sent');
  return { status: 200, body: { status: 'sent' } };
}

/**
 * Sends the activation email. NEVER throws — mirrors `notifyPaymentSettled`
 * (server.js) exactly. Deps are injected so this stays unit-testable with
 * stubs at zero runtime risk (design D4).
 *
 * @returns {Promise<{ sent: boolean, reason?: 'missing_public_app_url' | 'generate_link_failed' | 'send_failed' }>}
 */
export async function sendActivationEmail(
  { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
  { email, fullName }
) {
  if (!publicAppUrl) {
    console.error('[affiliateActivation] PUBLIC_APP_URL is empty — cannot build an activation link.');
    return { sent: false, reason: 'missing_public_app_url' };
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (error || !data?.properties?.hashed_token) {
      console.error('[affiliateActivation] generateLink failed:', error?.message || 'no hashed_token returned');
      return { sent: false, reason: 'generate_link_failed' };
    }

    const activationUrl = buildActivationUrl(publicAppUrl, data.properties.hashed_token);
    const { subject, text, html } = buildActivationEmail({ fullName, activationUrl });

    const transporter = await createMailTransporter();
    await transporter.sendMail({
      from: `"Medinex" <${fromAddress}>`,
      to: email,
      subject,
      text,
      html,
    });

    return { sent: true };
  } catch (err) {
    console.error('[affiliateActivation] sendActivationEmail failed:', err?.message || String(err));
    return { sent: false, reason: 'send_failed' };
  }
}
