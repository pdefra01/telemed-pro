import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import nodemailer from 'nodemailer';
import {
  verifyWebhookSignature,
  handleSubscriptionEvent,
  routeWebhookNotification,
  runDeferredReconciliation,
  DEBITO_AUTOMATICO_DISCOUNT,
} from './server/mercadopago.js';
import { buildPatientAuthUser, sendActivationEmail } from './server/affiliateActivation.js';


const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env variables only if not in production
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(__dirname, '.env.local') });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Toggle to suspend email OTP verification without removing the feature.
// Mirrored by EMAIL_VERIFICATION_REQUIRED in src/pages/AdhesionForm.tsx — flip both together.
const EMAIL_VERIFICATION_REQUIRED = false;

/**
 * Returns an ISO 8601 timestamp for the next occurrence of the given day-of-month
 * in America/Argentina/Buenos_Aires (UTC-3, no DST).
 * If today IS the billing day, we still advance to next month so the affiliate
 * gets a full cycle before the first charge.
 * @param {number} billingDay - day of month (1-28) to charge (e.g. 10)
 * @returns {string} e.g. "2026-08-10T00:00:00.000-03:00"
 */
function nextBillingDate(billingDay) {
  const now = new Date();
  // Work in UTC-3 (Argentina, no DST)
  const offsetMs = -3 * 60 * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  let year = localNow.getUTCFullYear();
  let month = localNow.getUTCMonth(); // 0-indexed
  const today = localNow.getUTCDate();

  // Advance to next month if today >= billingDay (give the affiliate a full first cycle)
  if (today >= billingDay) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month + 1)}-${pad(billingDay)}T00:00:00.000-03:00`;
}


// Health check endpoint for Coolify
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Serve static files from Vite build
const distPath = resolve(__dirname, 'dist');
app.use(express.static(distPath));

const apiKey = process.env.LIVEKIT_API_KEY?.trim();
const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

if (!apiKey || !apiSecret) {
  console.warn("⚠️ WARNING: Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in environment. Video tokens will fail.");
}

// --- Supabase Admin Client (uses service role key, NEVER exposed to frontend) ---
// VITE_SUPABASE_URL is a Docker build arg and not available at runtime.
// The project URL is not sensitive so we use it directly.
const supabaseUrl = process.env.SUPABASE_URL || 'https://fevdxgmtrhvwiuulopcf.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`[Supabase] URL: ${supabaseUrl}`);
console.log(`[Supabase] Service role key present: ${!!serviceRoleKey}`);

let supabaseAdmin = null;
if (supabaseUrl && serviceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  console.log("✅ Supabase Admin client initialized.");
} else {
  console.warn("⚠️ WARNING: Missing SUPABASE_SERVICE_ROLE_KEY. Staff creation endpoint will fail.");
}

/**
 * Middleware para validar autenticación JWT de Supabase
 */
const requireAuth = async (req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      console.error('[requireAuth] Auth error:', error?.message || error);
      if (error && error.message && error.message.includes('fetch failed')) {
         return res.status(500).json({ error: 'Error de conexión con el servicio de autenticación (Backend).' });
      }
      return res.status(401).json({ error: 'Token de autenticación inválido o expirado.' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('[requireAuth] Authentication exception:', err.message);
    return res.status(401).json({ error: 'Fallo de autenticación.' });
  }
};

/**
 * Middleware para exigir rol admin. Debe usarse después de requireAuth
 * (depende de req.user).
 */
const requireAdmin = async (req, res, next) => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .single();

  const role = profile?.role || req.user.user_metadata?.role;
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
  next();
};

// ═══════════════════════════════════════════════════════════════════════
// Mercado Pago integration (sdd/mercadopago-integration, PR 3)
//
// All MP wire-format knowledge lives in ./server/mercadopago.js — this
// section holds only routing, auth (signature/JWT) and HTTP status mapping,
// per the design-appendix's File Changes note for server.js.
// ═══════════════════════════════════════════════════════════════════════

const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || '';
const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';

// D-C: missing credentials => every MP-facing endpoint self-disables (404
// for the webhook, 503 for the rest) instead of throwing at request time.
const mercadoPagoEnabled = Boolean(MERCADOPAGO_ACCESS_TOKEN && MERCADOPAGO_WEBHOOK_SECRET);
if (!mercadoPagoEnabled) {
  console.warn('⚠️ WARNING: Missing MERCADOPAGO_ACCESS_TOKEN/MERCADOPAGO_WEBHOOK_SECRET — Mercado Pago endpoints are disabled.');
}

// sdd/affiliate-credential-provisioning D1: PUBLIC_APP_URL graduates from
// "MP-only" to also being required for the affiliate activation email link.
if (!PUBLIC_APP_URL) {
  console.warn('⚠️ WARNING: Missing PUBLIC_APP_URL — activation emails will not include a working link.');
}

/**
 * Thin fetch wrapper around Mercado Pago's REST API. Matches the
 * `mpFetch: (path: string) => Promise<any>` contract `server/mercadopago.js`
 * depends on for its GET-only re-fetches; extended here with an optional
 * `init` so the endpoints below (create/cancel a preapproval, create a
 * Checkout Pro preference) can reuse the same auth-header wiring instead of
 * duplicating it per call site.
 */
async function mpFetch(path, init = {}) {
  const response = await fetch(`${MERCADOPAGO_API_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`Mercado Pago API error ${response.status}${payload?.message ? `: ${payload.message}` : ''}`);
    error.status = response.status;
    error.mpResponse = payload;
    throw error;
  }

  return payload;
}

/**
 * Resolves a plan by its requested name, falling back to the admin-marked
 * default plan when no name matches — mirrors /api/approve-adhesion's plan
 * resolution (2c) for the signup-time preapproval endpoint below, which
 * needs the plan's LIVE monthly_cost before any profile/plan_id snapshot
 * exists. Kept as its own small helper rather than refactoring
 * /api/approve-adhesion's inline (already-shipped) resolution, to keep this
 * PR's blast radius on that endpoint limited to the MP back-fill addition.
 */
async function resolvePlanByRequestedName(requestedPlanName) {
  const cleanName = (requestedPlanName || '').trim();
  if (cleanName) {
    const { data: matchedPlan } = await supabaseAdmin
      .from('plans')
      .select('id, name, monthly_cost')
      .eq('name', cleanName)
      .maybeSingle();
    if (matchedPlan) return matchedPlan;
  }
  const { data: fallbackPlan } = await supabaseAdmin
    .from('plans')
    .select('id, name, monthly_cost')
    .eq('is_default', true)
    .maybeSingle();
  return fallbackPlan || null;
}

/**
 * POST /api/webhooks/mercadopago
 * Signature-verified, session-free receiver (D-C). Mounted here — before any
 * requireAuth/requireAdmin usage in this file — because MP notifications
 * carry no Supabase user JWT. Never trusts the notification body beyond
 * `type`/`data.id`: routeWebhookNotification always re-fetches the
 * authoritative resource from MP before acting.
 */
