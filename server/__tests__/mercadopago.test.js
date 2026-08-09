import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  verifyWebhookSignature,
  deriveSubscriptionEventKey,
  resolveOccurredAt,
  handlePaymentSettlement,
  handleSubscriptionEvent,
  routeWebhookNotification,
  runDeferredReconciliation,
  DEBITO_AUTOMATICO_DISCOUNT,
} from '../mercadopago.js';

/**
 * Minimal fake Supabase query-builder chain sufficient for
 * handlePaymentSettlement's read/write pattern:
 * `.from(table).select().eq()...maybeSingle()` and `.rpc(name, args)`. Each
 * table gets ONE canned `maybeSingle` response per test — enough for these
 * scenarios, which never query the same table twice with different expected
 * results within one call.
 *
 * `rpc` is resolved PER RPC NAME via `rpcResults` (falling back to the
 * single `rpcResult` default when a name has no specific entry) — needed
 * because `handlePaymentSettlement` now calls two DIFFERENT RPCs in the same
 * invocation (`post_payment_movement_from_webhook` and
 * `record_mercadopago_payment_audit_event`), which may need different
 * canned responses within one test (e.g. to exercise the audit RPC's own
 * failure path independently of the ledger RPC's result).
 */
function createSupabaseStub({ tables = {}, rpcResult = { data: null, error: null }, rpcResults = {} } = {}) {
  const from = (table) => {
    const handlers = tables[table] || {};
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => (handlers.maybeSingle ? handlers.maybeSingle() : { data: null, error: null }),
      insert: async () => ({ data: null, error: null }),
    };
    return builder;
  };
  const rpc = vi.fn((name) =>
    Promise.resolve(Object.prototype.hasOwnProperty.call(rpcResults, name) ? rpcResults[name] : rpcResult)
  );
  return { from, rpc };
}

const SECRET = 'test-webhook-secret';

/**
 * Builds a valid x-signature header value the way Mercado Pago's docs
 * describe for the `payment` topic: manifest = `id:{dataId};request-id:{requestId};ts:{ts};`,
 * HMAC-SHA256 over that manifest, hex-encoded.
 */
function buildSignatureHeader({ dataId, requestId, ts, secret = SECRET }) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verifyWebhookSignature', () => {
  it('accepts a valid signature built from the documented manifest shape', () => {
    const ts = Math.floor(Date.now() / 1000);
    const headers = {
      'x-signature': buildSignatureHeader({ dataId: '12345', requestId: 'req-1', ts }),
      'x-request-id': 'req-1',
    };

    expect(verifyWebhookSignature(headers, '12345', SECRET)).toBe(true);
  });

  it('rejects when data.id was tampered with after signing', () => {
    const ts = Math.floor(Date.now() / 1000);
    const headers = {
      'x-signature': buildSignatureHeader({ dataId: '12345', requestId: 'req-1', ts }),
      'x-request-id': 'req-1',
    };

    // Signature was computed for dataId '12345', but the caller passes a
    // different id — this must fail even though the header itself is well-formed.
    expect(verifyWebhookSignature(headers, '99999', SECRET)).toBe(false);
  });

  it('rejects when verified with the wrong secret', () => {
    const ts = Math.floor(Date.now() / 1000);
    const headers = {
      'x-signature': buildSignatureHeader({ dataId: '12345', requestId: 'req-1', ts, secret: SECRET }),
      'x-request-id': 'req-1',
    };

    expect(verifyWebhookSignature(headers, '12345', 'wrong-secret')).toBe(false);
  });

  it('rejects when the ts is more than 300 seconds old', () => {
    const staleTs = Math.floor(Date.now() / 1000) - 301;
    const headers = {
      'x-signature': buildSignatureHeader({ dataId: '12345', requestId: 'req-1', ts: staleTs }),
      'x-request-id': 'req-1',
    };

    expect(verifyWebhookSignature(headers, '12345', SECRET)).toBe(false);
  });

  it('accepts when the ts skew is exactly at the 300 second boundary', () => {
    const boundaryTs = Math.floor(Date.now() / 1000) - 300;
    const headers = {
      'x-signature': buildSignatureHeader({ dataId: '12345', requestId: 'req-1', ts: boundaryTs }),
      'x-request-id': 'req-1',
    };

    expect(verifyWebhookSignature(headers, '12345', SECRET)).toBe(true);
  });

  it('rejects a malformed header missing the v1 component', () => {
    const ts = Math.floor(Date.now() / 1000);
    const headers = { 'x-signature': `ts=${ts}`, 'x-request-id': 'req-1' };

    expect(verifyWebhookSignature(headers, '12345', SECRET)).toBe(false);
  });

  it('rejects a completely malformed header with no key=value pairs', () => {
    const headers = { 'x-signature': 'not-a-valid-signature-header', 'x-request-id': 'req-1' };

    expect(verifyWebhookSignature(headers, '12345', SECRET)).toBe(false);
  });

  it('rejects when the x-signature header is absent entirely', () => {
    expect(verifyWebhookSignature({}, '12345', SECRET)).toBe(false);
  });

  it('does not throw when the provided v1 has a different byte length than expected (timingSafeEqual guard)', () => {
    const ts = Math.floor(Date.now() / 1000);
    // A short, clearly-wrong-length v1 value that would make Buffer.from(...,'hex')
    // produce a shorter buffer than the real HMAC digest.
    const headers = { 'x-signature': `ts=${ts},v1=ab`, 'x-request-id': 'req-1' };

    expect(() => verifyWebhookSignature(headers, '12345', SECRET)).not.toThrow();
    expect(verifyWebhookSignature(headers, '12345', SECRET)).toBe(false);
  });
});

