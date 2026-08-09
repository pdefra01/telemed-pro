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
//
// PR 3 ADDITION: `routeWebhookNotification` — the topic-to-re-fetch-to-
// handler dispatch table (D-C), factored out of `server.js` so it stays
// unit-testable without an Express/Supabase harness. `server.js` itself only
// verifies the signature and maps the returned `{status, body}` onto the
// HTTP response.
//
// PR 4 ADDITION: `runDeferredReconciliation` — the D-H reconciliation sweep's
// four passes (B, A, C, D). A plain function of `(ctx, options)` with no
// Express/request context, exactly like every other export here, so a future
// scheduler or Edge Function can call it with zero refactor. It reuses
// `handlePaymentSettlement`/`handleSubscriptionEvent`/`deriveSubscriptionEventKey`
// verbatim — it holds NO divergent replay logic of its own (design-appendix
// D-H/R22: a divergent path would derive its own dedup keys and lose the
// idempotency guarantee both the live webhook and this sweep depend on).
//
// Base: sdd/mercadopago-integration design REV 6 (D-A, D-B, D-C, D-D, D-H)
// and its appendix (Race Conditions & Recovery, Interfaces). Design is FINAL
// for this change.

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
// Exported (not just module-private) so runDeferredReconciliation's Pass A
// can classify a re-attempted `not_approved` settlement outcome using the
// SAME terminal-status list handlePaymentSettlement itself used to decide
// resolution_state, rather than maintaining a second copy that could drift.
export const TERMINAL_REJECTED_PAYMENT_STATUSES = ['rejected', 'cancelled', 'refunded', 'charged_back'];

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
 * Best-effort realtime notification for a settled payment. Mirrors the
 * `notifications` insert pattern used by the finalize-consultation edge
 * function: never throws, a failure here must not roll back or block the
 * settlement itself — the money has already been posted by the time this
 * runs.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ userId: string, amount: number }} params
 */
