// server/mercadopago.js
//
// The ONLY module that knows Mercado Pago's wire format (design REV 6,
// design-appendix "File Changes" / "Interfaces"). Every function here is a
// plain function of its explicit arguments — no Express/request context is
// held anywhere in this file, so a future scheduler or Edge Function can call
// `runDeferredReconciliation` (PR 4) with zero refactor.
//
// PR 2 SCOPE: this file implements ONLY the wire-format primitives —
// signature verification, key derivation, timestamp resolution, and the two
// webhook-side handlers (`handlePaymentSettlement`, `handleSubscriptionEvent`).
// The D-H reconciliation sweep (`runDeferredReconciliation` and its four
// passes) is Phase 4 / PR 4 per `sdd/mercadopago-integration/tasks` and is
// deliberately NOT implemented here — see this repo's apply-progress note for
// PR 2 for why.
//
// Base: sdd/mercadopago-integration design REV 6 (D-A, D-B, D-C, D-D) and its
// appendix (Interfaces section). Design is FINAL for this change.

import crypto from 'node:crypto';

// ── Constants ────────────────────────────────────────────────────────────

/** Mirrors AdhesionForm.tsx's débito-automático 20% discount copy (D-F). */
export const DEBITO_AUTOMATICO_DISCOUNT = 0.8;

// MP payment statuses that will NEVER transition further — safe to mark
// resolution_state='final' immediately. Every other non-'approved' status
// (pending, in_process, in_mediation, authorized) is assumed to still become
// 'approved' (or a status in this list) later, so must stay 'pending' to
// remain visible to future redelivery/retry.
//
// UNVERIFIED (design-appendix Open Question 6, non-blocking): whether MP
// always emits a follow-up notification when an 'authorized' (two-step,
// capture=false) payment expires without being captured. If MP ever lets one
// silently expire with no further webhook, that payment's audit row stays
// resolution_state='pending' forever — not a data-corruption risk (the row
// is simply never marked final), just wasted retry cycles once the D-H sweep
// (PR 4) exists. Confirm against a real MP sandbox before relying on
// two-step/capture=false payments in production.
const TERMINAL_REJECTED_PAYMENT_STATUSES = ['rejected', 'cancelled', 'refunded', 'charged_back'];

const SIGNATURE_MAX_SKEW_SECONDS = 300;

// ── verifyWebhookSignature ───────────────────────────────────────────────

/**
 * Verifies Mercado Pago's `x-signature` header before any DB access (D-C).
 *
 * Header shape: `ts=<unix>,v1=<hex>`. The signed manifest is
 * `id:{dataId};request-id:{x-request-id};ts:{ts};` — MP hashes this
 * manifest string, NOT the raw request body.
 *
 * UNVERIFIED (design-appendix Open Question 5 — BLOCKING for full
 * finalization): this manifest shape and the `x-request-id` header's
 * presence are confirmed by MP's docs only for the `payment` topic. Whether
 * they are byte-identical for `subscription_preapproval` and
 * `subscription_authorized_payment` has NOT been confirmed against a real MP
 * sandbox. If a subscription-topic notification is rejected here with an
 * otherwise well-formed header, check this assumption FIRST before assuming
 * a bug in this function.
 *
 * @param {Record<string, string | undefined>} headers - lowercased request headers (Express convention)
 * @param {string} dataId - the resource id this notification is addressing (`data.id` from the webhook body)
 * @param {string} secret - `MERCADOPAGO_WEBHOOK_SECRET`
 * @returns {boolean}
 */
export function verifyWebhookSignature(headers, dataId, secret) {
  if (!headers || dataId === undefined || dataId === null || !secret) {
    return false;
  }

  const signatureHeader = headers['x-signature'];
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return false;
  }

  const parts = {};
  for (const segment of signatureHeader.split(',')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (key) parts[key] = value;
  }

  const ts = parts.ts;
  const providedV1 = parts.v1;
  if (!ts || !providedV1) {
    return false;
  }

  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsNumber) > SIGNATURE_MAX_SKEW_SECONDS) {
    return false;
  }

  const requestId = headers['x-request-id'] || '';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expectedV1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expectedV1, 'hex');
  const providedBuffer = Buffer.from(providedV1, 'hex');

  // crypto.timingSafeEqual throws on unequal-length buffers — a length
  // mismatch is itself proof of an invalid signature, so short-circuit to
  // `false` instead of letting it throw.
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

// ── deriveSubscriptionEventKey ───────────────────────────────────────────

