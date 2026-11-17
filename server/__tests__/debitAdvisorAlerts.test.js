import { describe, it, expect, vi } from 'vitest';
import { buildDebitAlert, runDebitAdvisorAlerts, startDebitAdvisorAlertsJob } from '../debitAdvisorAlerts.js';

const quietLogger = () => ({ log: vi.fn(), error: vi.fn() });

const DUE = {
  subscription_id: 'sub-1',
  kind: 'not_completed',
  event_at: '2026-11-02T15:00:00.000Z',
  affiliate_id: 'aff-1',
  affiliate_name: 'Nelida Manzano',
  affiliate_phone: '3874000000',
  advisor_id: 'adv-1',
  advisor_phone: '3875111111',
  failure_count: 0,
};

/** Service client stub: the due rpc, and inserts into the claim and notification tables. */
function createSupabaseStub({ due = [], rpcError = null, claimErrors = {}, notifyError = null } = {}) {
  const inserts = { debit_advisor_alerts: [], notifications: [] };
  const rpc = vi.fn(async () => ({ data: rpcError ? null : due, error: rpcError }));
  const from = (table) => ({
    insert: async (row) => {
      if (table === 'debit_advisor_alerts' && claimErrors[row.subscription_id]) {
        return { error: claimErrors[row.subscription_id] };
      }
      if (table === 'notifications' && notifyError) return { error: notifyError };
      inserts[table].push(row);
      return { error: null };
    },
  });
  return { rpc, from, inserts };
}

describe('buildDebitAlert', () => {
  it('names the affiliate, the date and the next step for a debit never completed', () => {
    const { title, message } = buildDebitAlert(DUE);
    expect(title).toBe('Nelida Manzano no completó la adhesión al débito automático');
    expect(message).toContain('Inició la adhesión el 2/11/2026.');
    expect(message).toContain('Teléfono: 3874000000');
    expect(message).toContain('Contactalo para que termine de autorizar el débito en Mercado Pago.');
  });

  it('counts the rejections of a rejected debit', () => {
    const { title, message } = buildDebitAlert({ ...DUE, kind: 'rejected', failure_count: 3 });
    expect(title).toBe('Nelida Manzano tiene el débito automático rechazado');
    expect(message).toContain('Último rechazo: 2/11/2026 (3 rechazos).');
  });

  it('tells a debit cancelled by the affiliate', () => {
    const { title, message } = buildDebitAlert({ ...DUE, kind: 'cancelled' });
    expect(title).toBe('Nelida Manzano canceló el débito automático');
    expect(message).toContain('Lo canceló el 2/11/2026.');
  });
});

describe('runDebitAdvisorAlerts', () => {
  it('claims each due alert, then notifies the advisor in the app and by WhatsApp', async () => {
    const supabaseAdmin = createSupabaseStub({ due: [DUE] });
    const waha = { sendText: vi.fn(async () => ({})) };

    const result = await runDebitAdvisorAlerts({ supabaseAdmin, waha, logger: quietLogger() });

    expect(result).toEqual({ ok: true, due: 1, sent: 1, skipped: 0, errors: 0 });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('debit_advisor_alerts_due', { p_pending_after: '1 day' });
    expect(supabaseAdmin.inserts.debit_advisor_alerts).toEqual([
      { subscription_id: 'sub-1', kind: 'not_completed', event_at: DUE.event_at, advisor_id: 'adv-1' },
    ]);
    expect(supabaseAdmin.inserts.notifications).toEqual([
      expect.objectContaining({
        user_id: 'adv-1',
        title: 'Nelida Manzano no completó la adhesión al débito automático',
        type: 'warning',
        link: '/collections',
      }),
    ]);
    expect(waha.sendText).toHaveBeenCalledWith({
      phone: '5493875111111',
      text: expect.stringContaining('Nelida Manzano no completó la adhesión al débito automático'),
    });
  });

  it('sends nothing for an alert another run already claimed', async () => {
    const supabaseAdmin = createSupabaseStub({ due: [DUE], claimErrors: { 'sub-1': { code: '23505', message: 'duplicate' } } });
    const waha = { sendText: vi.fn() };

    const result = await runDebitAdvisorAlerts({ supabaseAdmin, waha, logger: quietLogger() });

    expect(result).toEqual({ ok: true, due: 1, sent: 0, skipped: 1, errors: 0 });
    expect(supabaseAdmin.inserts.notifications).toEqual([]);
    expect(waha.sendText).not.toHaveBeenCalled();
  });

  it('still sends the in-app notice without a WhatsApp gateway or without a valid advisor phone', async () => {
    const noGateway = createSupabaseStub({ due: [DUE] });
    await runDebitAdvisorAlerts({ supabaseAdmin: noGateway, waha: null, logger: quietLogger() });
    expect(noGateway.inserts.notifications).toHaveLength(1);

    const noPhone = createSupabaseStub({ due: [{ ...DUE, advisor_phone: null }] });
    const waha = { sendText: vi.fn() };
    const result = await runDebitAdvisorAlerts({ supabaseAdmin: noPhone, waha, logger: quietLogger() });
    expect(result).toMatchObject({ sent: 1, errors: 0 });
    expect(noPhone.inserts.notifications).toHaveLength(1);
    expect(waha.sendText).not.toHaveBeenCalled();
  });

  it('keeps going when one channel fails, counting the error', async () => {
    const second = { ...DUE, subscription_id: 'sub-2', advisor_id: 'adv-2' };
    const supabaseAdmin = createSupabaseStub({ due: [DUE, second] });
    const waha = { sendText: vi.fn().mockRejectedValueOnce(new Error('WAHA 500')).mockResolvedValue({}) };
    const logger = quietLogger();

    const result = await runDebitAdvisorAlerts({ supabaseAdmin, waha, logger });

    expect(result).toEqual({ ok: true, due: 2, sent: 2, skipped: 0, errors: 1 });
    expect(supabaseAdmin.inserts.notifications).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('WhatsApp notice failed'), 'WAHA 500');
  });

  it('never throws when the due query fails', async () => {
    const supabaseAdmin = createSupabaseStub({ rpcError: { message: 'boom' } });
    const result = await runDebitAdvisorAlerts({ supabaseAdmin, logger: quietLogger() });
    expect(result).toEqual({ ok: false, error: 'boom' });
  });
});

describe('startDebitAdvisorAlertsJob', () => {
  it('does nothing without a service client', () => {
    expect(startDebitAdvisorAlertsJob({}).skipped).toBe(true);
  });

  it('runs once at start', async () => {
    const supabaseAdmin = createSupabaseStub();
    const job = startDebitAdvisorAlertsJob({ supabaseAdmin, logger: quietLogger() });
    await vi.waitFor(() => expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1));
    job.stop();
  });
});