app.post('/api/webhooks/mercadopago', async (req, res) => {
  if (!mercadoPagoEnabled) {
    return res.status(404).end();
  }

  const rawDataId = req.body?.data?.id;
  const dataId = rawDataId !== undefined && rawDataId !== null ? String(rawDataId) : null;
  const topic = req.body?.type;

  if (!dataId) {
    return res.status(400).json({ error: 'missing_data_id' });
  }

  // 401 before any DB access (D-C).
  if (!verifyWebhookSignature(req.headers, dataId, MERCADOPAGO_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  try {
    const { status, body } = await routeWebhookNotification({ supabaseAdmin, mpFetch }, { topic, dataId });
    return res.status(status).json(body);
  } catch (err) {
    console.error('[webhooks/mercadopago] Unexpected error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /api/adhesion/preapproval
 * Public, mirrors /api/adhesion/check-duplicates. Creates the MP preapproval
 * for a just-submitted débito-automático signup and records a subscription
 * row with profile_id NULL (D-F) — the profile does not exist yet at this
 * point in the flow. MP/plan-resolution failures return { ok:false } and
 * NEVER an error status the frontend would treat as fatal: Decision #5
 * requires the adhesion itself to still complete.
 */
app.post('/api/adhesion/preapproval', async (req, res) => {
  if (!mercadoPagoEnabled) {
    return res.status(503).json({ ok: false, error: 'Servicio de pagos no configurado.' });
  }

  const { adhesionRequestId } = req.body;
  if (!adhesionRequestId) {
    return res.status(400).json({ ok: false, error: 'Falta el campo adhesionRequestId.' });
  }

  try {
    // Idempotent on double-submit (R8): a prior successful call already
    // created and recorded the preapproval for this adhesion request.
    const { data: existing } = await supabaseAdmin
      .from('affiliate_payment_subscriptions')
      .select('mp_preapproval_id')
      .eq('adhesion_request_id', adhesionRequestId)
      .maybeSingle();

    if (existing?.mp_preapproval_id) {
      try {
        const preapproval = await mpFetch(`/preapproval/${existing.mp_preapproval_id}`);
        return res.status(200).json({ ok: true, initPoint: preapproval.init_point });
      } catch (err) {
        console.error('[adhesion/preapproval] Re-fetch of existing preapproval failed:', err.message);
        return res.status(200).json({ ok: false });
      }
    }

    const { data: request, error: fetchError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('titular_email, titular_dni, plan_type, preferred_billing_day')
      .eq('id', adhesionRequestId)
      .single();

    if (fetchError || !request) {
      console.error('[adhesion/preapproval] Adhesion request not found:', fetchError?.message);
      return res.status(200).json({ ok: false });
    }

    const payerEmail = request.titular_email?.trim() || `${request.titular_dni.trim()}@medinex-paciente.com`;
    const plan = await resolvePlanByRequestedName(request.plan_type);
    if (!plan) {
      console.error('[adhesion/preapproval] No plan resolved (requested or default) for adhesion', adhesionRequestId);
      return res.status(200).json({ ok: false });
    }

    const discountedMonthlyCost = Number((plan.monthly_cost * DEBITO_AUTOMATICO_DISCOUNT).toFixed(2));
    const requestedDay = Number(request.preferred_billing_day);
    const billingDay = Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= 28 ? requestedDay : 10;

    let preapproval;
    try {
      preapproval = await mpFetch('/preapproval', {
        method: 'POST',
        body: JSON.stringify({
          reason: `Medinex - ${plan.name} - Débito Automático`,
          external_reference: `adhesion:${adhesionRequestId}`,
          payer_email: payerEmail,
          back_url: `${PUBLIC_APP_URL}/`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: discountedMonthlyCost,
            currency_id: 'ARS',
            start_date: nextBillingDate(billingDay),
          },
          status: 'pending',
        }),
      });
    } catch (err) {
      console.error('[adhesion/preapproval] MP preapproval creation failed:', err.message);
      return res.status(200).json({ ok: false });
    }

    const { error: insertError } = await supabaseAdmin
      .from('affiliate_payment_subscriptions')
      .insert({
        profile_id: null,
        adhesion_request_id: adhesionRequestId,
        mp_preapproval_id: preapproval.id,
        status: 'pending',
        discounted_monthly_cost: discountedMonthlyCost,
        billing_day: billingDay,
      });

    if (insertError) {
      // Partial unique index on adhesion_request_id (R8): a concurrent call
      // already recorded a row for this same adhesion request. The MP
      // preapproval this call just created becomes an orphan at MP — Pass B
      // (PR 4) only cancels REJECTED adhesions' preapprovals, so this is
      // logged for operator visibility rather than auto-cancelled here.
      console.error('[adhesion/preapproval] Failed to record subscription row (likely concurrent duplicate):', insertError.message);
      return res.status(200).json({ ok: false });
    }

    return res.status(200).json({ ok: true, initPoint: preapproval.init_point });
  } catch (err) {
    console.error('[adhesion/preapproval] Unexpected error:', err);
    return res.status(200).json({ ok: false });
  }
});

/**
 * POST /api/payments/checkout-preference
 * requireAuth. Creates a Checkout Pro preference for the caller's OWN
 * invoice. Re-verifies ownership server-side via supabaseAdmin — never
 * trusts a client-supplied owner id (D-G/R25, titular-only).
 */
app.post('/api/payments/checkout-preference', requireAuth, async (req, res) => {
  if (!mercadoPagoEnabled) {
    return res.status(503).json({ error: 'Servicio de pagos no configurado.' });
  }

  const { invoiceId } = req.body;
  if (!invoiceId) {
    return res.status(400).json({ error: 'Falta el campo invoiceId.' });
  }

  try {
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada.' });
    }

    if (invoice.entity_type !== 'affiliate' || String(invoice.entity_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'No autorizado para pagar esta factura.' });
    }

    if (invoice.status !== 'issued') {
      return res.status(409).json({ error: `La factura no está en estado pagable (estado actual: ${invoice.status}).` });
    }

    const preference = await mpFetch('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          title: `Medinex - Cuota ${invoice.period}`,
          quantity: 1,
          unit_price: Number(invoice.total_amount),
          currency_id: 'ARS',
        }],
        // D-C's invoice-correlation contract: entity comes from the re-read
        // invoice row, this reference string is only ever a cross-check.
        external_reference: `affiliate:${invoice.entity_id}:invoice:${invoice.id}`,
        payer: { email: req.user.email },
        back_urls: {
          success: `${PUBLIC_APP_URL}/`,
          pending: `${PUBLIC_APP_URL}/`,
          failure: `${PUBLIC_APP_URL}/`,
        },
        auto_return: 'approved',
      }),
    });

    return res.status(200).json({ initPoint: preference.init_point });
  } catch (err) {
    console.error('[payments/checkout-preference] Error:', err.message);
    return res.status(500).json({ error: 'Error al generar el link de pago.' });
  }
});

/**
 * Creates the MP preapproval for an already-reserved enrollment slot
 * (D-F "reserved" branch) and finalizes it. Shared by both the fresh
 * reservation path and the stale_pending re-claim path in
 * POST /api/payments/subscribe below.
 */