/**
 * The SINGLE, shared mapping from a re-fetched MP resource + status to a
 * `(event_type, mp_resource_id)` dedup key and a target subscription status
 * (D-D). The webhook, `/api/approve-adhesion`'s reconciliation (PR 3) and
 * every D-H sweep pass (PR 4) MUST all call this — none may build the
 * `event_type` string independently, or two derivations could produce
 * differently-shaped keys for the SAME logical transition and defeat the
 * composite dedup on `mercadopago_events`.
 *
 * `kind` is the RE-FETCHED resource kind (never the raw webhook `type`):
 * `'preapproval'` for `subscription_preapproval` notifications, or
 * `'authorized_payment'` for the lifecycle half of `subscription_authorized_payment`
 * notifications (its ledger-settlement half is handled separately by
 * `handlePaymentSettlement`, keyed by `external_ref`, not by this function).
 *
 * UNVERIFIED (design-appendix Open Question 3): whether MP actually emits
 * `preapproval.status === 'paused'` under the `subscription_preapproval`
 * topic at all has not been confirmed against a real sandbox — if pauses
 * arrive under a different topic or shape, this branch may never fire.
 *
 * @param {{ id: string | number, status: string } | null | undefined} resource
 * @param {'preapproval' | 'authorized_payment'} kind
 * @returns {{ eventType: string, mpResourceId: string | number, newStatus: string } | null}
 */
export function deriveSubscriptionEventKey(resource, kind) {
  if (!resource || resource.id === undefined || resource.id === null || !resource.status) {
    return null;
  }

  if (kind === 'preapproval') {
    switch (resource.status) {
      case 'authorized':
        return { eventType: 'subscription_preapproval_authorized', mpResourceId: resource.id, newStatus: 'authorized' };
      case 'cancelled':
        return { eventType: 'subscription_preapproval_cancelled', mpResourceId: resource.id, newStatus: 'cancelled' };
      case 'paused':
        // Routed to the SAME target status as a real cancellation (D-D:
        // "no functioning auto-debit ⇒ list price" is exactly what a pause
        // is), but under its OWN event_type so the dedup slot never collides
        // with an actual `cancelled` notification for the same preapproval.
        return { eventType: 'subscription_preapproval_paused', mpResourceId: resource.id, newStatus: 'cancelled' };
      default:
        return null; // 'pending' and any other status: ack, audit only, non-modelled
    }
  }

  if (kind === 'authorized_payment') {
    switch (resource.status) {
      case 'processed':
        return { eventType: 'subscription_authorized_payment_processed', mpResourceId: resource.id, newStatus: 'authorized' };
      case 'rejected':
        return { eventType: 'subscription_authorized_payment_rejected', mpResourceId: resource.id, newStatus: 'payment_failed' };
      default:
        return null; // 'scheduled', 'recycling': non-terminal, ack/audit only
    }
  }

  return null;
}

// ── resolveOccurredAt ─────────────────────────────────────────────────────

/**
 * ONE ordered fallback chain per re-fetched resource kind (D-D), reconciling
 * REV 5's self-contradiction where two different rows named different
 * fallbacks for the SAME underlying MP payment object.
 *
 * | kind                | ordered fallback chain                                               |
 * |---------------------|-----------------------------------------------------------------------|
 * | `payment`           | `date_approved` (only when `status==='approved'`) → `date_last_updated` → `date_created` |
 * | `authorized_payment`| `last_modified` → `resolveOccurredAt(ap.payment,'payment')` → `date_created` |
 * | `preapproval`       | `last_modified` → `date_created`                                     |
 *
 * If every candidate is absent, returns `null` — callers (`record_mercadopago_subscription_event`)
 * MUST fail closed on `null` rather than substituting `now()`, which is
 * always newer than anything stored and would silently disable the recency
 * guard in the permissive direction (R23).
 *
 * UNVERIFIED (design-appendix Open Question 2): which of these fields MP
 * actually populates per resource kind, and their exact formats, has not
 * been confirmed against a real sandbox response. If a kind reliably lacks
 * every candidate in practice, R23's fail-closed path becomes the NORMAL
 * path rather than the exception, and this chain needs an extra candidate.
 *
 * @param {Record<string, any> | null | undefined} resource
 * @param {'payment' | 'authorized_payment' | 'preapproval'} kind
 * @returns {string | null} ISO timestamp string, or null if unresolved
 */
