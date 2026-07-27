-- Migration: Mercado Pago as payment provider — DB foundation (PR1/5)
-- Base: sdd/mercadopago-integration design REV 6 (D-A, D-B, D-D, D-F, D-G) and
-- its appendix (composite types, Interfaces, Migration/Rollout). Design is
-- FINAL for this change — this migration implements it verbatim, it does not
-- re-litigate it.
--
-- Purely additive except one re-defined function. No shipped table shape or
-- existing RLS policy is modified, and `post_payment_movement`/
-- `post_billing_charge` are untouched. `renew_coverage_window` IS re-defined
-- here (item 4c below) — see its own section comment for why. The only
-- pre-existing table touched is `public.invoices`, which gains ONE new,
-- additive SELECT policy (D-G), plus `family_coverage_windows`, which gains
-- one new, additive column (item 4b).
--
-- Contents, in dependency order:
--   1. is_service_role()                              (D-A)
--   2. affiliate_payment_subscriptions + 3 indexes     (D-D)
--   3. mercadopago_events + 1 index                    (D-D)
--   4. adhesion_requests.approved_profile_id           (D-F, fact 9)
--   4b. family_coverage_windows.last_extended_period    (Fix 3 support column)
--   4c. renew_coverage_window (re-defined)              (resets last_extended_period)
--   5. Composite types: webhook_payment_result,
--      subscription_claim_result                       (D-B, D-F / appendix Interfaces)
--   6. post_payment_movement_from_webhook              (D-A/D-B)
--   7. record_mercadopago_subscription_event           (D-D)
--   8. mark_mercadopago_event_resolution               (D-H, R19)
--   9. claim_subscription_enrollment /
--      finalize_subscription_enrollment /
--      release_subscription_reservation                (D-F, R8-R11/R21)
--  10. RLS policies (5)                                (D-D, D-G)
--  11. GRANT / REVOKE                                   (D-A..D-F, D-G)
--
-- Rollback: reverse-order drop of the above list (policies -> function
-- grants/functions -> indexes/constraints -> tables -> types -> the
-- adhesion_requests column) leaves post_billing_charge, post_payment_movement
-- and reconcileInvoice exactly as shipped, and degrades `invoices` back to
-- admin-only reads. It does NOT, by itself, restore renew_coverage_window or
-- family_coverage_windows to their pre-migration shape: because this
-- migration's CREATE OR REPLACE (4c) references last_extended_period (4b),
-- a full rollback MUST (a) revert `renew_coverage_window` to its original
-- definition as committed in `20260722010000_receivables_ledger.sql`, and
-- only THEN (b) DROP the `family_coverage_windows.last_extended_period`
-- column — in that exact order. Dropping the column first while this
-- migration's re-defined function (4c) is still installed would break it,
-- since it still references the now-dropped column until step (a) replaces
-- it with the original, column-free definition.

-- ── 1. is_service_role() ───────────────────────────────────────────────────
-- Reads the PostgREST GUC directly rather than auth.role(), which appears
-- NOWHERE in this repo's migrations. This is the ONLY authorization gate for
-- the webhook path — no authenticated end-user/admin Supabase session exists
-- when Mercado Pago calls back (D-A).
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         = 'service_role';
$$;

COMMENT ON FUNCTION public.is_service_role IS 'Service-role-only authorization gate for the Mercado Pago webhook RPCs. Reads the PostgREST request.jwt.claims GUC directly (no auth.role() helper exists in this repo). Distinct from is_admin(), which requires an authenticated end-user session and cannot ever be true for the webhook (no Supabase user JWT is presented).';

-- ── 2. affiliate_payment_subscriptions ─────────────────────────────────────
-- One-way lifecycle (Resolved Decision #7): pending -> authorized -> cancelled
-- (terminal); authorized <-> payment_failed the only permitted oscillation.
-- profile_id is deliberately NOT unique: reactivation after cancellation
-- creates a NEW row (a new mp_preapproval_id), never an in-place resurrect.
CREATE TABLE public.affiliate_payment_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id               UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  adhesion_request_id      UUID NULL,
  mp_preapproval_id        TEXT NULL, -- NULL only while an enrollment is reserved (D-F)
  status                   TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'payment_failed', 'cancelled')),
  status_changed_at        TIMESTAMPTZ NULL,
  discounted_monthly_cost  NUMERIC(12,2) NULL,
  discount_through_period  TEXT NULL, -- 'YYYY-MM'
  last_failure_at          TIMESTAMPTZ NULL,
  failure_count            INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.affiliate_payment_subscriptions IS 'MP débito-automático subscription lifecycle. One-way per mp_preapproval_id: pending -> authorized -> cancelled (terminal); authorized <-> payment_failed is the only oscillation. No paused state (Resolved Decision #7) — an MP-side pause is recorded as cancelled. profile_id is deliberately NOT unique: reactivation creates a new row, never an in-place resume.';
COMMENT ON COLUMN public.affiliate_payment_subscriptions.mp_preapproval_id IS 'NULL only while a D-F enrollment reservation is in flight (claim_subscription_enrollment reserved, not yet finalize_subscription_enrollment''d).';
COMMENT ON COLUMN public.affiliate_payment_subscriptions.failure_count IS 'Lifetime counter, incremented only on a genuinely new authorized_payment id transitioning to payment_failed — MP recycling retries reuse one id and are absorbed by the (event_type, mp_resource_id) dedup, never double-incrementing this.';