describe('deriveSubscriptionEventKey', () => {
  it('maps a preapproval authorized status to subscription_preapproval_authorized', () => {
    const resource = { id: 'preap-1', status: 'authorized' };
    expect(deriveSubscriptionEventKey(resource, 'preapproval')).toEqual({
      eventType: 'subscription_preapproval_authorized',
      mpResourceId: 'preap-1',
      newStatus: 'authorized',
    });
  });

  it('maps a preapproval cancelled status to subscription_preapproval_cancelled', () => {
    const resource = { id: 'preap-2', status: 'cancelled' };
    expect(deriveSubscriptionEventKey(resource, 'preapproval')).toEqual({
      eventType: 'subscription_preapproval_cancelled',
      mpResourceId: 'preap-2',
      newStatus: 'cancelled',
    });
  });

  it('maps a preapproval paused status to its own event_type but target status cancelled (D-D)', () => {
    const resource = { id: 'preap-3', status: 'paused' };
    expect(deriveSubscriptionEventKey(resource, 'preapproval')).toEqual({
      eventType: 'subscription_preapproval_paused',
      mpResourceId: 'preap-3',
      newStatus: 'cancelled',
    });
  });

  it('returns null for a preapproval pending status (unmodelled, ack-only)', () => {
    const resource = { id: 'preap-4', status: 'pending' };
    expect(deriveSubscriptionEventKey(resource, 'preapproval')).toBeNull();
  });

  it('maps an authorized_payment processed status to subscription_authorized_payment_processed / authorized', () => {
    const resource = { id: 'ap-1', status: 'processed' };
    expect(deriveSubscriptionEventKey(resource, 'authorized_payment')).toEqual({
      eventType: 'subscription_authorized_payment_processed',
      mpResourceId: 'ap-1',
      newStatus: 'authorized',
    });
  });

  it('maps an authorized_payment rejected status to subscription_authorized_payment_rejected / payment_failed', () => {
    const resource = { id: 'ap-2', status: 'rejected' };
    expect(deriveSubscriptionEventKey(resource, 'authorized_payment')).toEqual({
      eventType: 'subscription_authorized_payment_rejected',
      mpResourceId: 'ap-2',
      newStatus: 'payment_failed',
    });
  });

  it('returns null for authorized_payment scheduled and recycling statuses (non-terminal)', () => {
    expect(deriveSubscriptionEventKey({ id: 'ap-3', status: 'scheduled' }, 'authorized_payment')).toBeNull();
    expect(deriveSubscriptionEventKey({ id: 'ap-4', status: 'recycling' }, 'authorized_payment')).toBeNull();
  });

  it('returns null for an unrecognized kind', () => {
    expect(deriveSubscriptionEventKey({ id: 'x', status: 'authorized' }, 'unknown_kind')).toBeNull();
  });

  it('returns null when the resource is missing an id or status', () => {
    expect(deriveSubscriptionEventKey(null, 'preapproval')).toBeNull();
    expect(deriveSubscriptionEventKey({ status: 'authorized' }, 'preapproval')).toBeNull();
    expect(deriveSubscriptionEventKey({ id: 'preap-5' }, 'preapproval')).toBeNull();
  });
});

describe('resolveOccurredAt', () => {
  describe('kind: payment', () => {
    it('prefers date_approved only when status is approved', () => {
      const resource = {
        status: 'approved',
        date_approved: '2026-03-15T10:00:00Z',
        date_last_updated: '2026-03-15T11:00:00Z',
        date_created: '2026-03-15T09:00:00Z',
      };
      expect(resolveOccurredAt(resource, 'payment')).toBe('2026-03-15T10:00:00Z');
    });

    it('falls back to date_last_updated when status is NOT approved even if date_approved is present', () => {
      const resource = {
        status: 'pending',
        date_approved: '2026-03-15T10:00:00Z',
        date_last_updated: '2026-03-15T11:00:00Z',
        date_created: '2026-03-15T09:00:00Z',
      };
      expect(resolveOccurredAt(resource, 'payment')).toBe('2026-03-15T11:00:00Z');
    });

    it('falls back to date_created when date_last_updated is absent', () => {
      const resource = { status: 'rejected', date_created: '2026-03-15T09:00:00Z' };
      expect(resolveOccurredAt(resource, 'payment')).toBe('2026-03-15T09:00:00Z');
    });

    it('returns null when every candidate is absent (R23 fail-closed input)', () => {
      expect(resolveOccurredAt({ status: 'approved' }, 'payment')).toBeNull();
    });
  });

  describe('kind: authorized_payment', () => {
    it('prefers last_modified over the nested payment fallback', () => {
      const resource = {
        last_modified: '2026-03-15T12:00:00Z',
        payment: { status: 'approved', date_approved: '2026-03-15T10:00:00Z' },
      };
      expect(resolveOccurredAt(resource, 'authorized_payment')).toBe('2026-03-15T12:00:00Z');
    });

    it('recurses into the nested payment object rather than naming its own payment fields', () => {
      const resource = {
        payment: { status: 'approved', date_approved: '2026-03-15T10:00:00Z', date_created: '2026-03-15T08:00:00Z' },
      };
      expect(resolveOccurredAt(resource, 'authorized_payment')).toBe('2026-03-15T10:00:00Z');
    });

    it('falls back to its own date_created when last_modified is absent and the nested payment resolves to nothing', () => {
      const resource = { payment: { status: 'pending' }, date_created: '2026-03-15T07:00:00Z' };
      expect(resolveOccurredAt(resource, 'authorized_payment')).toBe('2026-03-15T07:00:00Z');
    });

    it('returns null when every candidate, including the nested payment, is absent', () => {
      expect(resolveOccurredAt({}, 'authorized_payment')).toBeNull();
    });
  });

  describe('kind: preapproval', () => {
    it('prefers last_modified over date_created', () => {
      const resource = { last_modified: '2026-03-15T12:00:00Z', date_created: '2026-03-15T08:00:00Z' };
      expect(resolveOccurredAt(resource, 'preapproval')).toBe('2026-03-15T12:00:00Z');
    });

    it('falls back to date_created when last_modified is absent', () => {
      const resource = { date_created: '2026-03-15T08:00:00Z' };
      expect(resolveOccurredAt(resource, 'preapproval')).toBe('2026-03-15T08:00:00Z');
    });

    it('returns null when both are absent', () => {
      expect(resolveOccurredAt({}, 'preapproval')).toBeNull();
    });
  });

  it('returns null for a null/undefined resource or an unrecognized kind', () => {
    expect(resolveOccurredAt(null, 'payment')).toBeNull();
    expect(resolveOccurredAt({ date_created: '2026-01-01T00:00:00Z' }, 'unknown_kind')).toBeNull();
  });
});