export function resolveOccurredAt(resource, kind) {
  if (!resource) return null;

  if (kind === 'payment') {
    if (resource.status === 'approved' && resource.date_approved) return resource.date_approved;
    if (resource.date_last_updated) return resource.date_last_updated;
    if (resource.date_created) return resource.date_created;
    return null;
  }

  if (kind === 'authorized_payment') {
    if (resource.last_modified) return resource.last_modified;
    // The nested object IS a payment, so it re-enters the `payment` chain
    // above instead of this row naming its own payment-object fields.
    const nested = resolveOccurredAt(resource.payment, 'payment');
    if (nested) return nested;
    if (resource.date_created) return resource.date_created;
    return null;
  }

  if (kind === 'preapproval') {
    if (resource.last_modified) return resource.last_modified;
    if (resource.date_created) return resource.date_created;
    return null;
  }

  return null;
}

// ── handlePaymentSettlement ───────────────────────────────────────────────

const CHECKOUT_PRO_REFERENCE_PATTERN = /^affiliate:([^:]+):invoice:([^:]+)$/;

/**
 * Refresh-on-redelivery audit write for the `mercadopago_events` table,
 * scoped to the `payment` topic only. Delegates to the
 * `record_mercadopago_payment_audit_event` SECURITY DEFINER RPC
 * (`20260727000000_mercadopago_payment_audit_rpc.sql`) rather than a
 * client-side `.upsert()` (Judgment Day Round 2): a bare client-side
 * `ON CONFLICT DO UPDATE` had no way to (a) guard a `'duplicate'` outcome
 * from clobbering a previously-recorded real outcome on the routine case of
 * an ordinary webhook redelivery, or (b) guard `resolution_state` from
 * regressing away from `'final'`. Both guards now live in the RPC, applied
 * server-side regardless of which fields a given call site happens to pass.
 *
 * Every `handlePaymentSettlement` call site passes the SAME literal
 * `event_type: 'payment'`, so the composite `(event_type, mp_resource_id)`
 * key degrades to a bare `mp_resource_id` key for this topic — every
 * redelivery for the same payment id refreshes the row with the latest
 * known outcome/resolution_state (subject to the RPC's monotonic guards),
 * never freezing at the first-seen delivery. Callers MUST pass the complete,
 * current field set (explicit `null` where a value is genuinely unknown) —
 * the RPC fully overwrites `detail`/`invoice_id`/`profile_id`/`amount` on
 * every call, it does not merge partial updates.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ mp_resource_id: string, mp_status?: string|null, outcome: string, resolution_state: string, detail?: string|null, invoice_id?: string|null, profile_id?: string|null, amount?: number|null }} row
 */
async function writeMercadopagoAuditEvent(supabaseAdmin, row) {
  return supabaseAdmin.rpc('record_mercadopago_payment_audit_event', {
    p_mp_resource_id: row.mp_resource_id,
    p_mp_status: row.mp_status ?? null,
    p_outcome: row.outcome,
    p_resolution_state: row.resolution_state,
    p_detail: row.detail ?? null,
    p_invoice_id: row.invoice_id ?? null,
    p_profile_id: row.profile_id ?? null,
    p_amount: row.amount ?? null,
  });
}

/**
 * Correlates a re-fetched, APPROVED payment to the invoice it should settle
 * (D-C "Invoice correlation"). Never trusts the parsed reference string for
 * WHO to bill — only for WHICH invoice to look up; the actual billed entity
 * always comes from the server-side re-read invoice row (R25).
 *
 * @returns {Promise<{ invoice: any | null, outcome: string | null, detail?: any }>}
 *   `outcome` is null when a payable invoice was found; otherwise it names
 *   the deferral/rejection reason for the caller to audit.
 */
