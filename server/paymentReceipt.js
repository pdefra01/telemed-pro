// server/paymentReceipt.js
//
// Best-effort payment receipt email (odd/debito-charge-invoice, S6). Sent when
// the Mercado Pago webhook circuit posts a payment movement; mirrors
// server/affiliateActivation.js's conventions.
//
// `sendPaymentReceiptEmail` NEVER throws — a failure here must never block or
// fail the payment settlement that triggered it.

/** Same point-of-sale prefix the PDF receipt uses (src/pages/admin/AffiliateLedgerModal.tsx). */
const RECEIPT_POS_PREFIX = '0001';

export function formatReceiptNumber(receiptNumber) {
  if (receiptNumber === null || receiptNumber === undefined) return null;
  return `${RECEIPT_POS_PREFIX}-${String(receiptNumber).padStart(8, '0')}`;
}

function formatAmount(amount) {
  return `$${Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** 'YYYY-MM' -> 'MM/YYYY'. */
function formatPeriod(period) {
  const match = /^(\d{4})-(\d{2})$/.exec(period || '');
  return match ? `${match[2]}/${match[1]}` : period || '';
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/** Escapes HTML special characters so the applicant's self-submitted name
 * cannot break out of the surrounding markup. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pure builder for the receipt email. `fullName` is applicant-controlled and
 * is HTML-escaped in `html`; the plain-text body needs no escaping.
 */
export function buildPaymentReceiptEmail({ fullName, receiptNumber, amount, period, paidAt, paymentsUrl }) {
  const subject = 'Recibimos tu pago - Medinex';
  const lines = [
    receiptNumber ? `Recibo N°: ${receiptNumber}` : null,
    `Monto: ${formatAmount(amount)}`,
    period ? `Período: ${formatPeriod(period)}` : null,
    paidAt ? `Fecha: ${formatDate(paidAt)}` : null,
  ].filter(Boolean);

  const text = `Hola ${fullName},\n\nRegistramos tu pago. Tu cuenta corriente ya está actualizada.\n\n${lines.join('\n')}\n\nPodés ver y descargar tus comprobantes en Mis Pagos:\n${paymentsUrl}\n\nGracias por confiar en Medinex.`;

  const rows = lines
    .map((line) => {
      const [label, ...rest] = line.split(': ');
      return `<tr><td style="color: #94a3b8; font-size: 13px; padding: 6px 0;">${label}</td><td style="color: #f1f5f9; font-size: 14px; font-weight: 700; text-align: right; padding: 6px 0;">${rest.join(': ')}</td></tr>`;
    })
    .join('');

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #10b981, #0d9488); padding: 32px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; letter-spacing: 0.05em;">MED<span style="color: #fff;">IN</span>EX</h1>
        <p style="margin: 4px 0 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.8;">Salud Digital</p>
      </div>
      <div style="padding: 40px 32px;">
        <h2 style="margin: 0 0 8px; font-size: 20px; color: #f1f5f9;">¡Hola, ${escapeHtml(fullName)}!</h2>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Registramos tu pago. Tu cuenta corriente ya está actualizada.</p>
        <table style="width: 100%; margin: 24px 0; border-top: 1px solid #1e293b; border-bottom: 1px solid #1e293b;">${rows}</table>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${paymentsUrl}" style="display: inline-block; background: #10b981; color: #0f172a; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px;">Ver mis pagos</a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.6;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br/><span style="word-break: break-all;">${paymentsUrl}</span></p>
      </div>
      <div style="border-top: 1px solid #1e293b; padding: 16px 32px; text-align: center;">
        <p style="color: #475569; font-size: 11px; margin: 0;">Medinex &mdash; Plataforma de Salud Digital</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

/**
 * Sends the receipt for one posted payment movement. NEVER throws.
 *
 * @returns {Promise<{ sent: boolean, reason?: 'movement_not_found' | 'no_email' | 'send_failed' }>}
 */
export async function sendPaymentReceiptEmail(
  { supabaseAdmin, createMailTransporter, fromAddress, publicAppUrl },
  { movementId }
) {
  try {
    const { data: movement } = await supabaseAdmin
      .from('affiliate_account_movements')
      .select('id, entity_id, amount, receipt_number, invoice_id, created_at')
      .eq('id', movementId)
      .maybeSingle();
    if (!movement) return { sent: false, reason: 'movement_not_found' };

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name, full_name')
      .eq('id', movement.entity_id)
      .maybeSingle();
    if (!profile?.email) return { sent: false, reason: 'no_email' };

    let period = null;
    if (movement.invoice_id) {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('period')
        .eq('id', movement.invoice_id)
        .maybeSingle();
      period = invoice?.period || null;
    }

    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.full_name || 'afiliado';
    const paymentsUrl = `${(publicAppUrl || '').replace(/\/+$/, '')}/#/payments`;
    const { subject, text, html } = buildPaymentReceiptEmail({
      fullName,
      receiptNumber: formatReceiptNumber(movement.receipt_number),
      amount: movement.amount,
      period,
      paidAt: movement.created_at,
      paymentsUrl,
    });

    const transporter = await createMailTransporter();
    await transporter.sendMail({ from: `"Medinex" <${fromAddress}>`, to: profile.email, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('[paymentReceipt] sendPaymentReceiptEmail failed:', err?.message || String(err));
    return { sent: false, reason: 'send_failed' };
  }
}