-- Partial UNIQUEs mirror the ledger's own external_ref pattern
-- (20260722010000:76-78).
CREATE UNIQUE INDEX affiliate_payment_subscriptions_mp_preapproval_id_idx
  ON public.affiliate_payment_subscriptions (mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;

CREATE UNIQUE INDEX affiliate_payment_subscriptions_adhesion_request_id_idx
  ON public.affiliate_payment_subscriptions (adhesion_request_id)
  WHERE adhesion_request_id IS NOT NULL; -- double-submitted signup is idempotent (R8)

CREATE INDEX affiliate_payment_subscriptions_profile_id_idx
  ON public.affiliate_payment_subscriptions (profile_id);

-- ── 3. mercadopago_events ───────────────────────────────────────────────────
-- Every branch of every webhook topic writes exactly one row here via
-- INSERT ... ON CONFLICT (event_type, mp_resource_id) DO NOTHING. The
-- composite key is deliberately NOT bare mp_resource_id (D-D: a resource id
-- alone is reused across genuinely different logical transitions, e.g. an
-- authorized_payment id reused across subscription_authorized_payment's
-- 'processed'/'rejected' outcomes).
CREATE TABLE public.mercadopago_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL,
  mp_resource_id    TEXT NOT NULL,
  mp_status         TEXT,
  profile_id        UUID,
  invoice_id        UUID,
  amount            NUMERIC(12,2),
  outcome           TEXT NOT NULL,
  detail            TEXT,
  resolution_state  TEXT NOT NULL DEFAULT 'final'
    CHECK (resolution_state IN ('final', 'pending', 'resolved', 'needs_admin')),
  attempt_count     INT NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ NULL,
  resolved_at       TIMESTAMPTZ NULL,
  resolved_by_ref   TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_type, mp_resource_id)
);

COMMENT ON TABLE public.mercadopago_events IS 'Audit + dedup ledger for every MP webhook notification and its outcome. UNIQUE(event_type, mp_resource_id) is the composite dedup key — deliberately not bare mp_resource_id. resolution_state drives the D-H reconciliation sweep: pending/needs_admin rows are re-attempted or escalated; final rows are never touched again.';
COMMENT ON COLUMN public.mercadopago_events.resolution_state IS 'final: settled at write time, no sweep involvement. pending: the D-H sweep will re-attempt (Pass A). resolved: the sweep successfully replayed it. needs_admin: escalated, not retried automatically (a human decision is required).';

CREATE INDEX mercadopago_events_resolution_state_created_at_idx
  ON public.mercadopago_events (resolution_state, created_at)
  WHERE resolution_state IN ('pending', 'needs_admin');

-- ── 4. adhesion_requests.approved_profile_id ────────────────────────────────
-- /api/approve-adhesion records nothing today beyond status='approved' (fact
-- 9), leaving the signup-time subscription's profile_id link unrecoverable if
-- the back-fill itself fails. This column is what makes Pass B (D-H) able to
-- re-drive the link on any later sweep run, independent of that request
-- completing.
ALTER TABLE public.adhesion_requests
  ADD COLUMN IF NOT EXISTS approved_profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.adhesion_requests.approved_profile_id IS 'Set by /api/approve-adhesion alongside status=''approved''. Lets the D-H sweep (Pass B) re-derive and back-fill affiliate_payment_subscriptions.profile_id even if the original approval request itself only partially completed.';

-- ── 4b. family_coverage_windows.last_extended_period ────────────────────────
-- A family_coverage_windows row can be SHARED across a family
-- (family_group_id). Without this column, two DIFFERENT invoices (distinct
-- family members, distinct external_refs) can each independently satisfy
-- every other per-invoice guard and BOTH extend the SAME shared window for
-- the SAME billing period. This column records the invoice-period that most
-- recently extended the window, so post_payment_movement_from_webhook can
-- refuse a second extension for a period already covered.
ALTER TABLE public.family_coverage_windows
  ADD COLUMN IF NOT EXISTS last_extended_period TEXT NULL;

COMMENT ON COLUMN public.family_coverage_windows.last_extended_period IS 'YYYY-MM of the invoice period that most recently extended this window via post_payment_movement_from_webhook. Guards a SHARED (family_group_id) window against being extended twice for the same period by two different invoices/family members.';