async function correlateInvoice(supabaseAdmin, payment, preapprovalId) {
  const reference = payment.external_reference || null;

  if (reference) {
    const match = CHECKOUT_PRO_REFERENCE_PATTERN.exec(reference);
    if (!match) {
      return { invoice: null, outcome: 'ref_mismatch', detail: reference };
    }
    const [, parsedProfileId, parsedInvoiceId] = match;

    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', parsedInvoiceId)
      .maybeSingle();

    if (error) {
      return { invoice: null, outcome: 'rpc_error', detail: error.message };
    }
    if (!invoice) {
      return { invoice: null, outcome: 'invoice_not_found', detail: parsedInvoiceId };
    }

    // Authority rule (D-C): the billed entity is the RE-READ invoice row's
    // entity_id, never the parsed reference string. A disagreement is not a
    // "which affiliate" ambiguity to resolve — it is the exact signal R25
    // exists to catch, so it is refused outright rather than trusting either
    // side.
    if (String(invoice.entity_id) !== String(parsedProfileId)) {
      return { invoice: null, outcome: 'ref_mismatch', detail: reference };
    }

    return { invoice, outcome: null };
  }

  // No external_reference: this is a débito-automático (subscription)
  // charge. Correlate via the preapproval id instead of a reference string.
  if (!preapprovalId) {
    return { invoice: null, outcome: 'no_open_invoice', detail: 'missing_preapproval_id' };
  }

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('affiliate_payment_subscriptions')
    .select('profile_id')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();

  if (subscriptionError) {
    return { invoice: null, outcome: 'rpc_error', detail: subscriptionError.message };
  }

  if (!subscription || !subscription.profile_id) {
    // R1/R2: the signup→approval gap. profile_id is deliberately checked
    // for null rather than conflated with "subscription row not found".
    return { invoice: null, outcome: 'subscription_not_linked', detail: preapprovalId };
  }

  const { data: openInvoice, error: invoiceError } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('entity_type', 'affiliate')
    .eq('entity_id', subscription.profile_id)
    .eq('status', 'issued')
    .order('period', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (invoiceError) {
    return { invoice: null, outcome: 'rpc_error', detail: invoiceError.message };
  }

  if (!openInvoice) {
    // R3/R4: no invoice exists yet for this period. Whether that is because
    // the billing cycle hasn't run yet or because no coverage window exists
    // at all (R5) is a distinction the D-H sweep (PR 4) makes on retry, not
    // this handler.
    return { invoice: null, outcome: 'no_open_invoice', detail: preapprovalId };
  }

  return { invoice: openInvoice, outcome: null };
}

/**
 * Settles a re-fetched Mercado Pago payment against the receivables ledger
 * (D-A/D-B/D-C). Callable from BOTH the `payment` webhook topic (`paymentId`
 * known directly from the body) and the `subscription_authorized_payment`
 * topic's settlement half (`paymentId` is the id nested inside the
 * re-fetched authorized_payment's `payment.id` — UNVERIFIED, design-appendix
 * Open Question 4, **BLOCKING**). The caller (server.js, PR 3) resolves
 * `paymentId`/`preapprovalId` from the already re-fetched MP resource(s)
 * BEFORE calling this function; this function never re-derives them from a
 * raw webhook body, and never trusts webhook-body status/amount fields —
 * only the object it re-fetches itself (D-C's authority rule).
 *
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient, mpFetch: (path: string) => Promise<any> }} ctx
 * @param {{ paymentId: string, preapprovalId?: string | null }} params
 */
export async function handlePaymentSettlement(ctx, { paymentId, preapprovalId = null }) {
  const { supabaseAdmin, mpFetch } = ctx;

  let payment;
  try {
    payment = await mpFetch(`/v1/payments/${paymentId}`);
  } catch (err) {
    // Transport failure: no audit row is written (nothing was learned about
    // this payment yet), so a retry/redelivery gets a clean second attempt.
    return { outcome: 'fetch_failed', posted: false, detail: err?.message || String(err) };
  }

  if (!payment || payment.id === undefined || payment.id === null) {
    return { outcome: 'fetch_failed', posted: false, detail: 'empty_payment_response' };
  }

  const mpResourceId = String(payment.id);

  if (payment.status !== 'approved') {
    const { error: auditWriteError } = await writeMercadopagoAuditEvent(supabaseAdmin, {
      event_type: 'payment',
      mp_resource_id: mpResourceId,
      mp_status: payment.status,
      outcome: 'not_approved',
      resolution_state: TERMINAL_REJECTED_PAYMENT_STATUSES.includes(payment.status) ? 'final' : 'pending',
      detail: null,
      invoice_id: null,
      profile_id: null,
      amount: null,
    });
    return {
      outcome: 'not_approved',
      mpStatus: payment.status,
      posted: false,
      auditError: auditWriteError ? auditWriteError.message : null,
    };
  }

  const externalRef = `payment:mercadopago:${mpResourceId}`;
  const occurredAt = resolveOccurredAt(payment, 'payment');

  const correlation = await correlateInvoice(supabaseAdmin, payment, preapprovalId);

  if (!correlation.invoice) {
    const { error: auditWriteError } = await writeMercadopagoAuditEvent(supabaseAdmin, {
      event_type: 'payment',
      mp_resource_id: mpResourceId,
      mp_status: payment.status,
      detail: correlation.detail !== undefined ? String(correlation.detail) : null,
      outcome: correlation.outcome,
      // A mismatched/stale reference is a human decision (R25); an
      // unlinked subscription or a not-yet-issued invoice self-heals once
      // the D-H sweep (PR 4) links/retries it — hence 'pending', not 'needs_admin'.
      resolution_state: correlation.outcome === 'ref_mismatch' || correlation.outcome === 'invoice_not_found'
        ? 'needs_admin'
        : 'pending',
      invoice_id: null,
      profile_id: null,
      amount: null,
    });
    return {
      outcome: correlation.outcome,
      posted: false,
      auditError: auditWriteError ? auditWriteError.message : null,
    };
  }

  const { invoice } = correlation;

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('post_payment_movement_from_webhook', {
    p_invoice_id: invoice.id,
    p_entity_type: 'affiliate',
    p_entity_id: invoice.entity_id,
    p_amount: payment.transaction_amount,
    p_external_ref: externalRef,
    p_source: 'mercadopago',
    p_occurred_at: occurredAt,
  });

  if (rpcError) {
    // Transient DB failure — recorded as 'pending' (not 'final') so the D-H
    // sweep (PR 4) can re-attempt it; the money is real and must not be
    // silently dropped just because this one RPC call failed.
    const { error: auditWriteError } = await writeMercadopagoAuditEvent(supabaseAdmin, {
      event_type: 'payment',
      mp_resource_id: mpResourceId,
      mp_status: payment.status,
      invoice_id: invoice.id,
      profile_id: invoice.entity_id,
      amount: payment.transaction_amount,
      outcome: 'rpc_error',
      detail: rpcError.message,
      resolution_state: 'pending',
    });
    return {
      outcome: 'rpc_error',
      posted: false,
      detail: rpcError.message,
      auditError: auditWriteError ? auditWriteError.message : null,
    };
  }

  const outcome = rpcResult.posted ? (rpcResult.deferred_reason || 'posted') : 'duplicate';

  const { error: auditWriteError } = await writeMercadopagoAuditEvent(supabaseAdmin, {
    event_type: 'payment',
    mp_resource_id: mpResourceId,
    mp_status: payment.status,
    profile_id: invoice.entity_id,
    invoice_id: invoice.id,
    amount: payment.transaction_amount,
    outcome,
    resolution_state: 'final',
    // Full-overwrite semantics (RPC comment): must be explicit so a stale
    // rpc_error/ref_mismatch detail from an earlier failed attempt against
    // this same mp_resource_id is actually cleared on success, not left
    // stuck.
    detail: null,
  });

  return { outcome, ...rpcResult, auditError: auditWriteError ? auditWriteError.message : null };
}

// ── handleSubscriptionEvent ───────────────────────────────────────────────

/** `to_char(now(),'YYYY-MM')` equivalent, computed once in JS and passed into
 * `record_mercadopago_subscription_event` — never recomputed inside the RPC,
 * so it can never drift across a month boundary between the status change
 * and any later read (D-E). Uses UTC for determinism regardless of server
 * timezone configuration. */
function currentPeriodString() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Applies a subscription lifecycle transition reported by MP. Routes
 * EXCLUSIVELY through `deriveSubscriptionEventKey` (the single-derivation
 * rule — D-D) and `record_mercadopago_subscription_event`; never builds an
 * `event_type` string of its own.
 *
 * For an `authorized_payment` resource, the preapproval id is read from its
 * `preapproval_id` field. UNVERIFIED against a real MP sandbox response
 * (design-appendix Open Question 4 territory — the same re-fetch-chain
 * uncertainty that affects `handlePaymentSettlement`'s `paymentId` resolution
 * also touches this field name).
 *
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient }} ctx
 * @param {{ resource: any, kind: 'preapproval' | 'authorized_payment' }} params
 */
export async function handleSubscriptionEvent(ctx, { resource, kind }) {
  const { supabaseAdmin } = ctx;

  const key = deriveSubscriptionEventKey(resource, kind);
  if (!key) {
    return { outcome: 'ignored', reason: 'unmodelled_status' };
  }

  const occurredAt = resolveOccurredAt(resource, kind);
  const mpPreapprovalId = kind === 'preapproval' ? resource.id : resource.preapproval_id;

  // D-E: the discount cutoff is supplied by the CALLER as the current
  // period, in the SAME call as the status change — never recomputed later
  // from a stored value. Only set for a cancellation target status.
  const discountThroughPeriod = key.newStatus === 'cancelled' ? currentPeriodString() : null;

  const { data, error } = await supabaseAdmin.rpc('record_mercadopago_subscription_event', {
    p_mp_preapproval_id: mpPreapprovalId,
    p_event_type: key.eventType,
    p_mp_resource_id: key.mpResourceId,
    p_new_status: key.newStatus,
    p_occurred_at: occurredAt,
    p_discount_through_period: discountThroughPeriod,
  });

  if (error) {
    return { outcome: 'rpc_error', error: error.message };
  }

  return { outcome: data };
}