describe('handlePaymentSettlement', () => {
  it('acks a non-approved re-fetched payment with a NON-terminal MP status (pending) without touching the ledger, and audits resolution_state=pending so it stays visible to future redelivery/retry', async () => {
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pay-1', status: 'pending' });
    const supabaseAdmin = createSupabaseStub();

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-1' });

    expect(result).toMatchObject({ outcome: 'not_approved', posted: false });
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-1',
      p_mp_status: 'pending',
      p_outcome: 'not_approved',
      p_resolution_state: 'pending',
      p_detail: null,
      p_invoice_id: null,
      p_profile_id: null,
      p_amount: null,
    });
  });

  it('acks a non-approved re-fetched payment with a genuinely TERMINAL MP status (rejected) and audits resolution_state=final', async () => {
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pay-1b', status: 'rejected' });
    const supabaseAdmin = createSupabaseStub();

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-1b' });

    expect(result).toMatchObject({ outcome: 'not_approved', posted: false });
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-1b',
      p_mp_status: 'rejected',
      p_outcome: 'not_approved',
      p_resolution_state: 'final',
      p_detail: null,
      p_invoice_id: null,
      p_profile_id: null,
      p_amount: null,
    });
  });

  it('reports fetch_failed without any DB write when mpFetch throws', async () => {
    const mpFetch = vi.fn().mockRejectedValue(new Error('MP unreachable'));
    const supabaseAdmin = createSupabaseStub();

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-2' });

    expect(result).toMatchObject({ outcome: 'fetch_failed', posted: false });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('settles a Checkout Pro payment using the server re-read invoice.entity_id, and calls the webhook RPC and the audit RPC with a full field set', async () => {
    const invoice = { id: 'inv-1', entity_id: 'profile-1', entity_type: 'affiliate', status: 'issued', total_amount: 50000 };
    const mpFetch = vi.fn().mockResolvedValue({
      id: 'pay-3',
      status: 'approved',
      transaction_amount: 50000,
      external_reference: 'affiliate:profile-1:invoice:inv-1',
      date_approved: '2026-03-15T10:00:00Z',
    });
    const supabaseAdmin = createSupabaseStub({
      tables: { invoices: { maybeSingle: async () => ({ data: invoice, error: null }) } },
      rpcResult: {
        data: { posted: true, movement_id: 'mv-1', invoice_id: 'inv-1', invoice_status: 'paid', coverage_extended: true, deferred_reason: null },
        error: null,
      },
    });

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-3' });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('post_payment_movement_from_webhook', {
      p_invoice_id: 'inv-1',
      p_entity_type: 'affiliate',
      p_entity_id: 'profile-1', // from the RE-READ invoice row, never the parsed reference string
      p_amount: 50000,
      p_external_ref: 'payment:mercadopago:pay-3',
      p_source: 'mercadopago',
      p_occurred_at: '2026-03-15T10:00:00Z',
    });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-3',
      p_mp_status: 'approved',
      p_outcome: 'posted',
      p_resolution_state: 'final',
      // Success must explicitly clear detail (full-overwrite semantics) so a
      // stale rpc_error/ref_mismatch detail from an earlier attempt against
      // this same mp_resource_id never survives a later successful settlement.
      p_detail: null,
      p_invoice_id: 'inv-1',
      p_profile_id: 'profile-1',
      p_amount: 50000,
    });
    expect(result).toMatchObject({ outcome: 'posted', posted: true, coverage_extended: true, auditError: null });
  });

  it('defers with ref_mismatch, never calls the ledger RPC, and audits a complete field set when the parsed reference disagrees with the re-read invoice (R25)', async () => {
    const invoice = { id: 'inv-2', entity_id: 'profile-OWNER', entity_type: 'affiliate', status: 'issued', total_amount: 50000 };
    const mpFetch = vi.fn().mockResolvedValue({
      id: 'pay-4',
      status: 'approved',
      transaction_amount: 50000,
      external_reference: 'affiliate:profile-ATTACKER:invoice:inv-2',
    });
    const supabaseAdmin = createSupabaseStub({
      tables: { invoices: { maybeSingle: async () => ({ data: invoice, error: null }) } },
    });

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-4' });

    expect(result).toMatchObject({ outcome: 'ref_mismatch', posted: false });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith('post_payment_movement_from_webhook', expect.anything());
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-4',
      p_mp_status: 'approved',
      p_outcome: 'ref_mismatch',
      p_resolution_state: 'needs_admin',
      p_detail: 'affiliate:profile-ATTACKER:invoice:inv-2',
      p_invoice_id: null,
      p_profile_id: null,
      p_amount: null,
    });
  });

  it('defers with subscription_not_linked when the preapproval has no linked profile_id yet (R1), auditing a complete field set', async () => {
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pay-5', status: 'approved', transaction_amount: 50000 });
    const supabaseAdmin = createSupabaseStub({
      tables: { affiliate_payment_subscriptions: { maybeSingle: async () => ({ data: null, error: null }) } },
    });

    const result = await handlePaymentSettlement(
      { supabaseAdmin, mpFetch },
      { paymentId: 'pay-5', preapprovalId: 'preap-orphan' }
    );

    expect(result).toMatchObject({ outcome: 'subscription_not_linked', posted: false });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith('post_payment_movement_from_webhook', expect.anything());
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-5',
      p_mp_status: 'approved',
      p_outcome: 'subscription_not_linked',
      p_resolution_state: 'pending',
      p_detail: 'preap-orphan',
      p_invoice_id: null,
      p_profile_id: null,
      p_amount: null,
    });
  });

  it('defers with no_open_invoice when the subscription is linked but no issued invoice exists yet (R3/R4), auditing a complete field set', async () => {
    const mpFetch = vi.fn().mockResolvedValue({ id: 'pay-6', status: 'approved', transaction_amount: 50000 });
    const supabaseAdmin = createSupabaseStub({
      tables: {
        affiliate_payment_subscriptions: { maybeSingle: async () => ({ data: { profile_id: 'profile-2' }, error: null }) },
        invoices: { maybeSingle: async () => ({ data: null, error: null }) },
      },
    });

    const result = await handlePaymentSettlement(
      { supabaseAdmin, mpFetch },
      { paymentId: 'pay-6', preapprovalId: 'preap-linked' }
    );

    expect(result).toMatchObject({ outcome: 'no_open_invoice', posted: false });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith('post_payment_movement_from_webhook', expect.anything());
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-6',
      p_mp_status: 'approved',
      p_outcome: 'no_open_invoice',
      p_resolution_state: 'pending',
      p_detail: 'preap-linked',
      p_invoice_id: null,
      p_profile_id: null,
      p_amount: null,
    });
  });

  it('settles a débito-automático (subscription-correlated) payment with no external_reference through the preapproval->profile->invoice lookup, and calls the webhook RPC', async () => {
    const mpFetch = vi.fn().mockResolvedValue({
      id: 'pay-7',
      status: 'approved',
      transaction_amount: 40000,
      date_approved: '2026-03-15T10:00:00Z',
    });
    const invoice = { id: 'inv-7', entity_id: 'profile-7', entity_type: 'affiliate', status: 'issued', total_amount: 40000 };
    const supabaseAdmin = createSupabaseStub({
      tables: {
        affiliate_payment_subscriptions: { maybeSingle: async () => ({ data: { profile_id: 'profile-7' }, error: null }) },
        invoices: { maybeSingle: async () => ({ data: invoice, error: null }) },
      },
      rpcResult: {
        data: { posted: true, movement_id: 'mv-7', invoice_id: 'inv-7', invoice_status: 'paid', coverage_extended: true, deferred_reason: null },
        error: null,
      },
    });

    const result = await handlePaymentSettlement(
      { supabaseAdmin, mpFetch },
      { paymentId: 'pay-7', preapprovalId: 'preap-7' }
    );

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('post_payment_movement_from_webhook', {
      p_invoice_id: 'inv-7',
      p_entity_type: 'affiliate',
      p_entity_id: 'profile-7', // resolved via subscription -> profile_id, never a parsed reference
      p_amount: 40000,
      p_external_ref: 'payment:mercadopago:pay-7',
      p_source: 'mercadopago',
      p_occurred_at: '2026-03-15T10:00:00Z',
    });
    expect(result).toMatchObject({ outcome: 'posted', posted: true, coverage_extended: true, auditError: null });
  });

  it('reports rpc_error and records a pending audit row with a complete field set when post_payment_movement_from_webhook fails', async () => {
    const invoice = { id: 'inv-8', entity_id: 'profile-8', entity_type: 'affiliate', status: 'issued', total_amount: 50000 };
    const mpFetch = vi.fn().mockResolvedValue({
      id: 'pay-8',
      status: 'approved',
      transaction_amount: 50000,
      external_reference: 'affiliate:profile-8:invoice:inv-8',
      date_approved: '2026-03-15T10:00:00Z',
    });
    const supabaseAdmin = createSupabaseStub({
      tables: { invoices: { maybeSingle: async () => ({ data: invoice, error: null }) } },
      rpcResults: {
        post_payment_movement_from_webhook: { data: null, error: { message: 'connection reset' } },
        record_mercadopago_payment_audit_event: { data: null, error: null },
      },
    });

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-8' });

    expect(result).toMatchObject({ outcome: 'rpc_error', posted: false, detail: 'connection reset', auditError: null });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-8',
      p_mp_status: 'approved',
      p_outcome: 'rpc_error',
      p_resolution_state: 'pending',
      p_detail: 'connection reset',
      p_invoice_id: 'inv-8',
      p_profile_id: 'profile-8',
      p_amount: 50000,
    });
  });

  it('surfaces auditError without throwing when record_mercadopago_payment_audit_event itself fails (Round 2: previously untested)', async () => {
    const invoice = { id: 'inv-9', entity_id: 'profile-9', entity_type: 'affiliate', status: 'issued', total_amount: 50000 };
    const mpFetch = vi.fn().mockResolvedValue({
      id: 'pay-9',
      status: 'approved',
      transaction_amount: 50000,
      external_reference: 'affiliate:profile-9:invoice:inv-9',
      date_approved: '2026-03-15T10:00:00Z',
    });
    const supabaseAdmin = createSupabaseStub({
      tables: { invoices: { maybeSingle: async () => ({ data: invoice, error: null }) } },
      rpcResults: {
        post_payment_movement_from_webhook: {
          data: { posted: true, movement_id: 'mv-9', invoice_id: 'inv-9', invoice_status: 'paid', coverage_extended: true, deferred_reason: null },
          error: null,
        },
        record_mercadopago_payment_audit_event: { data: null, error: { message: 'audit write failed' } },
      },
    });

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-9' });

    // The ledger settlement itself must still succeed and be reported —
    // an audit-write failure never masks or reverts the real payment posting.
    expect(result).toMatchObject({ outcome: 'posted', posted: true, coverage_extended: true, auditError: 'audit write failed' });
  });

  it('audits resolution_state=needs_admin (not final) when the settlement RPC posts the money but reports deferred_reason=window_reset (R17)', async () => {
    const invoice = { id: 'inv-10', entity_id: 'profile-10', entity_type: 'affiliate', status: 'issued', total_amount: 50000 };
    const mpFetch = vi.fn().mockResolvedValue({
      id: 'pay-10',
      status: 'approved',
      transaction_amount: 50000,
      external_reference: 'affiliate:profile-10:invoice:inv-10',
      date_approved: '2026-03-15T10:00:00Z',
    });
    const supabaseAdmin = createSupabaseStub({
      tables: { invoices: { maybeSingle: async () => ({ data: invoice, error: null }) } },
      rpcResult: {
        data: { posted: true, movement_id: 'mv-10', invoice_id: 'inv-10', invoice_status: 'paid', coverage_extended: true, deferred_reason: 'window_reset' },
        error: null,
      },
    });

    const result = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-10' });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_payment_audit_event', {
      p_mp_resource_id: 'pay-10',
      p_mp_status: 'approved',
      p_outcome: 'window_reset',
      p_resolution_state: 'needs_admin',
      p_detail: null,
      p_invoice_id: 'inv-10',
      p_profile_id: 'profile-10',
      p_amount: 50000,
    });
    expect(result).toMatchObject({ outcome: 'window_reset', posted: true, coverage_extended: true, auditError: null });
  });

  it('does not let an ordinary redelivery overwrite an already-needs_admin row back to final (Judgment Day Round 2 fix) — DB-level freeze is verified separately by the pgTAP "freeze-once-needs_admin" tests in supabase/tests/mercadopago.sql', async () => {
    // This file's shared createSupabaseStub() resolves each RPC name to a
    // single canned response regardless of call count — it does not model
    // real Postgres `ON CONFLICT ... DO UPDATE` freeze semantics. To prove
    // the end-to-end guarantee (a second call's write never actually lands
    // once the row is needs_admin/final), this test uses a small stateful
    // rpc stub, scoped locally to this test, that tracks the row's current
    // resolution_state across two sequential calls and no-ops
    // record_mercadopago_payment_audit_event once frozen — mirroring what
    // the 20260728000000 migration's CASE guard does in the real database.
    // handlePaymentSettlement's own logic (what it ATTEMPTS to write) is
    // unchanged and still asserted directly; the true persisted-value
    // guarantee is the pgTAP suite's responsibility.
    let currentResolutionState = null;
    const auditCalls = [];
    const invoice = { id: 'inv-11', entity_id: 'profile-11', entity_type: 'affiliate', status: 'issued', total_amount: 50000 };
    const mpFetch = vi.fn().mockResolvedValue({
      id: 'pay-11',
      status: 'approved',
      transaction_amount: 50000,
      external_reference: 'affiliate:profile-11:invoice:inv-11',
      date_approved: '2026-03-15T10:00:00Z',
    });

    const makeRpc = (ledgerResult) =>
      vi.fn((name, args) => {
        if (name === 'record_mercadopago_payment_audit_event') {
          auditCalls.push(args);
          const frozen = currentResolutionState === 'final' || currentResolutionState === 'needs_admin';
          if (!frozen) currentResolutionState = args.p_resolution_state;
          return Promise.resolve({ data: null, error: null });
        }
        if (name === 'post_payment_movement_from_webhook') {
          return Promise.resolve(ledgerResult);
        }
        return Promise.resolve({ data: null, error: null });
      });

    const supabaseAdmin = {
      from: (table) => {
        const handlers = { invoices: { maybeSingle: async () => ({ data: invoice, error: null }) } };
        const h = handlers[table] || {};
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => (h.maybeSingle ? h.maybeSingle() : { data: null, error: null }),
          insert: async () => ({ data: null, error: null }),
        };
        return builder;
      },
      rpc: makeRpc({
        data: { posted: true, movement_id: 'mv-11', invoice_id: 'inv-11', invoice_status: 'paid', coverage_extended: true, deferred_reason: 'window_reset' },
        error: null,
      }),
    };

    // First call: window_reset -> writes resolution_state=needs_admin.
    const firstResult = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-11' });
    expect(firstResult).toMatchObject({ outcome: 'window_reset', posted: true });
    expect(currentResolutionState).toBe('needs_admin');

    // Second call: an ordinary webhook redelivery of the SAME payment
    // (post_payment_movement_from_webhook's own idempotent
    // `ON CONFLICT (external_ref) DO NOTHING` guarantees posted:false on
    // redelivery).
    supabaseAdmin.rpc = makeRpc({
      data: { posted: false, movement_id: 'mv-11', invoice_id: 'inv-11', invoice_status: 'paid', coverage_extended: false, deferred_reason: null },
      error: null,
    });

    const secondResult = await handlePaymentSettlement({ supabaseAdmin, mpFetch }, { paymentId: 'pay-11' });

    // handlePaymentSettlement's OWN logic is unchanged and still computes
    // outcome='duplicate' / resolution_state='final' for this input — this
    // is what it ATTEMPTS to write on the second call.
    expect(secondResult).toMatchObject({ outcome: 'duplicate', posted: false });
    expect(auditCalls[1]).toMatchObject({ p_outcome: 'duplicate', p_resolution_state: 'final' });

    // But the row's ACTUAL tracked resolution_state never regresses from
    // needs_admin back to final — the freeze guard (real DB behavior
    // verified directly by the pgTAP "freeze-once-needs_admin" tests)
    // rejects the second write.
    expect(currentResolutionState).toBe('needs_admin');
  });
});