-- ── 4c. renew_coverage_window — reset last_extended_period on renewal ──────
-- Re-defines the function shipped in 20260722010000_receivables_ledger.sql
-- (334-457 there): last_extended_period did not exist when that function was
-- originally written, so its UPDATE never touched it. Without this reset, a
-- window renewed by an admin (period_start moved forward to now()) can still
-- carry a STALE last_extended_period from before the renewal — e.g. a family
-- window last extended for '2026-06' via the webhook, then renewed later
-- that same month. A fresh, legitimate '2026-06' payment under the renewed
-- term would then be incorrectly blocked by post_payment_movement_from_webhook's
-- period_already_extended guard ('2026-06' >= '2026-06'). Renewal must clear
-- the value so the guard only ever compares against extensions that actually
-- happened under the CURRENT term. Body is otherwise byte-for-byte identical
-- to the committed original — same is_admin() check, same balance guard,
-- same KNOWN LIMITATION comment, same signature/attributes.
CREATE OR REPLACE FUNCTION public.renew_coverage_window(p_profile_id UUID)
RETURNS public.renew_coverage_window_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile       public.profiles;
  v_plan          public.plans;
  v_window        public.family_coverage_windows;
  v_total_months  INTEGER;
  v_granted_quota INTEGER;
  v_policy        JSONB;
  v_mode          TEXT;
  v_balance       NUMERIC;
  v_result        public.renew_coverage_window_result;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Solo administradores pueden renovar la cobertura.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil % no encontrado', p_profile_id;
  END IF;

  IF v_profile.plan_id IS NULL THEN
    RAISE EXCEPTION 'El perfil % no tiene un plan asignado', p_profile_id;
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_profile.plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', v_profile.plan_id;
  END IF;

  -- Locked (4c): a concurrent webhook payment (post_payment_movement_from_webhook)
  -- takes FOR UPDATE on this same window before extending it and stamping
  -- last_extended_period. Without this lock, a renewal reading the window
  -- unlocked could blindly overwrite a just-committed webhook extension
  -- (including erasing last_extended_period back to a stale value), reopening
  -- the shared-window double-extension bug this same migration's guard exists
  -- to prevent.
  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT * INTO v_window
    FROM public.family_coverage_windows
    WHERE family_group_id = v_profile.family_group_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_window
    FROM public.family_coverage_windows
    WHERE subject_profile_id = p_profile_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe una ventana de cobertura para renovar en el perfil %', p_profile_id;
  END IF;

  IF v_window.paid_through >= now() THEN
    RAISE EXCEPTION 'La ventana de cobertura del perfil % todavia no expiro; no se puede renovar', p_profile_id;
  END IF;

  -- Balance guard (D7 / spec "Renewal Balance Guard"). Policy-shape-robust
  -- read: the seed is a nested {"mode":...} object, but the only shipped
  -- write path (OCCSettings.tsx -> SystemSettingsRepository.update) upserts
  -- a BARE JSON string scalar instead. Handle both; NULL/unrecognized mode
  -- explicitly defaults to the safer grace_period behavior (no silent NULL
  -- fallthrough into the block/grace branch below).
  SELECT value INTO v_policy FROM public.system_settings WHERE key = 'delinquency_policy';

  v_mode := CASE
    WHEN v_policy IS NULL THEN NULL
    WHEN jsonb_typeof(v_policy) = 'object' THEN v_policy ->> 'mode'
    ELSE v_policy #>> '{}'
  END;

  IF v_mode IS NULL OR v_mode NOT IN ('block', 'grace_period') THEN
    v_mode := 'grace_period';
  END IF;

  -- KNOWN LIMITATION (tracked for PR3): unlike the window lookup above, this
  -- balance check is keyed strictly on p_profile_id, not branched by
  -- family_group_id. PR3 decides the billing entity-id convention for
  -- family plans (bill the titular only? each member individually?) — until
  -- then, a family window's guard could be checked against the wrong
  -- member's individual balance. Revisit once that convention is fixed.
  -- Scalar subquery (not a plain SELECT INTO) so COALESCE still applies when
  -- the entity has zero ledger movements — a bare SELECT INTO against zero
  -- matching rows would leave v_balance NULL despite the COALESCE, since
  -- there's no row for it to operate on.
  v_balance := COALESCE((
    SELECT balance FROM public.affiliate_account_balances
    WHERE entity_type = 'affiliate' AND entity_id = p_profile_id
  ), 0);

  IF v_mode = 'block' AND v_balance > 0 THEN
    RAISE EXCEPTION 'No se puede renovar: el perfil % tiene un saldo pendiente de %', p_profile_id, v_balance;
  END IF;

  -- Renewal always re-derives from whatever plan is CURRENTLY assigned —
  -- never manually re-typed — and resets consumed quota to zero. Preserves
  -- PR1's snapshot-freezing columns.
  v_total_months := v_plan.paid_months + v_plan.bonus_months;
  v_granted_quota := CASE WHEN v_plan.is_unlimited THEN NULL
                          ELSE v_plan.bonified_consultations * v_total_months END;

  UPDATE public.family_coverage_windows
  SET plan_id_snapshot = v_plan.id,
      period_start = now(),
      paid_through = now() + make_interval(months => v_total_months),
      granted_quota = v_granted_quota,
      is_unlimited = v_plan.is_unlimited,
      paid_months_snapshot = v_plan.paid_months,
      bonus_months_snapshot = v_plan.bonus_months,
      monthly_cost_snapshot = v_plan.monthly_cost,
      last_extended_period = NULL
  WHERE id = v_window.id
  RETURNING * INTO v_window;

  IF v_profile.family_group_id IS NOT NULL THEN
    UPDATE public.profiles SET current_period_quota_used = 0 WHERE family_group_id = v_profile.family_group_id;
  ELSE
    UPDATE public.profiles SET current_period_quota_used = 0 WHERE id = p_profile_id;
  END IF;

  v_result."window" := v_window;
  v_result.is_delinquent := v_balance > 0;
  v_result.balance_due := GREATEST(v_balance, 0);

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.renew_coverage_window IS 'Explicit, admin-only renewal for an EXPIRED coverage window. Re-derives period/quota/paid-bonus-cost snapshot from the plan currently assigned to the profile and resets consumed quota to zero. Balance-guarded: delinquency_policy.mode=block rejects renewal with balance>0; grace_period (or an unrecognized/NULL mode) completes renewal and flags the composite result with is_delinquent/balance_due. Never automatic, no scheduler. Re-defined here (20260726000000) to additionally reset last_extended_period to NULL on every renewal — that column did not exist in the original 20260722010000 definition, and a stale value carried over from before the renewal could incorrectly block a legitimate post-renewal extension in post_payment_movement_from_webhook.';

-- ── 5. Composite return types ───────────────────────────────────────────────
CREATE TYPE public.webhook_payment_result AS (
  posted            BOOLEAN,  -- FOUND after ON CONFLICT DO NOTHING; gates extension (I6)
  movement_id       UUID,
  invoice_id        UUID,
  invoice_status    TEXT,     -- post-call status: 'issued' | 'paid'
  coverage_extended BOOLEAN,
  deferred_reason   TEXT      -- NULL | 'no_window' | 'balance_due' | 'invoice_already_paid'
);                            --      | 'partial_payment' | 'window_reset' | 'invoice_cancelled'
                              --      | 'period_already_extended'