async function notifyPaymentSettled(supabaseAdmin, { userId, amount }) {
  try {
    const { error } = await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      title: 'Pago acreditado',
      message: `Registramos tu pago de $${amount.toLocaleString()}. Tu cuenta corriente ya está actualizada.`,
      type: 'success',
      link: '/payments',
    });

    if (error) {
      console.error('[mercadopago] Error enviando notificación de pago:', error.message);
    }
  } catch (err) {
    console.error('[mercadopago] Error enviando notificación de pago:', err?.message || String(err));
  }
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
      resolution_state: (payment.status === 'refunded' || payment.status === 'charged_back')
        ? 'needs_admin'
        : TERMINAL_REJECTED_PAYMENT_STATUSES.includes(payment.status) ? 'final' : 'pending',
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

  if (rpcResult.posted) {
    await notifyPaymentSettled(supabaseAdmin, {
      userId: invoice.entity_id,
      amount: payment.transaction_amount,
    });
  }

  const { error: auditWriteError } = await writeMercadopagoAuditEvent(supabaseAdmin, {
    event_type: 'payment',
    mp_resource_id: mpResourceId,
    mp_status: payment.status,
    profile_id: invoice.entity_id,
    invoice_id: invoice.id,
    amount: payment.transaction_amount,
    outcome,
    // R17: the settlement RPC posts the money correctly even on
    // 'window_reset', but a window reset mid-flight means a human should
    // confirm the reset didn't already cover this period — flag it for
    // admin review here at the source, instead of 'final'.
    resolution_state: outcome === 'window_reset' ? 'needs_admin' : 'final',
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

// ── routeWebhookNotification ─────────────────────────────────────────────

/**
 * PR 3: the webhook HTTP layer's ONLY remaining piece of MP wire-format
 * knowledge beyond `verifyWebhookSignature` — which endpoint to re-fetch for
 * a given notification `type`, and which handler consumes the result (D-C's
 * routing table). Deliberately still knows nothing about Express — factored
 * out here (rather than left inline in `server.js`) so it stays unit-testable
 * with the same stubbed-`ctx` pattern PR 2's tests already use, keeping
 * `server.js` itself down to routing/auth/HTTP-status mapping only, per the
 * design-appendix's File Changes note for `server.js`.
 *
 * `payment`-topic notifications correlate SOLELY via `external_reference`
 * (Checkout Pro) — no `preapprovalId` is threaded through for this topic.
 * A débito-automático charge's own correlation happens through the
 * `subscription_authorized_payment` topic below, which supplies
 * `preapproval_id` directly from the re-fetched authorized_payment resource.
 * This is a deliberate scope decision (not one of the two BLOCKING Open
 * Questions), documented here so a future reader doesn't mistake the
 * omission for a bug.
 *
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient, mpFetch: (path: string, init?: any) => Promise<any> }} ctx
 * @param {{ topic: string | undefined, dataId: string }} params
 * @returns {Promise<{ status: number, body: Record<string, any> }>}
 */
export async function routeWebhookNotification(ctx, { topic, dataId }) {
  const { mpFetch } = ctx;

  if (topic === 'payment') {
    const result = await handlePaymentSettlement(ctx, { paymentId: dataId });
    return { status: 200, body: { outcome: result.outcome } };
  }

  if (topic === 'subscription_authorized_payment') {
    let authorizedPayment;
    try {
      // UNVERIFIED (design-appendix Open Question 4 — BLOCKING): assumes
      // data.id on this topic IS the authorized_payment id, re-fetched here.
      // If MP sends the payment id directly instead, this re-fetch chain and
      // handlePaymentSettlement's paymentId resolution both need correcting
      // together.
      authorizedPayment = await mpFetch(`/authorized_payments/${dataId}`);
    } catch (err) {
      return { status: 502, body: { error: 'mp_fetch_failed', detail: err?.message || String(err) } };
    }

    if (!authorizedPayment || authorizedPayment.status === undefined || authorizedPayment.status === null) {
      return { status: 200, body: { outcome: 'ignored', reason: 'empty_authorized_payment_response' } };
    }

    if (authorizedPayment.status === 'processed') {
      const nestedPaymentId = authorizedPayment.payment?.id;
      if (nestedPaymentId === undefined || nestedPaymentId === null) {
        return { status: 200, body: { outcome: 'ignored', reason: 'missing_nested_payment_id' } };
      }
      // "processed performs TWO writes in TWO transactions: ledger first
      // (money is the priority), subscription second" (D-C). Their dedup
      // keys are independent, so a crash between them self-heals on
      // redelivery or the D-H sweep (PR 4).
      const settlement = await handlePaymentSettlement(ctx, {
        paymentId: String(nestedPaymentId),
        preapprovalId: authorizedPayment.preapproval_id ?? null,
      });
      const lifecycle = await handleSubscriptionEvent(ctx, { resource: authorizedPayment, kind: 'authorized_payment' });
      return { status: 200, body: { outcome: settlement.outcome, lifecycleOutcome: lifecycle.outcome } };
    }

    // 'rejected' -> payment_failed (no ledger write); 'scheduled'/'recycling'
    // -> deriveSubscriptionEventKey returns null, handleSubscriptionEvent
    // no-ops as 'ignored'.
    const lifecycle = await handleSubscriptionEvent(ctx, { resource: authorizedPayment, kind: 'authorized_payment' });
    return { status: 200, body: { outcome: lifecycle.outcome } };
  }

  if (topic === 'subscription_preapproval') {
    let preapproval;
    try {
      preapproval = await mpFetch(`/preapproval/${dataId}`);
    } catch (err) {
      return { status: 502, body: { error: 'mp_fetch_failed', detail: err?.message || String(err) } };
    }

    if (!preapproval || preapproval.status === undefined || preapproval.status === null) {
      return { status: 200, body: { outcome: 'ignored', reason: 'empty_preapproval_response' } };
    }

    const lifecycle = await handleSubscriptionEvent(ctx, { resource: preapproval, kind: 'preapproval' });
    return { status: 200, body: { outcome: lifecycle.outcome } };
  }

  // Unrecognized topic (D-C "other" row): ack without further processing.
  return { status: 200, body: { outcome: 'ignored', reason: 'unrecognized_topic' } };
}

// ── runDeferredReconciliation ────────────────────────────────────────────

/** After this many sweep attempts a still-blocked deferral is escalated to
 * `needs_admin` instead of retried forever (design-appendix Pass A). */
const RECONCILIATION_ATTEMPT_CEILING = 12;

/** Pass C only re-checks a live subscription once its most recently known
 * event is at least this old, or entirely absent — bounds MP API cost to the
 * problem, not the roster (design-appendix Pass C). */
const PASS_C_STALE_DAYS = 35;

/** Mirrors `claim_subscription_enrollment`'s own 30-minute TTL for when a
 * reservation counts as abandoned (design-appendix Pass D / D-F). */
const RESERVATION_TTL_MINUTES = 30;

/**
 * Strips a `mercadopago_events.mp_resource_id` suffix (`:unlinked`,
 * `:unknown`, `:noclock` — written by `record_mercadopago_subscription_event`
 * when it deliberately leaves the REAL dedup slot free, D-D) back down to the
 * bare MP resource id a re-fetch actually needs.
 *
 * @param {string} mpResourceId
 * @returns {string}
 */
function baseResourceId(mpResourceId) {
  const separatorIndex = mpResourceId.indexOf(':');
  return separatorIndex === -1 ? mpResourceId : mpResourceId.slice(0, separatorIndex);
}

/**
 * Which re-fetch kind a subscription-flavoured `mercadopago_events.event_type`
 * belongs to — the inverse of `deriveSubscriptionEventKey`'s own mapping.
 * Never applied to the `'payment'` event_type, which has no `kind` (D-C).
 *
 * @param {string} eventType
 * @returns {'preapproval' | 'authorized_payment' | null}
 */
function subscriptionKindForEventType(eventType) {
  if (eventType.startsWith('subscription_authorized_payment')) return 'authorized_payment';
  if (eventType.startsWith('subscription_preapproval')) return 'preapproval';
  return null;
}

/**
 * Classifies a `handlePaymentSettlement` result for Pass A's own sweep
 * bookkeeping (never for the payment-topic audit row itself — that write
 * already happened inside `handlePaymentSettlement`, freeze-once-final,
 * D-C/`20260727000000`).
 *
 * @returns {'resolved' | 'still_pending' | 'needs_admin'}
 */
function classifyPaymentSettlementOutcome(result) {
  if (result.outcome === 'fetch_failed') return 'still_pending';

  if (result.outcome === 'not_approved') {
    // A non-terminal MP status (pending/in_process/authorized/in_mediation)
    // may still become 'approved' later — worth another attempt. A terminal
    // status is a real, final answer; nothing further will ever arrive.
    return TERMINAL_REJECTED_PAYMENT_STATUSES.includes(result.mpStatus) ? 'resolved' : 'still_pending';
  }

  // R25: a mismatched or stale reference, or an invoice that no longer
  // exists, is a human decision — never something a re-fetch resolves.
  if (result.outcome === 'ref_mismatch' || result.outcome === 'invoice_not_found') return 'needs_admin';

  // R1-R5: still blocked on a dependency (link, invoice, coverage window) or
  // a transient DB error reading them — worth another attempt.
  if (
    result.outcome === 'subscription_not_linked'
    || result.outcome === 'no_open_invoice'
    || result.outcome === 'rpc_error'
  ) {
    return 'still_pending';
  }

  // R17: the settlement RPC ran and posted the money correctly, and
  // `handlePaymentSettlement` already writes resolution_state:'needs_admin'
  // (not 'final') directly on the row for this outcome, so a human can
  // confirm the reset didn't already cover this period.
  if (result.outcome === 'window_reset') return 'needs_admin';

  // Every remaining outcome ('posted', 'duplicate', or any other
  // deferred_reason: 'no_window', 'balance_due', 'partial_payment',
  // 'invoice_already_paid', 'invoice_cancelled', 'period_already_extended')
  // means the settlement RPC actually ran and reached a final, legitimate
  // business determination. Nothing more to retry.
  return 'resolved';
}

/**
 * Classifies a `handleSubscriptionEvent` outcome string for Pass A/C's own
 * sweep bookkeeping.
 *
 * @returns {'resolved' | 'still_pending' | 'needs_admin'}
 */
function classifySubscriptionEventOutcome(outcome) {
  // R23: fail closed — a re-fetch will never populate a field MP never sends.
  if (outcome === 'occurred_at_unresolved') return 'needs_admin';
  // R1/R2: Pass B may link this subscription on a later run within the same
  // or a future sweep.
  if (outcome === 'subscription_not_linked') return 'still_pending';
  if (outcome === 'unknown_subscription' || outcome === 'rpc_error') return 'still_pending';
  // The re-fetched resource now carries an unmodelled status (e.g. reverted
  // to 'pending') — try again later in case it changes.
  if (outcome === 'ignored') return 'still_pending';
  // 'status_applied' (transition applied), 'transition_ignored' (correctly
  // superseded by a newer state under the terminal/recency guard) and
  // 'duplicate_event' (already recorded, likely by a race with the live
  // webhook — R22) are all "nothing more to do" states.
  return 'resolved';
}

/**
 * Pass B (D-H, runs FIRST): links an orphaned subscription
 * (`profile_id IS NULL`) to the profile its adhesion created, once that
 * adhesion is approved (fact 9 / R7) — or cancels it at MP and escalates its
 * related deferrals when the adhesion was instead rejected (R6, since
 * `AdhesionRepository.rejectApplication` never touches MP itself).
 *
 * @param {{ supabaseAdmin: any, mpFetch: (path: string, init?: any) => Promise<any> }} ctx
 * @param {{ preapprovalId?: string }} options
 * @param {Record<string, number>} summary
 */
async function runPassB(ctx, options, summary) {
  const { supabaseAdmin, mpFetch } = ctx;

  let query = supabaseAdmin
    .from('affiliate_payment_subscriptions')
    .select('id, adhesion_request_id, mp_preapproval_id, created_at')
    .is('profile_id', null)
    .not('mp_preapproval_id', 'is', null);
  if (options.preapprovalId) query = query.eq('mp_preapproval_id', options.preapprovalId);

  const { data: orphanRows, error } = await query;
  if (error || !orphanRows) return;

  for (const sub of orphanRows) {
    if (!sub.adhesion_request_id) continue;

    const { data: adhesion } = await supabaseAdmin
      .from('adhesion_requests')
      .select('status, approved_profile_id, created_at')
      .eq('id', sub.adhesion_request_id)
      .maybeSingle();

    if (!adhesion) continue;

    if (adhesion.status === 'approved' && adhesion.approved_profile_id) {
      const { error: updateError } = await supabaseAdmin
        .from('affiliate_payment_subscriptions')
        .update({ profile_id: adhesion.approved_profile_id })
        .eq('id', sub.id);

      if (!updateError) {
        summary.linked++;
        // Mirrors /api/approve-adhesion's own step (c): now that this row
        // can finally be linked, re-fetch its CURRENT state at MP and apply
        // it — best-effort. A failure here does not undo the just-committed
        // profile_id back-fill; Pass A (below, same run) or a later sweep
        // still picks up any deferred events this unblocks.
        try {
          const preapproval = await mpFetch(`/preapproval/${sub.mp_preapproval_id}`);
          await handleSubscriptionEvent(ctx, { resource: preapproval, kind: 'preapproval' });
        } catch (err) {
          summary.fetchFailures++;
        }
      }
      continue;
    }

    if (adhesion.status === 'rejected') {
      // R6: money charged to a non-member is a refund decision, never
      // automatic. Cancel the preapproval at MP, record the cancellation
      // through the SAME guarded RPC the webhook uses, then escalate any of
      // this subscription's still-pending deferrals instead of retrying them
      // forever against an applicant who was never onboarded.
      let cancelledResource;
      try {
        cancelledResource = await mpFetch(`/preapproval/${sub.mp_preapproval_id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        });
      } catch (err) {
        summary.fetchFailures++;
        continue;
      }

      await handleSubscriptionEvent(ctx, { resource: cancelledResource, kind: 'preapproval' });
      summary.cancelledAtMp++;

      // Best-effort correlation: subscription-flavoured deferrals key their
      // audit row's mp_resource_id off this preapproval id (bare or
      // ':unlinked'/':unknown' suffixed); payment-flavoured deferrals that
      // came from this same subscription store the preapproval id in
      // `detail` instead (see Pass A). mercadopago_events has no direct FK
      // to affiliate_payment_subscriptions, so both shapes are checked.
      const { data: relatedDeferrals } = await supabaseAdmin
        .from('mercadopago_events')
        .select('id')
        .eq('resolution_state', 'pending')
        .or(`mp_resource_id.eq.${sub.mp_preapproval_id},mp_resource_id.ilike.${sub.mp_preapproval_id}:%,detail.eq.${sub.mp_preapproval_id}`);

      for (const deferral of relatedDeferrals || []) {
        await supabaseAdmin.rpc('mark_mercadopago_event_resolution', {
          p_event_id: deferral.id,
          p_resolution_state: 'needs_admin',
          p_outcome: 'adhesion_rejected',
        });
        summary.needsAdmin++;
      }
      continue;
    }

    // adhesion.status is still 'pending' (or any other non-terminal value):
    // no state change here. Only reported once stale beyond 30 days, so a
    // normal in-flight signup review isn't flagged as a problem.
    const ageMs = Date.now() - new Date(adhesion.created_at).getTime();
    if (ageMs > 30 * 24 * 60 * 60 * 1000) {
      summary.stillPending++;
    }
  }
}

/**
 * Pass A (D-H, runs SECOND): re-attempts every `resolution_state='pending'`
 * `mercadopago_events` row by re-entering the SAME functions the live
 * webhook calls — never a divergent replay path (R22). Runs after Pass B so
 * a `subscription_not_linked`/`no_open_invoice` deferral just unblocked by
 * linking can resolve within this same run.
 *
 * @param {{ supabaseAdmin: any, mpFetch: (path: string, init?: any) => Promise<any> }} ctx
 * @param {{ preapprovalId?: string, limit?: number }} options
 * @param {Record<string, number>} summary
 */
async function runPassA(ctx, options, summary) {
  const { supabaseAdmin, mpFetch } = ctx;
  const limit = options.limit ?? 200;

  let query = supabaseAdmin
    .from('mercadopago_events')
    .select('*')
    .eq('resolution_state', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (options.preapprovalId) {
    // Same best-effort correlation as Pass B: a subscription-flavoured row's
    // mp_resource_id is (a suffixed variant of) the preapproval id itself; a
    // payment-flavoured row instead carries it in `detail`.
    query = query.or(`mp_resource_id.eq.${options.preapprovalId},mp_resource_id.ilike.${options.preapprovalId}:%,detail.eq.${options.preapprovalId}`);
  }

  const { data: pendingEvents, error } = await query;
  if (error || !pendingEvents) return;

  for (const row of pendingEvents) {
    let classification;
    let reasonText;
    let resolvedByRef = null;
    let isFetchFailure = false;

    try {
      if (row.event_type === 'payment') {
        // `detail` carries the preapproval id ONLY on the two outcomes that
        // came from the subscription-correlation branch of `correlateInvoice`
        // — there is nowhere else this row remembers it.
        const preapprovalHint = (row.outcome === 'subscription_not_linked' || row.outcome === 'no_open_invoice')
          ? row.detail
          : null;

        const settlement = await handlePaymentSettlement(ctx, {
          paymentId: baseResourceId(row.mp_resource_id),
          preapprovalId: preapprovalHint,
        });

        classification = classifyPaymentSettlementOutcome(settlement);
        reasonText = settlement.outcome;
        isFetchFailure = settlement.outcome === 'fetch_failed';
        if (classification === 'resolved') {
          resolvedByRef = `payment:mercadopago:${baseResourceId(row.mp_resource_id)}`;
        }
      } else {
        const kind = subscriptionKindForEventType(row.event_type);
        if (!kind) {
          classification = 'needs_admin';
          reasonText = 'unrecognized_event_type';
        } else {
          const baseId = baseResourceId(row.mp_resource_id);
          const path = kind === 'authorized_payment' ? `/authorized_payments/${baseId}` : `/preapproval/${baseId}`;
          const resource = await mpFetch(path);
          const lifecycle = await handleSubscriptionEvent(ctx, { resource, kind });
          classification = classifySubscriptionEventOutcome(lifecycle.outcome);
          reasonText = lifecycle.outcome;
          if (classification === 'resolved') resolvedByRef = `${row.event_type}:${baseId}`;
        }
      }
    } catch (err) {
      // R24: a bad MP re-fetch must not abort the whole pass — record it
      // against this row only and continue to the next one.
      classification = 'still_pending';
      reasonText = `fetch_failed:${err?.message || String(err)}`;
      isFetchFailure = true;
    }

    const nextAttemptCount = row.attempt_count + 1;
    let targetState = classification === 'resolved' ? 'resolved'
      : classification === 'needs_admin' ? 'needs_admin'
      : 'pending';
    if (targetState === 'pending' && nextAttemptCount >= RECONCILIATION_ATTEMPT_CEILING) {
      // R24: a permanently unresolvable resource escalates carrying its last
      // blocking reason, rather than retrying forever.
      targetState = 'needs_admin';
    }

    // Safe unconditionally, including for payment-topic rows whose own
    // internal audit write (inside handlePaymentSettlement, via
    // record_mercadopago_payment_audit_event) may already have moved this
    // exact row past 'pending' — mark_mercadopago_event_resolution's own
    // `WHERE resolution_state = 'pending'` guard (R19) makes the call a
    // no-op in that case. It is still the ONLY place attempt_count/
    // last_attempt_at get bumped for this sweep's own retry bookkeeping.
    await supabaseAdmin.rpc('mark_mercadopago_event_resolution', {
      p_event_id: row.id,
      p_resolution_state: targetState,
      p_outcome: reasonText,
      p_resolved_by_ref: resolvedByRef,
    });

    if (targetState === 'resolved') summary.resolved++;
    else if (targetState === 'needs_admin') summary.needsAdmin++;
    else if (isFetchFailure) summary.fetchFailures++;
    else summary.stillPending++;
  }
}

/**
 * Pass C (D-H, runs THIRD): Pass A can only re-attempt what was already
 * logged — a webhook notification MP never delivered (or gave up
 * redelivering) leaves NO `mercadopago_events` row to find. Bounded to
 * live (`status='authorized'`) subscriptions whose most recently known event
 * is stale or absent, so MP API cost is proportional to the problem, not the
 * roster.
 *
 * UNVERIFIED (not one of the two formally BLOCKING design-appendix Open
 * Questions, but in the same "assumed MP response shape" territory as OQ4/OQ5):
 * the exact shape of `GET /authorized_payments?preapproval_id={id}` has not
 * been confirmed against a real MP sandbox. Handled defensively — accepts
 * either a bare array or a `{ results: [...] }` envelope, and a single bad
 * fetch only skips that one subscription rather than aborting the pass.
 *
 * @param {{ supabaseAdmin: any, mpFetch: (path: string, init?: any) => Promise<any> }} ctx
 * @param {{ preapprovalId?: string }} options
 * @param {Record<string, number>} summary
 */
async function runPassC(ctx, options, summary) {
  const { supabaseAdmin, mpFetch } = ctx;
  const staleCutoff = new Date(Date.now() - PASS_C_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from('affiliate_payment_subscriptions')
    .select('id, profile_id, mp_preapproval_id')
    .eq('status', 'authorized')
    .not('mp_preapproval_id', 'is', null);
  if (options.preapprovalId) query = query.eq('mp_preapproval_id', options.preapprovalId);

  const { data: liveSubs, error } = await query;
  if (error || !liveSubs) return;

  for (const sub of liveSubs) {
    let isStale = true;
    if (sub.profile_id) {
      // Correlates via profile_id (the only column mercadopago_events shares
      // with a subscription row) rather than mp_preapproval_id, which the
      // events table does not store directly.
      const { data: latestEvent } = await supabaseAdmin
        .from('mercadopago_events')
        .select('created_at')
        .eq('profile_id', sub.profile_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestEvent && latestEvent.created_at >= staleCutoff) {
        isStale = false;
      }
    }
    if (!isStale) continue;

    let listResponse;
    try {
      listResponse = await mpFetch(`/authorized_payments?preapproval_id=${sub.mp_preapproval_id}`);
    } catch (err) {
      summary.fetchFailures++;
      continue;
    }
    const items = Array.isArray(listResponse) ? listResponse : (listResponse?.results || []);

    for (const item of items) {
      if (item?.id === undefined || item?.id === null || !item?.status) continue;

      const key = deriveSubscriptionEventKey(item, 'authorized_payment');
      if (!key) continue; // non-terminal (scheduled/recycling): nothing to recover yet

      const { data: existing } = await supabaseAdmin
        .from('mercadopago_events')
        .select('id')
        .eq('event_type', key.eventType)
        .eq('mp_resource_id', String(key.mpResourceId))
        .maybeSingle();
      if (existing) continue; // already known — Pass A owns its retry, not Pass C

      let resource = item;
      if (item.status === 'processed' && (item.payment?.id === undefined || item.payment?.id === null)) {
        // The list endpoint may omit the nested payment detail the
        // single-resource endpoint includes — re-fetch before settling.
        try {
          resource = await mpFetch(`/authorized_payments/${item.id}`);
        } catch (err) {
          summary.fetchFailures++;
          continue;
        }
      }

      if (resource.status === 'processed' && resource.payment?.id !== undefined && resource.payment?.id !== null) {
        // Same ordering as routeWebhookNotification's 'processed' branch:
        // ledger first, subscription second (D-C).
        await handlePaymentSettlement(ctx, {
          paymentId: String(resource.payment.id),
          preapprovalId: resource.preapproval_id ?? sub.mp_preapproval_id,
        });
      }
      await handleSubscriptionEvent(ctx, { resource, kind: 'authorized_payment' });
      summary.chargesRecovered++;
    }
  }
}

/**
 * Pass D (D-H, runs LAST, only for a GLOBAL sweep): deletes unfinalized
 * enrollment reservations (`mp_preapproval_id IS NULL AND status='pending'`)
 * older than the TTL — nothing exists at MP for them, so deletion is safe
 * (R10/R21). By definition a reservation carries no preapproval id, so this
 * pass has nothing to scope to for a single-subscription sweep call and is
 * skipped entirely when `options.preapprovalId` is set.
 *
 * @param {{ supabaseAdmin: any }} ctx
 * @param {Record<string, number>} summary
 */
async function runPassD(ctx, summary) {
  const { supabaseAdmin } = ctx;
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MINUTES * 60 * 1000).toISOString();

  const { data: staleReservations, error } = await supabaseAdmin
    .from('affiliate_payment_subscriptions')
    .select('id')
    .is('mp_preapproval_id', null)
    .eq('status', 'pending')
    .lt('created_at', cutoff);
  if (error || !staleReservations) return;

  for (const reservation of staleReservations) {
    const { data: released } = await supabaseAdmin.rpc('release_subscription_reservation', {
      p_reservation_id: reservation.id,
    });
    if (released) summary.reservationsReleased++;
  }
}

/**
 * The D-H reconciliation sweep. A plain function of `(ctx, options)` — no
 * Express/request context, so a future scheduler or Edge Function can call
 * it with zero refactor (design-appendix Interfaces). Idempotent by
 * construction: every write this function makes goes through the SAME two
 * unique-key primitives the live webhook uses (`external_ref` UNIQUE on
 * `affiliate_account_movements`, composite `(event_type, mp_resource_id)`
 * UNIQUE on `mercadopago_events`) via the SAME shared functions
 * (`handlePaymentSettlement`, `handleSubscriptionEvent`,
 * `deriveSubscriptionEventKey`) — never a divergent replay path (R19/R22).
 *
 * Passes run in a fixed order — B before A before C, D last — because that
 * order is what lets ONE run resolve a whole dependency chain (e.g. R1→R3:
 * Pass B links an orphaned subscription, then Pass A's retry of its
 * `subscription_not_linked` deferral succeeds within the same call).
 *
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient, mpFetch: (path: string, init?: any) => Promise<any> }} ctx
 * @param {{ preapprovalId?: string, limit?: number }} [options] - omitting `preapprovalId` sweeps globally; supplying it scopes every applicable pass to one subscription (used by `/api/approve-adhesion`). Pass D never runs for a scoped call (it has no preapproval id to scope to).
 * @returns {Promise<{ resolved: number, stillPending: number, needsAdmin: number, fetchFailures: number, linked: number, cancelledAtMp: number, reservationsReleased: number, chargesRecovered: number }>}
 */
export async function runDeferredReconciliation(ctx, options = {}) {
  const summary = {
    resolved: 0,
    stillPending: 0,
    needsAdmin: 0,
    fetchFailures: 0,
    linked: 0,
    cancelledAtMp: 0,
    reservationsReleased: 0,
    chargesRecovered: 0,
  };

  await runPassB(ctx, options, summary);
  await runPassA(ctx, options, summary);
  await runPassC(ctx, options, summary);
  if (!options.preapprovalId) {
    await runPassD(ctx, summary);
  }

  return summary;
}