async function createAndFinalizeSubscription(req, res, reservationId) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('plan_id, email')
    .eq('id', req.user.id)
    .maybeSingle();

  if (profileError || !profile?.plan_id) {
    await supabaseAdmin.rpc('release_subscription_reservation', { p_reservation_id: reservationId });
    return res.status(400).json({ ok: false, error: 'El afiliado no tiene un plan asignado.' });
  }

  const { data: plan, error: planError } = await supabaseAdmin
    .from('plans')
    .select('name, monthly_cost')
    .eq('id', profile.plan_id)
    .maybeSingle();

  if (planError || !plan) {
    await supabaseAdmin.rpc('release_subscription_reservation', { p_reservation_id: reservationId });
    return res.status(400).json({ ok: false, error: 'No se pudo resolver el plan del afiliado.' });
  }

  const discountedMonthlyCost = Number((plan.monthly_cost * DEBITO_AUTOMATICO_DISCOUNT).toFixed(2));

  let preapproval;
  try {
    preapproval = await mpFetch('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `Medinex - ${plan.name} - Débito Automático`,
        external_reference: `affiliate:${req.user.id}`,
        payer_email: profile.email || req.user.email,
        back_url: `${PUBLIC_APP_URL}/`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: discountedMonthlyCost,
          currency_id: 'ARS',
          start_date: nextBillingDate(10),
        },
        status: 'pending',
      }),
    });
  } catch (err) {
    console.error('[payments/subscribe] MP preapproval creation failed:', err.message);
    await supabaseAdmin.rpc('release_subscription_reservation', { p_reservation_id: reservationId });
    return res.status(502).json({ ok: false, error: 'No se pudo crear la suscripción en Mercado Pago.' });
  }

  const { data: finalizeResult, error: finalizeError } = await supabaseAdmin.rpc('finalize_subscription_enrollment', {
    p_reservation_id: reservationId,
    p_mp_preapproval_id: String(preapproval.id),
    p_discounted_monthly_cost: discountedMonthlyCost,
  });

  if (finalizeError) {
    // Judgment Day Round 1: a transient failure of the finalize RPC call
    // itself (network blip, DB timeout) still leaves a real, live MP
    // preapproval created above with mp_preapproval_id never written to any
    // row. Compensate exactly like the reservation_missing branch below:
    // cancel the orphaned preapproval and release the reservation so it
    // isn't left stuck in its pre-finalize state.
    console.error('[payments/subscribe] finalize_subscription_enrollment RPC call failed:', finalizeError.message);
    try {
      await mpFetch(`/preapproval/${preapproval.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      });
    } catch (err) {
      console.error('[payments/subscribe] Failed to cancel orphaned preapproval after finalizeError:', err.message);
    }
    await supabaseAdmin.rpc('release_subscription_reservation', { p_reservation_id: reservationId });
    return res.status(502).json({ ok: false, error: 'No se pudo finalizar la suscripción en Mercado Pago.' });
  }

  if (finalizeResult === 'reservation_missing') {
    // R21: the reservation was garbage-collected (sweep Pass D, PR 4) before
    // this call arrived. Cancel the just-created preapproval and fail
    // closed — never insert a replacement row.
    try {
      await mpFetch(`/preapproval/${preapproval.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      });
    } catch (err) {
      console.error('[payments/subscribe] Failed to cancel orphaned preapproval after reservation_missing:', err.message);
    }
    return res.status(409).json({ ok: false, reason: 'reservation_missing' });
  }

  return res.status(200).json({ ok: true, initPoint: preapproval.init_point });
}

/**
 * POST /api/payments/subscribe
 * requireAuth. D-F's re-enrollment flow: reserve-before-any-MP-call via
 * claim_subscription_enrollment, so two concurrent calls can never both
 * create a live preapproval for the same affiliate (R8/R9).
 */