COMMENT ON TYPE public.webhook_payment_result IS 'post_payment_movement_from_webhook return shape. A single named composite (not RETURNS TABLE/SETOF) so callers consume it as one object.';

CREATE TYPE public.subscription_claim_result AS (
  claim           TEXT,       -- 'reserved' | 'already_live' | 'stale_pending'
  reservation_id  UUID,
  existing_id     UUID,
  existing_status TEXT,
  existing_mp_id  TEXT
);

COMMENT ON TYPE public.subscription_claim_result IS 'claim_subscription_enrollment return shape (D-F).';

-- ── 6. post_payment_movement_from_webhook ───────────────────────────────────
-- Mirrors post_payment_movement (20260722010000:226-233) parameter-for-
-- parameter, plus p_occurred_at, returning the composite instead of the
-- movement row so deferrals are reportable. Authorized by is_service_role(),
-- NEVER is_admin() — the webhook carries no Supabase user JWT (D-A).
--
-- Divergent from post_payment_movement by design (D-A): this path extends
-- coverage (see below) and never RAISEs on an already-settled invoice — a
-- webhook must be free to redeliver indefinitely (R13) without the caller
-- treating a replay as an error.
CREATE OR REPLACE FUNCTION public.post_payment_movement_from_webhook(
  p_invoice_id    UUID,
  p_entity_type   TEXT,
  p_entity_id     UUID,
  p_amount        DECIMAL(12,2),
  p_external_ref  TEXT,
  p_source        TEXT DEFAULT 'mercadopago',
  p_occurred_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.webhook_payment_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice                 public.invoices;
  v_movement                public.affiliate_account_movements;
  v_family_group_id         UUID;
  v_profile                 public.profiles;
  v_window                  public.family_coverage_windows;
  v_policy                  JSONB;
  v_mode                    TEXT;
  v_balance                 NUMERIC;
  v_posted                  BOOLEAN;
  v_invoice_was_paid_before BOOLEAN;
  v_invoice_was_cancelled   BOOLEAN;
  v_window_found            BOOLEAN;
  v_paid_total              NUMERIC;
  v_result                  public.webhook_payment_result;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_entity_type <> 'affiliate' THEN
    RAISE EXCEPTION 'post_payment_movement_from_webhook solo soporta entity_type=affiliate (recibido: %)', p_entity_type;
  END IF;

  IF p_external_ref IS NULL OR p_external_ref = '' THEN
    RAISE EXCEPTION 'post_payment_movement_from_webhook requiere un external_ref no vacio para garantizar idempotencia.';
  END IF;

  -- Row-lock the invoice for the duration of this transaction — mirrors
  -- post_payment_movement:256-263 and, by locking the SAME row, serializes
  -- against the admin manual-reconciliation path racing on one invoice
  -- (R16): whichever commits second observes the committed status below.
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura % no encontrada', p_invoice_id;
  END IF;

  -- I10: captured BEFORE this movement's own flip, so a second genuinely
  -- distinct payment against an already-paid invoice (R15) still posts (the
  -- credit is real) but never extends coverage a second time.
  v_invoice_was_paid_before := (v_invoice.status = 'paid');

  -- Fix 2: cancelled invoices must never be silently resurrected to 'paid'
  -- by a stray/redelivered webhook payment against an admin-cancelled
  -- invoice — captured alongside v_invoice_was_paid_before, BEFORE this
  -- movement's own flip.
  v_invoice_was_cancelled := (v_invoice.status = 'cancelled');

  SELECT family_group_id INTO v_family_group_id FROM public.profiles WHERE id = p_entity_id;

  -- Idempotent insert (D4 pattern). Unlike post_payment_movement, this path
  -- never RAISEs when the invoice is already paid — MP redelivery (R13) and
  -- a second legitimate payment (R15) must both be able to reach this insert
  -- and let ON CONFLICT decide, not an exception.
  INSERT INTO public.affiliate_account_movements
    (entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by)
  VALUES
    (p_entity_type, p_entity_id, v_family_group_id, 'payment', p_amount, p_external_ref, p_invoice_id, p_source, NULL)
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING
  RETURNING * INTO v_movement;

  IF FOUND THEN
    v_posted := true;
  ELSE
    v_posted := false;
    SELECT * INTO v_movement
    FROM public.affiliate_account_movements
    WHERE external_ref = p_external_ref;
  END IF;

  -- Defensive: external_ref is globally unique, but guard against an
  -- app-layer bug reusing a ref across different invoices.
  IF v_movement.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'external_ref % ya pertenece a la factura %, no a %; posible reuso de referencia entre facturas.', p_external_ref, v_movement.invoice_id, p_invoice_id;
  END IF;

  -- Fix 1: the status-flip and partial-payment determination must be based
  -- on the CUMULATIVE sum of every 'payment'-type movement posted against
  -- this invoice (including the one just inserted/found above), not on
  -- p_amount alone — otherwise a second, later, distinct partial payment
  -- that completes the invoice would never flip it to 'paid'.
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_total
  FROM public.affiliate_account_movements
  WHERE invoice_id = p_invoice_id AND type = 'payment';

  -- I9: flip to paid / reactivate the plan ONLY when the cumulative payments
  -- cover the invoice in full, and never when the invoice was cancelled
  -- (Fix 2). A partial payment posts the real amount but leaves the
  -- invoice 'issued'.
  IF v_posted AND NOT v_invoice_was_cancelled AND v_paid_total >= v_invoice.total_amount THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
    v_invoice.status := 'paid';
  END IF;

  v_result.posted := v_posted;
  v_result.movement_id := v_movement.id;
  v_result.invoice_id := p_invoice_id;
  v_result.invoice_status := v_invoice.status;
  v_result.coverage_extended := false;
  v_result.deferred_reason := NULL;

  -- I6: extension runs ONLY when THIS call is the one that actually posted
  -- the movement (FOUND after ON CONFLICT DO NOTHING). A duplicate/replayed
  -- call never re-extends (R12/R13).
  IF NOT v_posted THEN
    RETURN v_result;
  END IF;

  -- Fix 2: the movement is still posted (money received is real), but a
  -- cancelled invoice must never be resurrected to 'paid' nor have its
  -- coverage extended by a stray/redelivered payment.
  IF v_invoice_was_cancelled THEN
    v_result.deferred_reason := 'invoice_cancelled';
    RETURN v_result;
  END IF;

  -- I10 (continued): the payment is a legitimate second credit (R15/R16),
  -- but coverage was already extended for this invoice by an earlier,
  -- distinct payment.
  IF v_invoice_was_paid_before THEN
    -- R-JD5: this is a legitimate, distinct second payment against an
    -- invoice that was already 'paid' (e.g. by an earlier payment or by
    -- admin manual reconciliation). It returns BEFORE the family_coverage_windows
    -- lock below, so it never participates in the lock-order guarded by the
    -- deadlock fix further down — reactivating the profile here is safe and
    -- does not need to wait for that ordering.
    UPDATE public.profiles SET plan_status = 'active' WHERE id = p_entity_id;
    v_result.deferred_reason := 'invoice_already_paid';
    RETURN v_result;
  END IF;

  -- I9 (continued): a partial payment never triggers extension. Uses the
  -- CUMULATIVE paid total (Fix 1), so this only holds while the sum of all
  -- payments against this invoice still falls short of the total.
  IF v_paid_total < v_invoice.total_amount THEN
    v_result.deferred_reason := 'partial_payment';
    RETURN v_result;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_entity_id;

  -- R18: lock the window BEFORE the balance read, so the balance guard, the
  -- I10 capture and this UPDATE all observe one committed row version — the
  -- second of two concurrent extensions blocks here until the first commits,
  -- then re-reads the COMMITTED paid_months_snapshot.
  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT * INTO v_window FROM public.family_coverage_windows w
     WHERE w.family_group_id = v_profile.family_group_id FOR UPDATE;
  ELSE
    SELECT * INTO v_window FROM public.family_coverage_windows w
     WHERE w.subject_profile_id = p_entity_id FOR UPDATE;
  END IF;
  -- Captured immediately: the profiles UPDATE below also sets FOUND (to
  -- whether it affected a row), which would otherwise clobber the window
  -- lookup's FOUND before the NOT FOUND check further down can read it.
  v_window_found := FOUND;

  -- Deadlock fix: this UPDATE used to run immediately after the invoice
  -- status flip, BEFORE the window lock above — the exact opposite lock
  -- order from renew_coverage_window (family_coverage_windows THEN
  -- profiles). Two concurrent transactions taking opposite lock orders on
  -- the same two rows (an admin renewal and a webhook payment against the
  -- same profile/family) is a textbook AB-BA deadlock. Moved here, AFTER
  -- the window lock, so both functions always acquire
  -- family_coverage_windows before profiles. Reaching this point already
  -- guarantees v_posted, NOT v_invoice_was_cancelled, v_paid_total >=
  -- v_invoice.total_amount AND NOT v_invoice_was_paid_before — that last
  -- condition returns earlier above with its OWN profiles reactivation
  -- (see the invoice_was_paid_before branch), precisely because that path
  -- never reaches the window lock and therefore needs no lock-ordering
  -- protection. This UPDATE preserves the original
  -- unconditional-on-full-payment behavior for the remaining path,
  -- including running even when no window exists for this profile (the
  -- NOT FOUND check below still fires on the CAPTURED v_window_found, not
  -- on this UPDATE's own FOUND).
  UPDATE public.profiles SET plan_status = 'active' WHERE id = p_entity_id;

  IF NOT v_window_found THEN
    v_result.deferred_reason := 'no_window';
    RETURN v_result;
  END IF;

  -- R17: an admin ran renew_coverage_window (a full-term reset) after this
  -- invoice's period was issued — the window no longer represents that term.
  -- Extending it now would grant a free month on top of the reset.
  IF v_invoice.period < to_char(v_window.period_start, 'YYYY-MM') THEN
    v_result.deferred_reason := 'window_reset';
    RETURN v_result;
  END IF;

  -- Fix 3: a shared family_coverage_windows row can be reached independently
  -- by DIFFERENT invoices (different family members, different
  -- external_refs) for the SAME billing period — v_invoice_was_paid_before
  -- and the R17 check above are both per-invoice/per-invoice-vs-window-period
  -- and do not catch this. last_extended_period records which invoice-period
  -- most recently extended this SAME window; if some other invoice already
  -- extended it for this period (or a later one), this call must not extend
  -- it again.
  IF v_window.last_extended_period IS NOT NULL AND v_window.last_extended_period >= v_invoice.period THEN
    v_result.deferred_reason := 'period_already_extended';
    RETURN v_result;
  END IF;

  -- I7: balance guard, shape-robust read mirroring renew_coverage_window
  -- (20260722010000:393-403). The balance SUM already reflects THIS payment
  -- (I5), since the movement insert above is in the same transaction.
  SELECT value INTO v_policy FROM public.system_settings WHERE key = 'delinquency_policy';
  v_mode := CASE
    WHEN v_policy IS NULL THEN NULL
    WHEN jsonb_typeof(v_policy) = 'object' THEN v_policy ->> 'mode'
    ELSE v_policy #>> '{}'
  END;
  IF v_mode IS NULL OR v_mode NOT IN ('block', 'grace_period') THEN
    v_mode := 'grace_period';
  END IF;

  v_balance := COALESCE((
    SELECT balance FROM public.affiliate_account_balances
    WHERE entity_type = 'affiliate' AND entity_id = p_entity_id
  ), 0);

  IF v_mode = 'block' AND v_balance > 0 THEN
    v_result.deferred_reason := 'balance_due';
    RETURN v_result;
  END IF;

  -- I1/I2/I3/I4: one-month extension recomputed from the FIXED period_start
  -- anchor, never accumulated onto paid_through. period_start itself is
  -- never modified here. All derived columns are computed inside this single
  -- UPDATE from paid_months_snapshot + 1, never from a value read earlier.
  UPDATE public.family_coverage_windows w SET
    paid_months_snapshot = w.paid_months_snapshot + 1,
    paid_through = w.period_start + make_interval(months =>
                     (w.paid_months_snapshot + 1) + w.bonus_months_snapshot),
    granted_quota = CASE WHEN w.is_unlimited THEN NULL
                    ELSE w.granted_quota + COALESCE((SELECT p.bonified_consultations
                      FROM public.plans p WHERE p.id = w.plan_id_snapshot), 0) END,
    last_extended_period = v_invoice.period
  WHERE w.id = v_window.id;

  v_result.coverage_extended := true;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.post_payment_movement_from_webhook IS 'Service-role-only counterpart to post_payment_movement (D-A): posts a payment movement AND, in the same transaction, extends the affiliate''s coverage window by one period when the payment is new, full, non-window-reset and balance-guard-clear (D-B). Never RAISEs on an already-settled invoice — MP redelivery must always be a free no-op, never an error.';

-- ── 7. record_mercadopago_subscription_event ────────────────────────────────
-- One RPC parameterized by target status, rather than one RPC per transition
-- kind (D-D): every new transition shares the SAME dedup+guard+update body,
-- instead of risking a guard being forgotten in one of several copies.
CREATE OR REPLACE FUNCTION public.record_mercadopago_subscription_event(
  p_mp_preapproval_id       TEXT,
  p_event_type              TEXT,
  p_mp_resource_id          TEXT,
  p_new_status              TEXT,
  p_occurred_at             TIMESTAMPTZ,
  p_discount_through_period TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        public.affiliate_payment_subscriptions;
  v_will_apply BOOLEAN;
  v_outcome    TEXT;
  v_updated    INT;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_new_status NOT IN ('authorized', 'payment_failed', 'cancelled') THEN
    RAISE EXCEPTION 'record_mercadopago_subscription_event: p_new_status invalido (%). Solo authorized|payment_failed|cancelled son destinos validos (pending es solo un estado inicial).', p_new_status;
  END IF;

  -- R23: fail closed. now() is always newer than anything stored and would
  -- silently disable the recency guard in the permissive direction. The
  -- ':noclock' suffix keeps the real (event_type, mp_resource_id) slot free.
  IF p_occurred_at IS NULL THEN
    INSERT INTO public.mercadopago_events
      (event_type, mp_resource_id, mp_status, outcome, resolution_state)
    VALUES
      (p_event_type, p_mp_resource_id || ':noclock', p_new_status, 'occurred_at_unresolved', 'needs_admin')
    ON CONFLICT (event_type, mp_resource_id) DO NOTHING;
    RETURN 'occurred_at_unresolved';
  END IF;

  SELECT * INTO v_sub
  FROM public.affiliate_payment_subscriptions
  WHERE mp_preapproval_id = p_mp_preapproval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.mercadopago_events
      (event_type, mp_resource_id, mp_status, outcome, detail, resolution_state)
    VALUES
      (p_event_type, p_mp_resource_id || ':unknown', p_new_status, 'unknown_subscription', p_mp_preapproval_id, 'pending')
    ON CONFLICT (event_type, mp_resource_id) DO NOTHING;
    RETURN 'unknown_subscription';
  END IF;

  -- R1/R2: profile_id IS NULL is checked explicitly (never conflated with
  -- "row not found") and returns BEFORE consuming the real dedup slot — the
  -- ':unlinked' suffix leaves the true key free so the transition can be
  -- applied later, once Pass B links this subscription to a profile.
  IF v_sub.profile_id IS NULL THEN
    INSERT INTO public.mercadopago_events
      (event_type, mp_resource_id, mp_status, outcome, detail, resolution_state)
    VALUES
      (p_event_type, p_mp_resource_id || ':unlinked', p_new_status, 'subscription_not_linked', p_mp_preapproval_id, 'pending')
    ON CONFLICT (event_type, mp_resource_id) DO NOTHING;
    RETURN 'subscription_not_linked';
  END IF;

  -- R14: terminal + recency guard, evaluated against the row ALREADY LOCKED
  -- above, BEFORE the audit insert — so the persisted outcome always matches
  -- what the UPDATE below actually does.
  v_will_apply := (
    v_sub.status <> 'cancelled'
    AND p_occurred_at >= COALESCE(v_sub.status_changed_at, '-infinity'::timestamptz)
  );
  v_outcome := CASE WHEN v_will_apply THEN 'status_' || p_new_status ELSE 'transition_ignored' END;

  INSERT INTO public.mercadopago_events
    (event_type, mp_resource_id, mp_status, profile_id, outcome, resolution_state)
  VALUES
    (p_event_type, p_mp_resource_id, p_new_status, v_sub.profile_id, v_outcome, 'final')
  ON CONFLICT (event_type, mp_resource_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'duplicate_event';
  END IF;

  UPDATE public.affiliate_payment_subscriptions s SET
    status = p_new_status,
    status_changed_at = p_occurred_at,
    discount_through_period = COALESCE(p_discount_through_period, s.discount_through_period),
    last_failure_at = CASE WHEN p_new_status = 'payment_failed' THEN p_occurred_at ELSE s.last_failure_at END,
    failure_count   = CASE WHEN p_new_status = 'payment_failed' THEN s.failure_count + 1 ELSE s.failure_count END,
    updated_at = now()
  WHERE s.id = v_sub.id
    AND s.status <> 'cancelled'                                          -- terminal guard
    AND p_occurred_at >= COALESCE(s.status_changed_at, '-infinity'::timestamptz); -- recency guard

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN CASE WHEN v_updated = 1 THEN 'status_applied' ELSE 'transition_ignored' END;
END;
$$;

COMMENT ON FUNCTION public.record_mercadopago_subscription_event IS 'Service-role-only. Records ANY subscription lifecycle transition (authorized/payment_failed/cancelled) with dedup (event_type, mp_resource_id), a terminal guard (cancelled is never resurrected) and a recency guard (out-of-order delivery cannot overwrite a newer state). The persisted mercadopago_events.outcome always matches the actual UPDATE result, because both are computed from the SAME row held FOR UPDATE for the whole transaction.';

-- ── 8. mark_mercadopago_event_resolution ────────────────────────────────────
-- The D-H sweep''s only write to mercadopago_events. The
-- "AND resolution_state = 'pending'" predicate makes two concurrent sweep
-- runs safe (R19): the loser''s UPDATE affects zero rows instead of double-
-- incrementing attempt_count or resurrecting an already-resolved row.
CREATE OR REPLACE FUNCTION public.mark_mercadopago_event_resolution(
  p_event_id         UUID,
  p_resolution_state TEXT,
  p_outcome          TEXT DEFAULT NULL,
  p_resolved_by_ref  TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_resolution_state NOT IN ('final', 'pending', 'resolved', 'needs_admin') THEN
    RAISE EXCEPTION 'mark_mercadopago_event_resolution: p_resolution_state invalido (%)', p_resolution_state;
  END IF;

  UPDATE public.mercadopago_events SET
    resolution_state = p_resolution_state,
    outcome          = COALESCE(p_outcome, outcome),
    attempt_count    = attempt_count + 1,
    last_attempt_at  = now(),
    resolved_at      = CASE WHEN p_resolution_state = 'resolved' THEN now() ELSE resolved_at END,
    resolved_by_ref  = COALESCE(p_resolved_by_ref, resolved_by_ref)
  WHERE id = p_event_id AND resolution_state = 'pending'; -- only a pending row may move

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

COMMENT ON FUNCTION public.mark_mercadopago_event_resolution IS 'Service-role-only. The D-H sweep''s only write path to mercadopago_events. Returns false when the target row was not resolution_state=''pending'' (R19) — a resolved/final/needs_admin row is never touched again, and two concurrent sweeps converge safely.';

-- ── 9. Enrollment RPCs — claim / finalize / release ─────────────────────────
-- D-F: naively letting an already-subscribed affiliate call
-- POST /api/payments/subscribe would let them create a SECOND preapproval — a
-- second real MP monthly charge. A read-then-insert check in Node is TOCTOU.
-- The slot is reserved in the DATABASE, under an advisory lock, BEFORE any
-- MP API call is ever made.
CREATE OR REPLACE FUNCTION public.claim_subscription_enrollment(p_profile_id UUID)
RETURNS public.subscription_claim_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row    public.affiliate_payment_subscriptions;
  v_result public.subscription_claim_result;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Serializes concurrent enrollments for this profile without a partial
  -- unique index that the webhook path would trip over (R9).
  PERFORM pg_advisory_xact_lock(hashtext('mp_enroll:' || p_profile_id::text));

  -- A row is "live" (blocks re-enrollment) when it is authorized/
  -- payment_failed, OR a fresh (<30min) pending reservation/finalization
  -- still eligible to complete.
  SELECT * INTO v_row
  FROM public.affiliate_payment_subscriptions
  WHERE profile_id = p_profile_id
    AND (
      status IN ('authorized', 'payment_failed')
      OR (status = 'pending' AND created_at > now() - interval '30 minutes')
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_result.claim := 'already_live';
    v_result.reservation_id := NULL;
    v_result.existing_id := v_row.id;
    v_result.existing_status := v_row.status;
    v_result.existing_mp_id := v_row.mp_preapproval_id;
    RETURN v_result;
  END IF;

  -- An older, finalized-but-never-authorized reservation (payer abandoned
  -- MP''s checkout) — resolved by the caller (R11: cancel at MP first, fail
  -- closed with 409 if that cancel fails), never silently superseded.
  SELECT * INTO v_row
  FROM public.affiliate_payment_subscriptions
  WHERE profile_id = p_profile_id
    AND status = 'pending'
    AND mp_preapproval_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_result.claim := 'stale_pending';
    v_result.reservation_id := NULL;
    v_result.existing_id := v_row.id;
    v_result.existing_status := v_row.status;
    v_result.existing_mp_id := v_row.mp_preapproval_id;
    RETURN v_result;
  END IF;

  -- Neither live nor stale-but-finalized: reserve a NEW slot. Covers the
  -- true first-time case AND a crashed prior reservation (mp_preapproval_id
  -- still NULL, older than 30 min) — garbage-collected later by sweep Pass D.
  INSERT INTO public.affiliate_payment_subscriptions (profile_id, status, mp_preapproval_id)
  VALUES (p_profile_id, 'pending', NULL)
  RETURNING * INTO v_row;

  v_result.claim := 'reserved';
  v_result.reservation_id := v_row.id;
  v_result.existing_id := NULL;
  v_result.existing_status := NULL;
  v_result.existing_mp_id := NULL;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.claim_subscription_enrollment IS 'Service-role-only. Reserves a re-enrollment slot for a profile under an advisory lock BEFORE any MP API call is made, so two concurrent /api/payments/subscribe calls can never both create a live preapproval for the same affiliate (R8/R9).';

CREATE OR REPLACE FUNCTION public.finalize_subscription_enrollment(
  p_reservation_id          UUID,
  p_mp_preapproval_id       TEXT,
  p_discounted_monthly_cost NUMERIC(12,2)
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.affiliate_payment_subscriptions SET
    mp_preapproval_id = p_mp_preapproval_id,
    discounted_monthly_cost = p_discounted_monthly_cost,
    updated_at = now()
  WHERE id = p_reservation_id AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 THEN
    RETURN 'finalized';
  ELSE
    RETURN 'reservation_missing';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finalize_subscription_enrollment IS 'Service-role-only. Attaches the MP preapproval id created for a reservation. Returns reservation_missing (R21) when the reservation was garbage-collected by sweep Pass D before this call arrived — the caller MUST then cancel the just-created MP preapproval and fail closed (409), never insert a replacement row.';

CREATE OR REPLACE FUNCTION public.release_subscription_reservation(p_reservation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Only a still-pending, never-finalized reservation may be released this
  -- way: mp_preapproval_id IS NULL means nothing exists at MP for it, so
  -- deletion is safe. A finalized row must never be deleted here.
  DELETE FROM public.affiliate_payment_subscriptions
  WHERE id = p_reservation_id AND status = 'pending' AND mp_preapproval_id IS NULL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

COMMENT ON FUNCTION public.release_subscription_reservation IS 'Service-role-only. Deletes an unfinalized reservation after MP preapproval creation fails. Never touches a finalized row (mp_preapproval_id NOT NULL) — that case is handled by cancelling at MP and recording it through record_mercadopago_subscription_event instead.';

-- ── 10. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.affiliate_payment_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_events ENABLE ROW LEVEL SECURITY;

-- Base GRANT for both new tables is SELECT-only (below) — all writes go
-- exclusively through the SECURITY DEFINER RPCs above, mirroring the
-- ledger's own D3 rule. An "admin FOR ALL" RLS policy is therefore only ever
-- reachable for the SELECT verb in practice; it is still declared explicitly
-- (rather than relying only on a narrower admin-SELECT policy) so an admin's
-- access is governed by the SAME is_admin() policy shape used everywhere
-- else in this schema, matching Migration/Rollout's Policies(5) inventory.
CREATE POLICY "Admins manage payment subscriptions"
  ON public.affiliate_payment_subscriptions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Affiliates read own payment subscriptions"
  ON public.affiliate_payment_subscriptions FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins manage mercadopago events"
  ON public.mercadopago_events FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins read mercadopago events"
  ON public.mercadopago_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- D-G: titular-only (Resolved Decision #6). An identity match on entity_id
-- has no null-comparison failure mode, unlike the REJECTED family_group_id
-- equality check (NULL = NULL would have matched any two unrelated
-- affiliates with no family group — the hole this decision closed).
CREATE POLICY "Affiliates read own invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (entity_type = 'affiliate' AND entity_id = auth.uid());

-- ── 11. GRANT / REVOKE ───────────────────────────────────────────────────
GRANT SELECT ON public.affiliate_payment_subscriptions TO authenticated;
GRANT SELECT ON public.affiliate_payment_subscriptions TO service_role;
GRANT SELECT ON public.mercadopago_events TO authenticated;
GRANT SELECT ON public.mercadopago_events TO service_role;

-- Defense in depth: authenticated already lacks INSERT/UPDATE/DELETE on both
-- tables today only because no GRANT for those verbs was ever issued. Making
-- the REVOKE explicit means a future migration that copy-pastes a blanket
-- "GRANT ALL ... TO authenticated" elsewhere cannot silently reopen writes
-- here — all writes must continue to go exclusively through the SECURITY
-- DEFINER RPCs above.
REVOKE INSERT, UPDATE, DELETE ON public.affiliate_payment_subscriptions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.mercadopago_events FROM authenticated;

-- Defense in depth for every service-role-only RPC, including
-- is_service_role() itself: EXECUTE is revoked from PUBLIC (Postgres grants
-- it by default on new functions) and granted ONLY to service_role. A
-- browser-authenticated caller is refused at the GRANT layer, before the
-- in-body IF NOT is_service_role() guard ever runs.
REVOKE EXECUTE ON FUNCTION public.is_service_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO service_role;

REVOKE EXECUTE ON FUNCTION public.post_payment_movement_from_webhook(UUID, TEXT, UUID, DECIMAL, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_payment_movement_from_webhook(UUID, TEXT, UUID, DECIMAL, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_mercadopago_subscription_event(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_mercadopago_subscription_event(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_mercadopago_event_resolution(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_mercadopago_event_resolution(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_subscription_enrollment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_subscription_enrollment(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_subscription_enrollment(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_subscription_enrollment(UUID, TEXT, NUMERIC) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_subscription_reservation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_subscription_reservation(UUID) TO service_role;