describe('DEBITO_AUTOMATICO_DISCOUNT', () => {
  it('is the 20% discount factor (0.8) mirrored from AdhesionForm.tsx', () => {
    expect(DEBITO_AUTOMATICO_DISCOUNT).toBe(0.8);
  });
});

describe('handleSubscriptionEvent', () => {
  it('acks without any RPC call when deriveSubscriptionEventKey returns null (unmodelled status)', async () => {
    const supabaseAdmin = createSupabaseStub();
    const result = await handleSubscriptionEvent(
      { supabaseAdmin },
      { resource: { id: 'preap-9', status: 'pending' }, kind: 'preapproval' }
    );

    expect(result).toMatchObject({ outcome: 'ignored' });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('routes a preapproval authorized transition through record_mercadopago_subscription_event with no discount cutoff', async () => {
    const supabaseAdmin = createSupabaseStub({ rpcResult: { data: 'status_applied', error: null } });
    const resource = { id: 'preap-10', status: 'authorized', last_modified: '2026-03-15T12:00:00Z' };

    const result = await handleSubscriptionEvent({ supabaseAdmin }, { resource, kind: 'preapproval' });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_subscription_event', {
      p_mp_preapproval_id: 'preap-10',
      p_event_type: 'subscription_preapproval_authorized',
      p_mp_resource_id: 'preap-10',
      p_new_status: 'authorized',
      p_occurred_at: '2026-03-15T12:00:00Z',
      p_discount_through_period: null,
    });
    expect(result).toEqual({ outcome: 'status_applied' });
  });

  it('supplies the current YYYY-MM as discount_through_period on a cancellation (D-E)', async () => {
    vi.setSystemTime(new Date('2026-06-20T00:00:00Z'));
    const supabaseAdmin = createSupabaseStub({ rpcResult: { data: 'status_applied', error: null } });
    const resource = { id: 'preap-11', status: 'cancelled', last_modified: '2026-06-20T00:00:00Z' };

    await handleSubscriptionEvent({ supabaseAdmin }, { resource, kind: 'preapproval' });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'record_mercadopago_subscription_event',
      expect.objectContaining({ p_new_status: 'cancelled', p_discount_through_period: '2026-06' })
    );
    vi.useRealTimers();
  });

  it('reads the preapproval id from the nested field for an authorized_payment resource', async () => {
    const supabaseAdmin = createSupabaseStub({ rpcResult: { data: 'status_applied', error: null } });
    const resource = { id: 'ap-20', status: 'processed', preapproval_id: 'preap-12', last_modified: '2026-03-15T13:00:00Z' };

    await handleSubscriptionEvent({ supabaseAdmin }, { resource, kind: 'authorized_payment' });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_subscription_event', {
      p_mp_preapproval_id: 'preap-12',
      p_event_type: 'subscription_authorized_payment_processed',
      p_mp_resource_id: 'ap-20',
      p_new_status: 'authorized',
      p_occurred_at: '2026-03-15T13:00:00Z',
      p_discount_through_period: null,
    });
  });

  it('surfaces an RPC error without throwing', async () => {
    const supabaseAdmin = createSupabaseStub({ rpcResult: { data: null, error: { message: 'connection reset' } } });
    const resource = { id: 'preap-13', status: 'authorized', last_modified: '2026-03-15T12:00:00Z' };

    const result = await handleSubscriptionEvent({ supabaseAdmin }, { resource, kind: 'preapproval' });

    expect(result).toEqual({ outcome: 'rpc_error', error: 'connection reset' });
  });
});