app.post('/api/payments/subscribe', requireAuth, async (req, res) => {
  if (!mercadoPagoEnabled) {
    return res.status(503).json({ ok: false, error: 'Servicio de pagos no configurado.' });
  }

  try {
    const { data: claim, error: claimError } = await supabaseAdmin.rpc('claim_subscription_enrollment', {
      p_profile_id: req.user.id,
    });
    if (claimError) throw claimError;

    if (claim.claim === 'already_live') {
      return res.status(409).json({
        ok: false,
        reason: 'already_subscribed',
        status: claim.existing_status,
        mpPreapprovalId: claim.existing_mp_id,
      });
    }

    if (claim.claim === 'stale_pending') {
      // R11: cancel the abandoned preapproval at MP FIRST; fail closed if
      // that cancel fails — never create a second preapproval beside one
      // that can still activate.
      // UNVERIFIED (design-appendix Open Question 6): assumes MP accepts
      // PUT /preapproval/{id} { status: 'cancelled' } from a never-authorized
      // ('pending') preapproval. If MP rejects that transition, this branch
      // always 409s and re-enrollment stays blocked until the abandoned
      // authorization expires on MP's own side.
      let cancelledResource;
      try {
        cancelledResource = await mpFetch(`/preapproval/${claim.existing_mp_id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        });
      } catch (err) {
        console.error('[payments/subscribe] Failed to cancel stale preapproval at MP:', err.message);
        return res.status(409).json({ ok: false, reason: 'stale_pending_cancel_failed' });
      }

      // Records the cancellation through the SAME guarded RPC the webhook
      // uses (never a raw UPDATE), per D-F.
      await handleSubscriptionEvent({ supabaseAdmin }, { resource: cancelledResource, kind: 'preapproval' });

      const { data: reclaim, error: reclaimError } = await supabaseAdmin.rpc('claim_subscription_enrollment', {
        p_profile_id: req.user.id,
      });
      if (reclaimError) throw reclaimError;

      if (reclaim.claim !== 'reserved') {
        // Still not reservable (e.g. it re-activated at MP right before our
        // cancel landed) — fail closed rather than risk a double preapproval.
        return res.status(409).json({ ok: false, reason: 'stale_pending_reclaim_failed' });
      }

      return await createAndFinalizeSubscription(req, res, reclaim.reservation_id);
    }

    // 'reserved'
    return await createAndFinalizeSubscription(req, res, claim.reservation_id);
  } catch (err) {
    console.error('[payments/subscribe] Unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/payments/reconcile-deferred
 * requireAuth, requireAdmin. HTTP surface for the D-H reconciliation sweep
 * (design-appendix). Must be server-side (never mirror `runMonthlyBillingCycle`'s
 * browser-side shape): it needs both the MP access token and the
 * service-role RPCs `runDeferredReconciliation` calls internally, neither of
 * which may reach the browser. `server.js` holds only auth/routing here —
 * every pass lives in `server/mercadopago.js`, unchanged, so a future
 * scheduler or Edge Function can call the same function directly.
 */
app.post('/api/payments/reconcile-deferred', requireAuth, requireAdmin, async (req, res) => {
  if (!mercadoPagoEnabled) {
    return res.status(503).json({ error: 'Servicio de pagos no configurado.' });
  }

  try {
    const summary = await runDeferredReconciliation({ supabaseAdmin, mpFetch });
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[payments/reconcile-deferred] Unexpected error:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Rechazar métodos distintos a POST explícitamente
app.all('/api/livekit-token', (req, res, next) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  next();
});


const APPOINTMENT_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post('/api/livekit-token', async (req, res) => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId is required' });
    }

    if (!APPOINTMENT_ID_REGEX.test(appointmentId)) {
      return res.status(400).json({ error: 'Invalid appointmentId format' });
    }

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'LiveKit server configuration is incomplete' });
    }

    const participantName = `User-${Math.floor(Math.random() * 1000)}`;
    const roomName = `room-${appointmentId}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
    });

    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();

    res.json({ token, roomName });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/create-staff
 * Crea un nuevo usuario de staff (médico o admin) en Supabase Auth.
 * El trigger handle_new_user crea automáticamente el perfil en public.profiles.
 * 
 * Body: { email, password, full_name, role, specialty? }
 */
app.post('/api/create-staff', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email, password, full_name, role, specialty } = req.body;

  // Validaciones básicas
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Campos requeridos: email, password, full_name, role.' });
  }

  if (!['doctor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Debe ser "doctor" o "admin".' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const metadata = { full_name, role };
    if (specialty) metadata.specialty = specialty;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirma el email para que el médico pueda ingresar de inmediato
      user_metadata: metadata,
    });

    if (error) {
      console.error('[create-staff] Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[create-staff] Usuario ${role} creado: ${email} (${data.user.id})`);
    res.status(201).json({ id: data.user.id, email: data.user.email });
  } catch (err) {
    console.error('[create-staff] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/create-patient
 * Crea un nuevo usuario paciente en Supabase Auth.
 * Si el email no se proporciona, autogenera uno basado en el DNI ([DNI]@medinex-paciente.com).
 * El trigger handle_new_user crea automáticamente el perfil en public.profiles.
 */
app.post('/api/create-patient', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email, password, full_name, dni, phone, address } = req.body;

  if (!full_name || !dni || !password) {
    return res.status(400).json({ error: 'Campos requeridos: full_name, dni, password.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const targetEmail = email || `${dni.trim()}@medinex-paciente.com`;
    
    const metadata = { 
      full_name, 
      role: 'patient',
      dni: dni.trim(),
      is_active: true
    };
    if (phone) metadata.phone = phone;
    if (address) metadata.address = address;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      console.error('[create-patient] Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[create-patient] Paciente creado: ${targetEmail} (${data.user.id})`);
    res.status(201).json({ id: data.user.id, email: data.user.email, dni: dni.trim() });
  } catch (err) {
    console.error('[create-patient] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/create-patient-bulk
 * Crea múltiples pacientes en Supabase Auth a partir de un array de JSON.
 * Procesa en lotes secuenciales de a 5 para evitar rate limits de la API de autenticación.
 */
app.post('/api/create-patient-bulk', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const patients = req.body;

  if (!Array.isArray(patients)) {
    return res.status(400).json({ error: 'El cuerpo de la petición debe ser un array de pacientes.' });
  }

  console.log(`[create-patient-bulk] Iniciando importación masiva de ${patients.length} pacientes...`);

  const results = {
    summary: { total: patients.length, success: 0, failed: 0 },
    successful: [],
    failures: []
  };

  const createSinglePatient = async (patient, index) => {
    const { name, email, dni, phone, address, password } = patient;

    if (!name || !dni) {
      results.failures.push({
        index,
        dni: dni || 'S/D',
        name: name || 'S/N',
        error: 'Campos obligatorios faltantes: name o dni.'
      });
      results.summary.failed++;
      return;
    }

    const targetPassword = password || dni.trim();
    if (targetPassword.length < 6) {
      results.failures.push({
        index,
        dni: dni.trim(),
        name,
        error: 'La contraseña (o DNI fallback) debe tener al menos 6 caracteres.'
      });
      results.summary.failed++;
      return;
    }

    const targetEmail = email || `${dni.trim()}@medinex-paciente.com`;

    try {
      const metadata = {
        full_name: name,
        role: 'patient',
        dni: dni.trim(),
        is_active: true
      };
      if (phone) metadata.phone = phone;
      if (address) metadata.address = address;

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        password: targetPassword,
        email_confirm: true,
        user_metadata: metadata
      });

      if (error) {
        results.failures.push({
          index,
          dni: dni.trim(),
          name,
          error: error.message
        });
        results.summary.failed++;
      } else {
        results.successful.push({
          dni: dni.trim(),
          id: data.user.id
        });
        results.summary.success++;
      }
    } catch (err) {
      results.failures.push({
        index,
        dni: dni.trim(),
        name,
        error: err.message || 'Error inesperado.'
      });
      results.summary.failed++;
    }
  };

  try {
    const batchSize = 5;
    for (let i = 0; i < patients.length; i += batchSize) {
      const batch = patients.slice(i, i + batchSize);
      await Promise.all(batch.map((p, idx) => createSinglePatient(p, i + idx)));
    }

    console.log(`[create-patient-bulk] Importación finalizada. Éxito: ${results.summary.success}, Fallidos: ${results.summary.failed}`);
    res.status(207).json(results);
  } catch (err) {
    console.error('[create-patient-bulk] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor al procesar el lote.' });
  }
});

/**
 * POST /api/reset-user-password
 * Restablece la contraseña de cualquier usuario (médico o paciente) en Supabase Auth de forma administrativa.
 */
app.post('/api/reset-user-password', requireAuth, requireAdmin, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'Campos requeridos: userId, newPassword.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) {
      console.error('[reset-user-password] Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[reset-user-password] Contraseña restablecida exitosamente para usuario ID: ${userId}`);
    res.status(200).json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error('[reset-user-password] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/update-user-email
 * Actualiza el email de acceso (Supabase Auth) de cualquier usuario de forma
 * administrativa. Debe llamarse junto con la actualización de profiles.email
 * — editar solo profiles.email deja al usuario sin poder loguearse con el
 * nuevo email, porque Auth nunca se entera del cambio.
 */
app.post('/api/update-user-email', requireAuth, requireAdmin, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { userId, newEmail } = req.body;

  if (!userId || !newEmail) {
    return res.status(400).json({ error: 'Campos requeridos: userId, newEmail.' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail, email_confirm: true }
    );

    if (error) {
      console.error('[update-user-email] Supabase error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[update-user-email] Email actualizado exitosamente para usuario ID: ${userId}`);
    res.status(200).json({ message: 'Email actualizado exitosamente' });
  } catch (err) {
    console.error('[update-user-email] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * Build a Nodemailer transporter.
 * Priority:
 *   1. SMTP_HOST env vars (production corporate account)
 *   2. Ethereal fake SMTP (automatic dev fallback — preview URL logged to console)
 */
async function createMailTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true = TLS 465, false = STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // Dev fallback: Ethereal (generates a free disposable inbox)
  const testAccount = await nodemailer.createTestAccount();
  console.log('[Mailer] Using Ethereal test account:', testAccount.user);
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
}

const FROM_ADDRESS = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@medinex.com';

/**
 * POST /api/email-verification/send
 * Genera un código OTP para el correo del pre-afiliado
 */
app.post('/api/email-verification/send', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'El campo email es requerido.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const { error } = await supabaseAdmin
      .from('contact_verifications')
      .insert({
        channel: 'email',
        contact_value: cleanEmail,
        otp_code: otpCode,
        attempts: 0,
        // TEMPORAL: ventana extendida a 24hs durante pruebas pre-lanzamiento. Volver a 15 min antes de ir a producción real.
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

    if (error) {
      console.error('[email-verification/send] Error inserting verification:', error.message);
      return res.status(500).json({ error: `Fallo al generar el código: ${error.message}` });
    }

    // Send OTP via email using Nodemailer
    try {
      const transporter = await createMailTransporter();
      const info = await transporter.sendMail({
        from: `"Medinex" <${FROM_ADDRESS}>`,
        to: cleanEmail,
        subject: 'Tu código de verificación — Medinex',
        text: `Tu código de verificación es: ${otpCode}\n\nVálido por 24 horas. Si no solicitaste este código, ignorá este mensaje.`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #10b981, #0d9488); padding: 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; letter-spacing: 0.05em;">MED<span style="color: #fff;">IN</span>EX</h1>
              <p style="margin: 4px 0 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.8;">Salud Digital</p>
            </div>
            <div style="padding: 40px 32px;">
              <h2 style="margin: 0 0 8px; font-size: 20px; color: #f1f5f9;">Verificación de correo electrónico</h2>
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Ingresá el siguiente código en el formulario de adhesión para verificar tu correo.</p>
              <div style="margin: 32px 0; text-align: center; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px;">
                <span style="font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #10b981; font-family: monospace;">${otpCode}</span>
              </div>
              <p style="color: #64748b; font-size: 12px; text-align: center;">Este código vence en <strong>24 horas</strong>. Si no solicitaste este código, ignorá este mensaje.</p>
            </div>
            <div style="border-top: 1px solid #1e293b; padding: 16px 32px; text-align: center;">
              <p style="color: #475569; font-size: 11px; margin: 0;">Medinex &mdash; Plataforma de Salud Digital</p>
            </div>
          </div>
        `,
      });

      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[Mailer][DEV] Preview OTP email: ${previewUrl}`);
      } else {
        console.log(`[Mailer] OTP enviado a ${cleanEmail} via SMTP.`);
      }
    } catch (mailErr) {
      console.error('[email-verification/send] Fallo al enviar email:', mailErr.message);
      // OTP ya insertado en DB — loguear código en dev para no bloquear el flujo
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Mailer][DEV FALLBACK] OTP para ${cleanEmail}: ${otpCode}`);
      } else {
        // En producción, eliminar el OTP si no pudo enviarse
        await supabaseAdmin.from('contact_verifications').delete().eq('contact_value', cleanEmail).is('verified_at', null);
        return res.status(500).json({ error: 'No se pudo enviar el código. Intentá nuevamente.' });
      }
    }

    res.status(200).json({ success: true, message: 'Código enviado exitosamente.' });
  } catch (err) {
    console.error('[email-verification/send] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno al generar código OTP.' });
  }
});


/**
 * POST /api/email-verification/verify
 * Valida el código OTP enviado al correo del pre-afiliado
 */
app.post('/api/email-verification/verify', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Faltan los campos email y code.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  try {
    // Buscar desafío activo más reciente
    const { data: challenges, error } = await supabaseAdmin
      .from('contact_verifications')
      .select('*')
      .eq('contact_value', cleanEmail)
      .eq('channel', 'email')
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !challenges || challenges.length === 0) {
      return res.status(400).json({ error: 'El código ha expirado o no existe. Solicitá uno nuevo.' });
    }

    const challenge = challenges[0];

    if (challenge.attempts >= 5) {
      return res.status(400).json({ error: 'Superaste el número máximo de intentos. Solicitá un nuevo código.' });
    }

    if (challenge.otp_code === cleanCode) {
      // Marcar desafío como verificado
      await supabaseAdmin
        .from('contact_verifications')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', challenge.id);

      res.status(200).json({ success: true, message: 'Correo verificado con éxito.' });
    } else {
      // Incrementar intentos fallidos
      await supabaseAdmin
        .from('contact_verifications')
        .update({ attempts: challenge.attempts + 1 })
        .eq('id', challenge.id);

      res.status(400).json({ error: 'Código incorrecto.' });
    }
  } catch (err) {
    console.error('[email-verification/verify] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno al validar código OTP.' });
  }
});

/**
 * Normaliza un identificador (DNI o CUIL) a su forma canónica: solo dígitos.
 * Compartido entre el endpoint de duplicados y la aprobación de adhesión.
 * NULL/undefined normalizan a cadena vacía — nunca deben "matchear" entre sí.
 */
function normalize(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Arma el mensaje de rechazo correspondiente a un identificador (dni|cuil)
 * y a la razón de la coincidencia (affiliate|family_member|pending_request).
 * Función pura — sin efectos secundarios, fácil de testear en aislamiento.
 */
function buildConflictMessage(identifier, reason) {
  const label = identifier === 'cuil' ? 'CUIL' : 'DNI';
  if (reason === 'affiliate') return `Este ${label} ya se encuentra afiliado a Medinex.`;
  if (reason === 'family_member') return `Este ${label} ya está registrado como integrante de otro grupo familiar.`;
  if (reason === 'pending_request') return `Ya existe una solicitud pendiente con este ${label}.`;
  return `Este ${label} ya se encuentra registrado.`;
}

/**
 * POST /api/adhesion/check-duplicates
 * Valida, antes del insert público, que el DNI y el CUIL del titular y de
 * cada familiar (hasta 4) no colisionen con afiliados activos (profiles),
 * integrantes de otro grupo familiar (family_members), o solicitudes
 * pendientes existentes (adhesion_requests con status='pending'). DNI y CUIL
 * se evalúan de forma independiente — basta una sola coincidencia. Las
 * solicitudes rechazadas ('rejected') nunca bloquean. Los identificadores sin
 * valor (NULL/'') nunca "matchean" entre sí.
 */
app.post('/api/adhesion/check-duplicates', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { titularDni, titularCuil, family } = req.body;
  if (!titularDni) {
    return res.status(400).json({ error: 'Falta el DNI del titular.' });
  }

  const familyList = Array.isArray(family) ? family.slice(0, 4) : [];

  // Personas a validar: titular + familiares. Cada una guarda su valor crudo
  // (para el mensaje) y su valor normalizado (para comparar).
  const people = [
    { person: 'titular', name: null, rawDni: titularDni, rawCuil: titularCuil, dni: normalize(titularDni), cuil: normalize(titularCuil) },
    ...familyList.map(f => ({
      person: 'family',
      name: f?.name || null,
      rawDni: f?.dni,
      rawCuil: f?.cuil,
      dni: normalize(f?.dni),
      cuil: normalize(f?.cuil)
    }))
  ];

  const dniSet = [...new Set(people.map(p => p.dni).filter(Boolean))];
  const cuilSet = [...new Set(people.map(p => p.cuil).filter(Boolean))];

  // Compara una fila existente (con dni/cuil normalizables) contra cada
  // persona de la solicitud entrante y agrega un conflicto por cada
  // identificador coincidente.
  const conflicts = [];
  function collectConflicts(row, reason) {
    const rowDni = normalize(row.dni);
    const rowCuil = normalize(row.cuil);
    for (const p of people) {
      if (rowDni && p.dni && rowDni === p.dni) {
        conflicts.push({ identifier: 'dni', value: p.rawDni, person: p.person, name: p.name, reason, message: buildConflictMessage('dni', reason) });
      }
      if (rowCuil && p.cuil && rowCuil === p.cuil) {
        conflicts.push({ identifier: 'cuil', value: p.rawCuil, person: p.person, name: p.name, reason, message: buildConflictMessage('cuil', reason) });
      }
    }
  }

  try {
    if (dniSet.length > 0 || cuilSet.length > 0) {
      // Traemos todas las filas con DNI o CUIL cargado y comparamos
      // normalizado en JS (via collectConflicts), en vez de filtrar con
      // dni.in()/cuil.in() por valor exacto: los identificadores existentes
      // pueden estar guardados con separadores (p. ej. CUIL "20-30111222-3"),
      // y un filtro .in() de PostgREST hace match de string exacto contra la
      // columna cruda, por lo que NUNCA encontraría esa fila comparándola con
      // el valor normalizado "20301112223" — rompiendo el requisito de
      // normalización del spec. Las tablas son chicas pre-lanzamiento (ver
      // design.md), así que traer todo y comparar en JS es seguro.

      // 1. Afiliados activos
      const { data: profileMatches, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('id,dni,cuil')
        .or('dni.not.is.null,cuil.not.is.null');
      if (profileErr) throw profileErr;
      for (const row of profileMatches || []) collectConflicts(row, 'affiliate');

      // 2. Integrantes de otro grupo familiar
      const { data: familyMatches, error: familyErr } = await supabaseAdmin
        .from('family_members')
        .select('id,dni,cuil,full_name')
        .or('dni.not.is.null,cuil.not.is.null');
      if (familyErr) throw familyErr;
      for (const row of familyMatches || []) collectConflicts(row, 'family_member');

      // 3. Solicitudes pendientes
      const { data: pendingMatches, error: pendingErr } = await supabaseAdmin
        .from('adhesion_requests')
        .select('id,titular_dni,titular_cuil')
        .eq('status', 'pending');
      if (pendingErr) throw pendingErr;
      for (const row of pendingMatches || []) {
        collectConflicts({ dni: row.titular_dni, cuil: row.titular_cuil }, 'pending_request');
      }
    }

    if (conflicts.length > 0) {
      return res.status(409).json({ ok: false, conflicts });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[adhesion/check-duplicates] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno al validar duplicados.' });
  }
});

/**
 * POST /api/approve-adhesion
 * Aprueba una solicitud de adhesión. Crea el usuario paciente en Supabase Auth,
 * inicializa su perfil, crea su grupo familiar (si tiene) e integrantes,
 * y marca la solicitud como 'approved'.
 */
app.post('/api/approve-adhesion', requireAuth, requireAdmin, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Servicio de administración no configurado.' });
  }

  const { adhesionId } = req.body;
  if (!adhesionId) {
    return res.status(400).json({ error: 'Falta el campo adhesionId.' });
  }

  try {
    // 1. Obtener la solicitud
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*')
      .eq('id', adhesionId)
      .single();

    if (fetchError || !request) {
      console.error('[approve-adhesion] Error fetching application:', fetchError);
      return res.status(404).json({ error: 'Solicitud de adhesión no encontrada.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `La solicitud ya se encuentra en estado: ${request.status}` });
    }

    // Validar que el email de la solicitud esté verificado
    if (EMAIL_VERIFICATION_REQUIRED && !request.email_verified) {
      return res.status(400).json({ error: 'No se puede aprobar una solicitud que no tiene el correo electrónico verificado.' });
    }

    // 2. Crear usuario paciente en Supabase Auth. No password is set here —
    // the account is activated via a best-effort recovery-link email sent
    // below (step 5b), never a DNI-derived password (spec "No Plaintext-DNI
    // Password On Approval").
    const authUserPayload = buildPatientAuthUser(request);
    const targetEmail = authUserPayload.email;
    const titularFullName = `${request.titular_first_name || ''} ${request.titular_last_name || ''}`.trim() || request.titular_name;

    console.log(`[approve-adhesion] Creando usuario auth para: ${targetEmail}`);
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser(authUserPayload);

    if (authError) {
      console.error('[approve-adhesion] Auth creation failed:', authError.message);
      return res.status(400).json({ error: `Error en autenticación: ${authError.message}` });
    }

    const userId = authData.user.id;

    // 2b. Resolver promoter_id (código de texto, ej. "LANDING") al UUID real
    // del productor, para poblar profiles.producer_id — sin esto, "Afiliados
    // Traídos" en Asesores Comerciales queda siempre en 0 aunque la solicitud
    // tenga el código bien guardado.
    let resolvedProducerId = null;
    if (request.promoter_id && request.promoter_id.trim() !== '') {
      const { data: producer } = await supabaseAdmin
        .from('producers')
        .select('id')
        .eq('producer_code', request.promoter_id.trim().toUpperCase())
        .maybeSingle();
      resolvedProducerId = producer?.id || null;
    }

    // 2c. Resolver plan_id real a partir del nombre de plan enviado en la solicitud
    // (request.plan_type). Nunca escribimos plan_name directo — el trigger
    // sync_profile_plan_name_trigger lo sincroniza automáticamente a partir de plan_id.
    const requestedPlanName = (request.plan_type || '').trim();
    let resolvedPlanId = null;
    if (requestedPlanName) {
      const { data: matchedPlan } = await supabaseAdmin
        .from('plans')
        .select('id')
        .eq('name', requestedPlanName)
        .maybeSingle();
      resolvedPlanId = matchedPlan?.id || null;
    }
    if (!resolvedPlanId) {
      // El plan_type solicitado no coincide con ningún plan real (typo, dato
      // legado, etc.) — en vez de dejar plan_id null en silencio, caemos al
      // plan marcado is_default por un admin (sin nombres hardcodeados).
      const { data: fallbackPlan } = await supabaseAdmin
        .from('plans')
        .select('id, name')
        .eq('is_default', true)
        .maybeSingle();
      resolvedPlanId = fallbackPlan?.id || null;
      if (resolvedPlanId) {
        console.warn(`[approve-adhesion] plan_type "${request.plan_type}" no coincide con ningún plan real; usando el plan por defecto "${fallbackPlan.name}".`);
      } else {
        console.error(`[approve-adhesion] No se encontró ni el plan solicitado ("${request.plan_type}") ni ningún plan marcado como default. plan_id quedará sin asignar.`);
      }
    }

    // 3. Actualizar perfil del Paciente en public.profiles (que se autogeneró por trigger)
    console.log(`[approve-adhesion] Actualizando perfil del titular: ${userId}`);
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: request.titular_first_name || split_part(request.titular_name, ' ', 1),
        last_name: request.titular_last_name || substring(request.titular_name, ' ', 2),
        email: targetEmail,
        dni: request.titular_dni.trim(),
        cuil: request.titular_cuil?.trim() || null,
        phone: request.titular_phone,
        address: request.titular_address,
        province: request.titular_province || null,
        city: request.titular_city || null,
        locality: request.titular_locality,
        neighborhood: request.titular_neighborhood,
        birth_date: request.titular_birth_date,
        plan_id: resolvedPlanId,
        plan_status: 'active',
        // `profiles.payment_status` is DEPRECATED (write-stopped since
        // cuenta-corriente-billing PR1) — it's now derived read-only from the
        // receivables ledger (`affiliate_payment_status` view), never written
        // directly by onboarding or any other app-layer path.
        is_active: true,
        producer_id: resolvedProducerId
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[approve-adhesion] Profile update failed:', profileError.message);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: `Error al crear el perfil: ${profileError.message}` });
    }

    // 4. Crear grupo familiar si la solicitud contiene integrantes
    const familyMembersList = Array.isArray(request.family_members) ? request.family_members : [];
    if (familyMembersList.length > 0) {
      console.log(`[approve-adhesion] Procesando grupo familiar (${familyMembersList.length} miembros)...`);
      
      const { data: famGroup, error: famGroupError } = await supabaseAdmin
        .from('family_groups')
        .insert({
          primary_affiliate_id: userId,
          name: `Familia de ${titularFullName}`
        })
        .select()
        .single();

      if (famGroupError) {
        console.error('[approve-adhesion] family_groups creation failed:', famGroupError.message);
      } else {
        const familyGroupId = famGroup.id;
        
        await supabaseAdmin
          .from('profiles')
          .update({ family_group_id: familyGroupId })
          .eq('id', userId);

        const insertMembers = familyMembersList.map(member => {
          let relation = 'otro';
          const relLower = (member.parentesco || '').toLowerCase();
          if (relLower.includes('conyuge') || relLower.includes('cónyuge') || relLower.includes('espos')) relation = 'cónyuge';
          else if (relLower.includes('hijo') || relLower.includes('hija')) relation = 'hijo/a';
          else if (relLower.includes('padre') || relLower.includes('madre') || relLower.includes('papá') || relLower.includes('mamá')) relation = 'padre/madre';
          else if (relLower.includes('hermano') || relLower.includes('hermana')) relation = 'hermano/a';
          
          const rawName = member.name || member.fullName || 'Familiar de Prueba';
          const fName = member.first_name || member.firstName || rawName.split(' ')[0];
          const lName = member.last_name || member.lastName || rawName.split(' ').slice(1).join(' ');

          return {
            family_group_id: familyGroupId,
            first_name: fName,
            last_name: lName,
            relation: relation,
            birth_date: member.birthDate || member.fechaNac || null,
            dni: member.dni ? String(member.dni).trim() : null,
            cuil: member.cuil ? String(member.cuil).trim() : null
          };
        });

        const { error: membersError } = await supabaseAdmin
          .from('family_members')
          .insert(insertMembers);

        if (membersError) {
          console.error('[approve-adhesion] family_members insertion failed:', membersError.message);
        }
      }
    }

    // 5. Marcar la solicitud como aprobada. approved_profile_id records the
    // link (design D-F, fact 9) — this endpoint previously recorded nothing
    // beyond status='approved', leaving any signup-time MP subscription's
    // profile_id link unrecoverable if the back-fill below failed.
    console.log(`[approve-adhesion] Marcando solicitud como aprobada...`);
    await supabaseAdmin
      .from('adhesion_requests')
      .update({ status: 'approved', approved_profile_id: userId })
      .eq('id', adhesionId);

    // 5b. Mercado Pago débito-automático link back-fill (design D-F "Link
    // back-fill at approval", steps a-d). Best-effort and NON-BLOCKING: a
    // failure here must never fail the approval itself. Pass B of the D-H
    // sweep re-drives steps (b)-(c) on any later run using
    // approved_profile_id, independent of this request completing.
    if (mercadoPagoEnabled) {
      let linkedPreapprovalId = null;
      try {
        const { data: subscription } = await supabaseAdmin
          .from('affiliate_payment_subscriptions')
          .select('id, mp_preapproval_id')
          .eq('adhesion_request_id', adhesionId)
          .is('profile_id', null)
          .maybeSingle();

        if (subscription) {
          await supabaseAdmin
            .from('affiliate_payment_subscriptions')
            .update({ profile_id: userId })
            .eq('id', subscription.id);

          if (subscription.mp_preapproval_id) {
            linkedPreapprovalId = subscription.mp_preapproval_id;
            const preapproval = await mpFetch(`/preapproval/${subscription.mp_preapproval_id}`);
            await handleSubscriptionEvent({ supabaseAdmin }, { resource: preapproval, kind: 'preapproval' });
          }
        }
      } catch (err) {
        console.error('[approve-adhesion] Mercado Pago subscription link back-fill failed (non-blocking):', err.message);
      }

      // Step (d): a scoped D-H sweep run for just this subscription — the
      // id comes from the DB row read above, NEVER from the request body.
      // Covers anything steps (a)-(c) above could not complete synchronously
      // (e.g. no invoice exists yet for this period) by replaying it through
      // the same idempotent primitives the live webhook uses. Never blocks
      // or fails the approval response itself.
      if (linkedPreapprovalId) {
        try {
          await runDeferredReconciliation({ supabaseAdmin, mpFetch }, { preapprovalId: linkedPreapprovalId });
        } catch (err) {
          console.error('[approve-adhesion] Scoped D-H sweep failed (non-blocking):', err.message);
        }
      }
    }

    // 5b(email). Best-effort activation email — own try/catch, NEVER throws
    // (mirrors notifyPaymentSettled) and never blocks the approval response.
    // Placed after the Mercado Pago block (design D3): both steps are
    // independent best-effort operations, and this keeps the payment-adjacent
    // block above byte-identical.
    let activationEmailSent = false;
    try {
      const emailResult = await sendActivationEmail(
        { supabaseAdmin, createMailTransporter, fromAddress: FROM_ADDRESS, publicAppUrl: PUBLIC_APP_URL },
        { email: targetEmail, fullName: titularFullName }
      );
      activationEmailSent = !!emailResult?.sent;
    } catch (err) {
      console.error('[approve-adhesion] Activation email failed (non-blocking):', err?.message || String(err));
    }

    console.log(`[approve-adhesion] Solicitud aprobada con éxito para titular: ${targetEmail}`);
    res.status(200).json({
      message: 'Solicitud aprobada exitosamente y paciente registrado.',
      userId,
      // Judgment Day finding: without this, a failed activation email left
      // the affiliate with a passwordless account and no visible signal to
      // any admin. Surfacing it here lets the admin UI warn immediately,
      // instead of the affiliate silently having no way to ever log in.
      activationEmailSent,
    });
  } catch (err) {
    console.error('[approve-adhesion] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * GET /api/advisor/stats
 * Devuelve indicadores de ventas y comisiones acumuladas del asesor comercial autenticado
 */
app.get('/api/advisor/stats', requireAuth, async (req, res) => {
  try {
    // 1. Obtener promoter_code del perfil
    const { data: profile, error: profError } = await supabaseAdmin
      .from('profiles')
      .select('promoter_code')
      .eq('id', req.user.id)
      .single();
    
    if (profError || !profile || !profile.promoter_code) {
      return res.status(200).json({
        totalSales: 0,
        approvedSales: 0,
        pendingSales: 0,
        commissions: 0,
        linksSharedCount: 0,
        sales: []
      });
    }

    const promoterCode = profile.promoter_code;

    // 2. Obtener solicitudes de adhesion (limitadas a las 100 más recientes para evitar cargas masivas)
    const { data: sales, error: salesError } = await supabaseAdmin
      .from('adhesion_requests')
      .select('id, titular_name, titular_dni, plan_type, status, created_at')
      .eq('promoter_id', promoterCode)
      .order('created_at', { ascending: false })
      .limit(100);

    if (salesError) throw salesError;

    // 3. Obtener totales reales sin límite (para métricas precisas)
    const { count: totalCount } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('promoter_id', promoterCode);

    const { count: approvedCount } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('promoter_id', promoterCode)
      .eq('status', 'approved');

    const { count: pendingCount } = await supabaseAdmin
      .from('adhesion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('promoter_id', promoterCode)
      .eq('status', 'pending');

    // 4. Obtener links_shared_count y commission_rate desde producers
    const { data: producer } = await supabaseAdmin
      .from('producers')
      .select('links_shared_count, commission_rate')
      .eq('id', req.user.id)
      .maybeSingle();

    const linksSharedCount = producer?.links_shared_count || 0;
    const commissionRate = producer?.commission_rate ?? 10;
    const approvedSales = approvedCount || 0;
    const commissions = approvedSales * 10000 * (commissionRate / 10); // base $10k * tasa proporcional

    res.status(200).json({
      totalSales: totalCount || 0,
      approvedSales,
      pendingSales: pendingCount || 0,
      commissions,
      linksSharedCount,
      sales: sales || []
    });
  } catch (err) {
    console.error('[advisor/stats] Error:', err);
    res.status(500).json({ error: 'Error al recuperar estadísticas de venta.' });
  }
});

/**
 * POST /api/advisor/increment-share
 * Incrementa en 1 el contador de enlaces compartidos del asesor autenticado
 */
app.post('/api/advisor/increment-share', requireAuth, async (req, res) => {
  try {
    // Role check via JWT metadata (already validated by requireAuth — no extra DB query needed)
    const role = req.user.user_metadata?.role;
    if (role !== 'advisor') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de asesor comercial.' });
    }

    // Atomic increment via direct RPC call — PostgreSQL handles the increment server-side
    const { data: newCount, error: rpcErr } = await supabaseAdmin
      .rpc('increment_links_shared', { row_id: req.user.id });

    if (rpcErr) {
      // Fallback: verify row exists, then do a safe read-then-write
      const { data: existing, error: checkErr } = await supabaseAdmin
        .from('producers')
        .select('links_shared_count')
        .eq('id', req.user.id)
        .maybeSingle();

      if (checkErr || !existing) {
        return res.status(404).json({ error: 'Ficha comercial de asesor no encontrada.' });
      }

      const { error: fallbackErr, data: fallbackData } = await supabaseAdmin
        .from('producers')
        .update({ links_shared_count: (existing.links_shared_count || 0) + 1 })
        .eq('id', req.user.id)
        .select('links_shared_count')
        .single();

      if (fallbackErr) throw fallbackErr;
      return res.status(200).json({ success: true, linksSharedCount: fallbackData.links_shared_count });
    }

    if (newCount === null || newCount === undefined) {
      return res.status(404).json({ error: 'Ficha comercial de asesor no encontrada.' });
    }

    res.status(200).json({ success: true, linksSharedCount: newCount });
  } catch (err) {
    console.error('[advisor/increment-share] Error:', err);
    res.status(500).json({ error: 'Error al registrar compartición de enlace.' });
  }
});


/**
 * GET /api/announcements
 * Lista todos los comunicados oficiales mapeando la bandera de leído/no leído
 */
app.get('/api/announcements', requireAuth, async (req, res) => {
  try {
    const { data: announcements, error: annError } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (annError) throw annError;

    const { data: reads, error: readsError } = await supabaseAdmin
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', req.user.id);

    if (readsError) throw readsError;

    const readIds = new Set((reads || []).map(r => r.announcement_id));

    const enrichedAnnouncements = announcements.map(ann => ({
      ...ann,
      read: readIds.has(ann.id)
    }));

    res.status(200).json(enrichedAnnouncements);
  } catch (err) {
    console.error('[announcements] Error:', err);
    res.status(500).json({ error: 'Error al recuperar comunicados.' });
  }
});

/**
 * POST /api/announcements/:id/read
 * Marca un comunicado como leído para el asesor autenticado
 */
app.post('/api/announcements/:id/read', requireAuth, async (req, res) => {
  const { id: announcementId } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('announcement_reads')
      .upsert(
        { announcement_id: announcementId, user_id: req.user.id },
        { onConflict: 'announcement_id,user_id' }
      );

    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[announcements/read] Error:', err);
    res.status(500).json({ error: 'Error al marcar comunicado como leído.' });
  }
});

// Alta y provisión automatizada de asesores comerciales (OCC Admin Only)
app.post('/api/create-advisor', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Servicio de autenticación no disponible temporalmente.' });
    }

    // 1. Validar rol de administrador del emisor
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    const role = profile?.role || req.user.user_metadata?.role;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }

    const { email, password, firstName, lastName, promoterCode, dni, phone, address } = req.body;

    // 2. Validaciones de campos requeridos
    if (!email || !password || !firstName || !lastName || !promoterCode || !dni || !phone || !address) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para dar de alta al asesor.' });
    }

    const cleanCode = promoterCode.trim().toUpperCase();

    // 3. Validar duplicidad de código de promotor
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('promoter_code', cleanCode)
      .maybeSingle();

    if (existingProfile) {
      return res.status(400).json({ error: `El código de promotor '${cleanCode}' ya se encuentra asignado.` });
    }

    // 4. Crear usuario en Supabase Auth
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const { data: newAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true,
      user_metadata: { role: 'advisor', full_name: fullName }
    });

    if (createUserError) {
      return res.status(400).json({ error: createUserError.message });
    }

    const newUserId = newAuthUser.user.id;

    // 5. Actualizar el perfil del asesor en `profiles`
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'advisor',
        promoter_code: cleanCode,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        dni: dni.trim(),
        phone: phone.trim(),
        address: address.trim(),
        is_active: true
      })
      .eq('id', newUserId);

    if (updateProfileError) {
      // Revertir creación de auth ante fallos
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: 'Error al actualizar el perfil de base de datos del asesor.' });
    }

    // 6. Insertar en tabla comercial `producers`
    const { error: insertProducerError } = await supabaseAdmin
      .from('producers')
      .insert({
        id: newUserId,
        name: fullName,
        producer_code: cleanCode,
        email: email.trim(),
        phone: phone.trim(),
        commission_rate: 10.00, // Comisión fija default 10%
        status: 'active',
        links_shared_count: 0
      });

    if (insertProducerError) {
      // Revertir perfil y auth para consistencia total
      await supabaseAdmin
        .from('profiles')
        .update({ 
          role: 'patient', 
          promoter_code: null,
          first_name: null,
          last_name: null,
          dni: null,
          phone: null,
          address: null
        })
        .eq('id', newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: 'Error al registrar la ficha comercial del productor.' });
    }

    res.status(201).json({ success: true, id: newUserId });
  } catch (err) {
    console.error('[create-advisor] Error inesperado:', err);
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

// Helpers de strings para mapeos robustos
function split_part(str, delim, index) {
  if (!str) return '';
  const parts = str.split(delim);
  return parts[index - 1] || '';
}

function substring(str, delim, startIndex) {
  if (!str) return '';
  const idx = str.indexOf(delim);
  if (idx === -1) return '';
  return str.substring(idx + delim.length);
}

// Catch-all middleware to serve index.html for SPA routing
// This is the most compatible way for Express 5
app.use((req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TeleMed Pro corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`📁 Sirviendo archivos estáticos desde: ${distPath}`);
  }
});