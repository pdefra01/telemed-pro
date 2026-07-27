import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  verifyWebhookSignature,
  deriveSubscriptionEventKey,
  resolveOccurredAt,
  handlePaymentSettlement,
  handleSubscriptionEvent,
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
