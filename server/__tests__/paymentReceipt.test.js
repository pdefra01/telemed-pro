import { describe, it, expect, vi } from 'vitest';
import { buildPaymentReceiptEmail, formatReceiptNumber, sendPaymentReceiptEmail } from '../paymentReceipt.js';

describe('formatReceiptNumber', () => {
  it('uses the same 0001-00000000 format as the PDF receipt', () => {
    expect(formatReceiptNumber(123)).toBe('0001-00000123');
  });

  it('returns null when there is no receipt number', () => {
    expect(formatReceiptNumber(null)).toBeNull();
  });
});

describe('buildPaymentReceiptEmail', () => {
  const base = {
    fullName: 'Hebe Trillo',
    receiptNumber: '0001-00000042',
    amount: 14999,
    period: '2026-11',
    paidAt: '2026-11-09T20:46:56Z',
    paymentsUrl: 'https://medinex.duckdns.org/#/payments',
  };

  it('includes the receipt number, amount, period and the payments link in both bodies', () => {
    const email = buildPaymentReceiptEmail(base);
    expect(email.subject).toBe('Recibimos tu pago - Medinex');
    for (const body of [email.text, email.html]) {
      expect(body).toContain('0001-00000042');
      expect(body).toContain('14.999');
      expect(body).toContain('11/2026');
      expect(body).toContain('https://medinex.duckdns.org/#/payments');
    }
  });

  it('HTML-escapes the applicant-controlled name', () => {
    const email = buildPaymentReceiptEmail({ ...base, fullName: '<b>Hebe</b>' });
    expect(email.html).not.toContain('<b>Hebe</b>');
    expect(email.html).toContain('&lt;b&gt;Hebe&lt;/b&gt;');
  });
});

function buildDeps({ movement, profile, invoice, sendMailImpl } = {}) {
  const rows = {
    affiliate_account_movements: movement === undefined
      ? { id: 'mv-1', entity_id: 'prof-1', amount: 14999, receipt_number: 42, invoice_id: 'inv-1', created_at: '2026-11-09T20:46:56Z' }
      : movement,
    profiles: profile === undefined
      ? { email: 'valencoti@gmail.com', first_name: 'Hebe', last_name: 'Trillo', full_name: null }
      : profile,
    invoices: invoice === undefined ? { period: '2026-11' } : invoice,
  };
  const supabaseAdmin = {
    from: (table) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: rows[table], error: null }),
      };
      return builder;
    },
  };
  const sendMail = sendMailImpl || vi.fn().mockResolvedValue({ messageId: 'x' });
  const createMailTransporter = vi.fn().mockResolvedValue({ sendMail });
  return {
    deps: { supabaseAdmin, createMailTransporter, fromAddress: 'no-reply@medinex.com', publicAppUrl: 'https://medinex.duckdns.org/' },
    sendMail,
  };
}

describe('sendPaymentReceiptEmail', () => {
  it('sends the receipt to the titular email', async () => {
    const { deps, sendMail } = buildDeps();

    const result = await sendPaymentReceiptEmail(deps, { movementId: 'mv-1' });

    expect(result).toEqual({ sent: true });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('valencoti@gmail.com');
    expect(mail.from).toBe('"Medinex" <no-reply@medinex.com>');
    expect(mail.text).toContain('Hola Hebe Trillo');
    expect(mail.text).toContain('0001-00000042');
    expect(mail.text).toContain('https://medinex.duckdns.org/#/payments');
  });

  it('does not send when the movement is missing', async () => {
    const { deps, sendMail } = buildDeps({ movement: null });
    expect(await sendPaymentReceiptEmail(deps, { movementId: 'mv-x' })).toEqual({ sent: false, reason: 'movement_not_found' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not send when the titular has no email', async () => {
    const { deps, sendMail } = buildDeps({ profile: { email: null, first_name: 'Hebe', last_name: 'Trillo' } });
    expect(await sendPaymentReceiptEmail(deps, { movementId: 'mv-1' })).toEqual({ sent: false, reason: 'no_email' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('never throws when sending fails', async () => {
    const { deps } = buildDeps({ sendMailImpl: vi.fn().mockRejectedValue(new Error('smtp down')) });
    expect(await sendPaymentReceiptEmail(deps, { movementId: 'mv-1' })).toEqual({ sent: false, reason: 'send_failed' });
  });
});