describe('routeWebhookNotification', () => {
  /** Dispatches a canned response (or throws) per re-fetch path, so a single
   * test can cover a multi-hop chain (e.g. authorized_payments -> nested
   * payment) with distinct responses for each call. */
  function createMpFetchStub(responses) {
    return vi.fn(async (path) => {
      if (!Object.prototype.hasOwnProperty.call(responses, path)) {
        throw new Error(`Unexpected mpFetch path in test: ${path}`);
      }
      const entry = responses[path];
      if (entry instanceof Error) throw entry;
      return entry;
    });
  }

  it('routes a payment topic straight into handlePaymentSettlement with the raw data.id, no preapprovalId', async () => {
    const mpFetch = createMpFetchStub({
      '/v1/payments/pay-100': { id: 'pay-100', status: 'pending' },
    });
    const supabaseAdmin = createSupabaseStub();

    const result = await routeWebhookNotification({ supabaseAdmin, mpFetch }, { topic: 'payment', dataId: 'pay-100' });

    expect(result).toEqual({ status: 200, body: { outcome: 'not_approved' } });
  });

  it('re-fetches /authorized_payments/{id} for subscription_authorized_payment, settles the ledger THEN records the authorized transition, in that order (D-C)', async () => {
    const callOrder = [];
    const mpFetch = vi.fn(async (path) => {
      callOrder.push(path);
      if (path === '/authorized_payments/ap-1') {
        return { id: 'ap-1', status: 'processed', preapproval_id: 'preap-1', payment: { id: 'pay-1' } };
      }
      if (path === '/v1/payments/pay-1') {
        return { id: 'pay-1', status: 'pending' };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    const supabaseAdmin = createSupabaseStub({ rpcResult: { data: 'status_applied', error: null } });

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'subscription_authorized_payment', dataId: 'ap-1' }
    );

    expect(callOrder).toEqual(['/authorized_payments/ap-1', '/v1/payments/pay-1']);
    expect(result).toEqual({ status: 200, body: { outcome: 'not_approved', lifecycleOutcome: 'status_applied' } });
    // The lifecycle write must carry the preapproval_id read from the
    // re-fetched authorized_payment, not a value invented by the router.
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'record_mercadopago_subscription_event',
      expect.objectContaining({ p_mp_preapproval_id: 'preap-1', p_new_status: 'authorized' })
    );
  });

  it('routes a rejected authorized_payment straight to the lifecycle transition, never touching the ledger', async () => {
    const mpFetch = createMpFetchStub({
      '/authorized_payments/ap-2': { id: 'ap-2', status: 'rejected', preapproval_id: 'preap-2' },
    });
    const supabaseAdmin = createSupabaseStub({ rpcResult: { data: 'status_applied', error: null } });

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'subscription_authorized_payment', dataId: 'ap-2' }
    );

    expect(result).toEqual({ status: 200, body: { outcome: 'status_applied' } });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith('post_payment_movement_from_webhook', expect.anything());
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'record_mercadopago_subscription_event',
      expect.objectContaining({ p_new_status: 'payment_failed' })
    );
  });

  it('acks a non-terminal authorized_payment status (scheduled/recycling) without any RPC call', async () => {
    const mpFetch = createMpFetchStub({
      '/authorized_payments/ap-3': { id: 'ap-3', status: 'scheduled', preapproval_id: 'preap-3' },
    });
    const supabaseAdmin = createSupabaseStub();

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'subscription_authorized_payment', dataId: 'ap-3' }
    );

    expect(result).toEqual({ status: 200, body: { outcome: 'ignored' } });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('acks without settling when a processed authorized_payment is missing the nested payment.id', async () => {
    const mpFetch = createMpFetchStub({
      '/authorized_payments/ap-4': { id: 'ap-4', status: 'processed', preapproval_id: 'preap-4' },
    });
    const supabaseAdmin = createSupabaseStub();

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'subscription_authorized_payment', dataId: 'ap-4' }
    );

    expect(result).toEqual({ status: 200, body: { outcome: 'ignored', reason: 'missing_nested_payment_id' } });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('returns 502 without any DB access when the authorized_payments re-fetch fails', async () => {
    const mpFetch = createMpFetchStub({ '/authorized_payments/ap-5': new Error('MP timeout') });
    const supabaseAdmin = createSupabaseStub();

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'subscription_authorized_payment', dataId: 'ap-5' }
    );

    expect(result.status).toBe(502);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('re-fetches /preapproval/{id} for subscription_preapproval and routes the lifecycle transition', async () => {
    const mpFetch = createMpFetchStub({
      '/preapproval/preap-6': { id: 'preap-6', status: 'authorized', last_modified: '2026-03-15T12:00:00Z' },
    });
    const supabaseAdmin = createSupabaseStub({ rpcResult: { data: 'status_applied', error: null } });

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'subscription_preapproval', dataId: 'preap-6' }
    );

    expect(result).toEqual({ status: 200, body: { outcome: 'status_applied' } });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'record_mercadopago_subscription_event',
      expect.objectContaining({ p_mp_preapproval_id: 'preap-6', p_event_type: 'subscription_preapproval_authorized' })
    );
  });

  it('returns 502 without any DB access when the preapproval re-fetch fails', async () => {
    const mpFetch = createMpFetchStub({ '/preapproval/preap-7': new Error('MP 500') });
    const supabaseAdmin = createSupabaseStub();

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'subscription_preapproval', dataId: 'preap-7' }
    );

    expect(result.status).toBe(502);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('acks an unrecognized topic without any re-fetch or DB access (D-C "other" row)', async () => {
    const mpFetch = vi.fn();
    const supabaseAdmin = createSupabaseStub();

    const result = await routeWebhookNotification(
      { supabaseAdmin, mpFetch },
      { topic: 'some_future_topic', dataId: 'x-1' }
    );

    expect(result).toEqual({ status: 200, body: { outcome: 'ignored', reason: 'unrecognized_topic' } });
    expect(mpFetch).not.toHaveBeenCalled();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});

// ── runDeferredReconciliation ─────────────────────────────────────────────

/**
 * A small in-memory fixture DB, richer than `createSupabaseStub` above:
 * `runDeferredReconciliation`'s four passes issue `.is()`/`.not()`/`.or()`/
 * `.lt()`/`.order()`/`.limit()`/`.update()` queries this repo's other tests
 * never needed. Each `.from(table)` call returns a fresh chainable builder
 * over a SHARED, mutable fixture array (so `.update()` side effects are
 * observable across the rest of one test), and the builder itself is
 * `await`-able (implements `.then()`) to match real supabase-js query
 * builders, since production code does `const { data } = await query`
 * without always calling `.maybeSingle()`.
 */
function createReconciliationStub({ tables = {}, rpcHandler } = {}) {
  function sortByCol(rows, col, ascending) {
    const sorted = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0));
    return ascending === false ? sorted.reverse() : sorted;
  }

  function evalOrClause(row, clause) {
    const match = /^([a-zA-Z_]+)\.(ilike|eq)\.(.*)$/.exec(clause);
    if (!match) return false;
    const [, col, op, rawVal] = match;
    if (op === 'eq') return row[col] !== undefined && row[col] !== null && String(row[col]) === rawVal;
    // Only a trailing '%' wildcard is supported — the only shape this module ever emits.
    const pattern = rawVal.endsWith('%') ? rawVal.slice(0, -1) : rawVal;
    return typeof row[col] === 'string' && row[col].startsWith(pattern);
  }

  function makeBuilder(tableName) {
    const rows = tables[tableName] || (tables[tableName] = []);
    let predicate = () => true;
    let orderCol = null;
    let orderAscending = true;
    let limitN = null;

    const addPredicate = (fn) => {
      const prev = predicate;
      predicate = (row) => prev(row) && fn(row);
    };

    const materialize = () => {
      let result = rows.filter(predicate);
      if (orderCol) result = sortByCol(result, orderCol, orderAscending);
      if (limitN != null) result = result.slice(0, limitN);
      return result;
    };

    const builder = {
      select: () => builder,
      eq: (col, val) => { addPredicate((row) => row[col] === val); return builder; },
      is: (col, val) => {
        addPredicate((row) => (val === null ? row[col] === null || row[col] === undefined : row[col] === val));
        return builder;
      },
      not: (col, op, val) => {
        if (op === 'is' && val === null) addPredicate((row) => row[col] !== null && row[col] !== undefined);
        return builder;
      },
      lt: (col, val) => { addPredicate((row) => row[col] < val); return builder; },
      or: (expr) => {
        const clauses = expr.split(',');
        addPredicate((row) => clauses.some((clause) => evalOrClause(row, clause)));
        return builder;
      },
      order: (col, opts) => { orderCol = col; orderAscending = opts?.ascending !== false; return builder; },
      limit: (n) => { limitN = n; return builder; },
      maybeSingle: async () => {
        const result = materialize();
        return { data: result[0] || null, error: null };
      },
      update: (patch) => ({
        eq: async (col, val) => {
          const targets = rows.filter((row) => predicate(row) && row[col] === val);
          targets.forEach((row) => Object.assign(row, patch));
          return { data: targets, error: null };
        },
      }),
      insert: async (row) => { rows.push(row); return { data: row, error: null }; },
      then: (resolve) => resolve({ data: materialize(), error: null }),
    };
    return builder;
  }

  const from = (tableName) => makeBuilder(tableName);
  const rpc = vi.fn(async (name, args) => (rpcHandler ? rpcHandler(name, args) : { data: null, error: null }));
  return { from, rpc, tables };
}

describe('runDeferredReconciliation', () => {
  it('returns an all-zero summary with the documented shape when there is nothing to do', async () => {
    const supabaseAdmin = createReconciliationStub({ tables: {} });
    const mpFetch = vi.fn();

    const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

    expect(summary).toEqual({
      resolved: 0,
      stillPending: 0,
      needsAdmin: 0,
      fetchFailures: 0,
      linked: 0,
      cancelledAtMp: 0,
      reservationsReleased: 0,
      chargesRecovered: 0,
    });
    expect(mpFetch).not.toHaveBeenCalled();
  });

  describe('Pass A — resolves deferred mercadopago_events', () => {
    it('resolves a payment-topic deferral by re-entering handlePaymentSettlement, using detail as the preapproval hint (R1/R3)', async () => {
      const tables = {
        mercadopago_events: [
          { id: 'evt-1', event_type: 'payment', mp_resource_id: 'pay-500', outcome: 'no_open_invoice', detail: 'preap-500', resolution_state: 'pending', attempt_count: 1, created_at: '2026-07-01T00:00:00Z' },
        ],
        affiliate_payment_subscriptions: [
          { id: 'sub-500', profile_id: 'prof-1', mp_preapproval_id: 'preap-500', status: 'authorized' },
        ],
        invoices: [
          { id: 'inv-1', entity_type: 'affiliate', entity_id: 'prof-1', status: 'issued', period: '2026-07', total_amount: 1000 },
        ],
      };
      const mpFetch = vi.fn(async (path) => {
        if (path === '/v1/payments/pay-500') {
          return { id: 'pay-500', status: 'approved', transaction_amount: 1000, external_reference: null, date_approved: '2026-07-05T00:00:00Z' };
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      const rpcHandler = (name) => {
        if (name === 'post_payment_movement_from_webhook') {
          return { data: { posted: true, movement_id: 'mv-1', invoice_id: 'inv-1', invoice_status: 'paid', coverage_extended: true, deferred_reason: null }, error: null };
        }
        if (name === 'record_mercadopago_payment_audit_event') return { data: null, error: null };
        if (name === 'mark_mercadopago_event_resolution') return { data: true, error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(summary.resolved).toBe(1);
      expect(summary.stillPending).toBe(0);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('mark_mercadopago_event_resolution', {
        p_event_id: 'evt-1',
        p_resolution_state: 'resolved',
        p_outcome: 'posted',
        p_resolved_by_ref: 'payment:mercadopago:pay-500',
      });
    });

    it('keeps a still-blocked payment deferral pending and rewrites its outcome to the current blocking reason (R3)', async () => {
      const tables = {
        mercadopago_events: [
          { id: 'evt-2', event_type: 'payment', mp_resource_id: 'pay-501', outcome: 'subscription_not_linked', detail: 'preap-501', resolution_state: 'pending', attempt_count: 0, created_at: '2026-07-01T00:00:00Z' },
        ],
        affiliate_payment_subscriptions: [
          { id: 'sub-501', profile_id: 'prof-2', mp_preapproval_id: 'preap-501', status: 'authorized' },
        ],
        invoices: [], // no open invoice yet — this is exactly the R3 "linked but still no invoice" case
      };
      const mpFetch = vi.fn(async (path) => {
        if (path === '/v1/payments/pay-501') {
          return { id: 'pay-501', status: 'approved', transaction_amount: 1000, external_reference: null, date_approved: '2026-07-05T00:00:00Z' };
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      const rpcHandler = (name) => {
        if (name === 'record_mercadopago_payment_audit_event') return { data: null, error: null };
        if (name === 'mark_mercadopago_event_resolution') return { data: true, error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(summary.stillPending).toBe(1);
      expect(summary.resolved).toBe(0);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('mark_mercadopago_event_resolution', {
        p_event_id: 'evt-2',
        p_resolution_state: 'pending',
        p_outcome: 'no_open_invoice',
        p_resolved_by_ref: null,
      });
    });

    it('resolves a subscription-flavoured deferral by stripping the audit suffix and re-fetching the bare resource id (R2)', async () => {
      const tables = {
        mercadopago_events: [
          { id: 'evt-3', event_type: 'subscription_authorized_payment_processed', mp_resource_id: 'ap-700:unlinked', outcome: 'subscription_not_linked', detail: 'preap-700', resolution_state: 'pending', attempt_count: 0, created_at: '2026-07-01T00:00:00Z' },
        ],
      };
      const mpFetch = vi.fn(async (path) => {
        if (path === '/authorized_payments/ap-700') {
          return { id: 'ap-700', status: 'processed', preapproval_id: 'preap-700', payment: { id: 'pay-700' }, last_modified: '2026-07-05T00:00:00Z' };
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      const rpcHandler = (name) => {
        if (name === 'record_mercadopago_subscription_event') return { data: 'status_applied', error: null };
        if (name === 'mark_mercadopago_event_resolution') return { data: true, error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(mpFetch).toHaveBeenCalledWith('/authorized_payments/ap-700');
      expect(summary.resolved).toBe(1);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('mark_mercadopago_event_resolution', {
        p_event_id: 'evt-3',
        p_resolution_state: 'resolved',
        p_outcome: 'status_applied',
        p_resolved_by_ref: 'subscription_authorized_payment_processed:ap-700',
      });
    });

    it('escalates occurred_at_unresolved to needs_admin on first sight (R23 — a re-fetch will never populate a missing field)', async () => {
      const tables = {
        mercadopago_events: [
          { id: 'evt-4', event_type: 'subscription_preapproval_authorized', mp_resource_id: 'preap-800', outcome: 'status_applied', detail: null, resolution_state: 'pending', attempt_count: 2, created_at: '2026-07-01T00:00:00Z' },
        ],
      };
      const mpFetch = vi.fn(async () => ({ id: 'preap-800', status: 'authorized' })); // no last_modified/date_created -> resolveOccurredAt -> null
      const rpcHandler = (name) => {
        if (name === 'record_mercadopago_subscription_event') return { data: 'occurred_at_unresolved', error: null };
        if (name === 'mark_mercadopago_event_resolution') return { data: true, error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(summary.needsAdmin).toBe(1);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('mark_mercadopago_event_resolution', {
        p_event_id: 'evt-4',
        p_resolution_state: 'needs_admin',
        p_outcome: 'occurred_at_unresolved',
        p_resolved_by_ref: null,
      });
    });

    it('escalates a permanently-blocked deferral to needs_admin once attempt_count reaches the ceiling (R24)', async () => {
      const tables = {
        mercadopago_events: [
          { id: 'evt-5', event_type: 'payment', mp_resource_id: 'pay-502', outcome: 'no_open_invoice', detail: 'preap-502', resolution_state: 'pending', attempt_count: 11, created_at: '2026-07-01T00:00:00Z' },
        ],
        affiliate_payment_subscriptions: [
          { id: 'sub-502', profile_id: 'prof-3', mp_preapproval_id: 'preap-502', status: 'authorized' },
        ],
        invoices: [],
      };
      const mpFetch = vi.fn(async () => ({ id: 'pay-502', status: 'approved', transaction_amount: 1000, external_reference: null, date_approved: '2026-07-05T00:00:00Z' }));
      const rpcHandler = (name) => {
        if (name === 'record_mercadopago_payment_audit_event') return { data: null, error: null };
        if (name === 'mark_mercadopago_event_resolution') return { data: true, error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(summary.needsAdmin).toBe(1);
      expect(summary.stillPending).toBe(0);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('mark_mercadopago_event_resolution', expect.objectContaining({
        p_event_id: 'evt-5',
        p_resolution_state: 'needs_admin',
      }));
    });

    it('counts a transport failure as a fetch failure, not a blocked deferral, and never aborts the rest of the pass (R24)', async () => {
      const tables = {
        mercadopago_events: [
          { id: 'evt-6', event_type: 'subscription_preapproval_authorized', mp_resource_id: 'preap-900', outcome: 'status_applied', detail: null, resolution_state: 'pending', attempt_count: 0, created_at: '2026-07-01T00:00:00Z' },
          { id: 'evt-7', event_type: 'subscription_preapproval_authorized', mp_resource_id: 'preap-901', outcome: 'status_applied', detail: null, resolution_state: 'pending', attempt_count: 0, created_at: '2026-07-02T00:00:00Z' },
        ],
      };
      const mpFetch = vi.fn(async (path) => {
        if (path === '/preapproval/preap-900') throw new Error('MP timeout');
        if (path === '/preapproval/preap-901') return { id: 'preap-901', status: 'authorized', last_modified: '2026-07-05T00:00:00Z' };
        throw new Error(`Unexpected path: ${path}`);
      });
      const rpcHandler = (name) => {
        if (name === 'record_mercadopago_subscription_event') return { data: 'status_applied', error: null };
        if (name === 'mark_mercadopago_event_resolution') return { data: true, error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(summary.fetchFailures).toBe(1);
      expect(summary.stillPending).toBe(0);
      expect(summary.resolved).toBe(1);
    });
  });

  describe('Pass B — link/orphan reconciliation', () => {
    it('back-fills profile_id once the adhesion is approved, then re-applies the CURRENT MP state (fact 9 / R7)', async () => {
      const tables = {
        affiliate_payment_subscriptions: [
          { id: 'sub-1', profile_id: null, adhesion_request_id: 'adh-1', mp_preapproval_id: 'preap-800', status: 'pending', created_at: '2026-06-01T00:00:00Z' },
        ],
        adhesion_requests: [
          { id: 'adh-1', status: 'approved', approved_profile_id: 'prof-9', created_at: '2026-06-01T00:00:00Z' },
        ],
      };
      const mpFetch = vi.fn(async (path) => {
        if (path === '/preapproval/preap-800') return { id: 'preap-800', status: 'authorized', last_modified: '2026-06-02T00:00:00Z' };
        throw new Error(`Unexpected path: ${path}`);
      });
      const rpcHandler = (name) => {
        if (name === 'record_mercadopago_subscription_event') return { data: 'status_applied', error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(summary.linked).toBe(1);
      expect(tables.affiliate_payment_subscriptions[0].profile_id).toBe('prof-9');
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_mercadopago_subscription_event', expect.objectContaining({
        p_mp_preapproval_id: 'preap-800',
        p_new_status: 'authorized',
      }));
    });

    it('cancels the preapproval at MP and escalates related deferrals when the adhesion was rejected instead (R6)', async () => {
      const tables = {
        affiliate_payment_subscriptions: [
          { id: 'sub-2', profile_id: null, adhesion_request_id: 'adh-2', mp_preapproval_id: 'preap-900', status: 'pending', created_at: '2026-06-01T00:00:00Z' },
        ],
        adhesion_requests: [
          { id: 'adh-2', status: 'rejected', approved_profile_id: null, created_at: '2026-06-01T00:00:00Z' },
        ],
        mercadopago_events: [
          { id: 'evt-linked', event_type: 'subscription_preapproval_authorized', mp_resource_id: 'preap-900:unlinked', outcome: 'subscription_not_linked', detail: null, resolution_state: 'pending', attempt_count: 0, created_at: '2026-06-01T00:00:00Z' },
          { id: 'evt-payment', event_type: 'payment', mp_resource_id: 'pay-999', outcome: 'no_open_invoice', detail: 'preap-900', resolution_state: 'pending', attempt_count: 0, created_at: '2026-06-01T00:00:00Z' },
        ],
      };
      const mpFetch = vi.fn(async (path, init) => {
        if (path === '/preapproval/preap-900' && init?.method === 'PUT') {
          return { id: 'preap-900', status: 'cancelled', last_modified: '2026-06-03T00:00:00Z' };
        }
        throw new Error(`Unexpected call: ${path} ${JSON.stringify(init)}`);
      });
      const rpcHandler = (name) => {
        if (name === 'record_mercadopago_subscription_event') return { data: 'status_applied', error: null };
        if (name === 'mark_mercadopago_event_resolution') return { data: true, error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });

      // Scoped to this one preapproval so Pass A's own query only ever sees
      // the two rows genuinely correlated to it (the same best-effort
      // ilike/detail correlation Pass B itself uses), keeping this test
      // focused on Pass B's own escalation behaviour.
      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, { preapprovalId: 'preap-900' });

      expect(summary.cancelledAtMp).toBe(1);
      expect(summary.needsAdmin).toBe(2);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('mark_mercadopago_event_resolution', {
        p_event_id: 'evt-linked',
        p_resolution_state: 'needs_admin',
        p_outcome: 'adhesion_rejected',
      });
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('mark_mercadopago_event_resolution', {
        p_event_id: 'evt-payment',
        p_resolution_state: 'needs_admin',
        p_outcome: 'adhesion_rejected',
      });
    });
  });

  describe('Pass D — release stale reservations', () => {
    it('releases only a reservation older than the 30-minute TTL, never a fresh one (R10/R21)', async () => {
      const oldTs = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      const freshTs = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const tables = {
        affiliate_payment_subscriptions: [
          { id: 'res-old', profile_id: 'prof-x', mp_preapproval_id: null, status: 'pending', created_at: oldTs },
          { id: 'res-fresh', profile_id: 'prof-y', mp_preapproval_id: null, status: 'pending', created_at: freshTs },
        ],
      };
      const rpcHandler = (name, args) => {
        if (name === 'release_subscription_reservation') {
          return { data: args.p_reservation_id === 'res-old', error: null };
        }
        throw new Error(`Unexpected RPC: ${name}`);
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler });
      const mpFetch = vi.fn();

      // Unscoped (global) sweep — Pass D never runs for a scoped call.
      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, {});

      expect(summary.reservationsReleased).toBe(1);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('release_subscription_reservation', { p_reservation_id: 'res-old' });
      expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith('release_subscription_reservation', { p_reservation_id: 'res-fresh' });
    });

    it('is skipped entirely for a scoped (preapprovalId) sweep call, since a reservation has no preapproval id to scope to', async () => {
      const oldTs = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      const tables = {
        affiliate_payment_subscriptions: [
          { id: 'res-old', profile_id: null, mp_preapproval_id: null, status: 'pending', created_at: oldTs },
        ],
      };
      const supabaseAdmin = createReconciliationStub({ tables, rpcHandler: () => ({ data: null, error: null }) });
      const mpFetch = vi.fn();

      const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch }, { preapprovalId: 'some-preapproval' });

      expect(summary.reservationsReleased).toBe(0);
      expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith('release_subscription_reservation', expect.anything());
    });
  });
});
