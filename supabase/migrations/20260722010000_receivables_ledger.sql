-- Migration: Cuenta Corriente Billing — Receivables Ledger + RPCs (PR2/4)
-- Description:
-- 1. `affiliate_account_movements` — append-only ledger, DIRECT AFFILIATES
--    ONLY (agreements stay on the legacy path, out of scope — see design
--    Scope Boundary). `type IN ('charge','payment','adjustment')`, signed
--    `amount` allowed ONLY for `adjustment` rows (charge/payment always >=0;
--    sign is applied at READ time by the balance view, never stored).
--    Idempotency key: `external_ref`, UNIQUE only where NOT NULL.
-- 2. RLS mirrors `family_coverage_windows`'s self-read + admin pattern, but
--    narrower on writes: base GRANT is SELECT-only for authenticated/
--    service_role — the table is INSERT/UPDATE/DELETE-closed to every role.
--    The only writers are the SECURITY DEFINER RPCs below (function owner
--    bypasses RLS/GRANTs), enforcing "posting only via RPC" (D3) and ledger
--    immutability (movements are never updated/deleted, corrections are new
--    adjustment rows) at the DB layer, not just by convention.
-- 3. `affiliate_account_balances` (SUM of signed movements) and
--    `affiliate_payment_status` (derived current/pending/overdue) views,
--    both `WITH (security_invoker = true)` so they enforce the CALLER's RLS
--    on the underlying tables rather than the view owner's.
-- 4. `post_billing_charge` / `post_payment_movement`: SECURITY DEFINER,
--    admin-gated (mirrors assign_plan/renew_coverage_window — OCCBilling.tsx
--    and the invoice reconcile action are both admin-only UI calling the
--    browser supabase-js client under the admin's own session, so is_admin()
--    resolves correctly). Idempotent via the D4 insert-then-fallback-select
--    pattern: `INSERT ... ON CONFLICT DO NOTHING RETURNING * INTO v_row; IF
--    NOT FOUND THEN SELECT the existing row; END IF;` — `ON CONFLICT DO
--    NOTHING RETURNING *` returns ZERO rows on conflict, it does NOT hand
--    back the pre-existing row.
--    - post_billing_charge: ONE txn, invoice upsert (ON CONFLICT on the
--      UNIQUE(entity_type,entity_id,period) constraint added in PR1's
--      20260722000000 migration) + charge movement insert.
--    - post_payment_movement: ONE txn, payment movement + invoice
--      status='paid' + profiles.plan_status='active' (carries forward what
--      the legacy BillingService.reconcileInvoice does today for affiliates)
--      — no separate app-layer write. No-op (no new movement, no re-flip) if
--      the invoice is already 'paid'.
-- 5. `renew_coverage_window` is REPLACED (return type changes, so the old
--    function must be DROPPED first, not CREATE OR REPLACE'd) to add the
--    balance guard from `system_settings.delinquency_policy`, read in a
--    shape-robust way (nested `{"mode":...}` object OR bare JSON string
--    scalar — see design D7), defaulting to grace_period when the resolved
--    mode is NULL/unrecognized. Returns the named composite type
--    `renew_coverage_window_result` (NOT `RETURNS TABLE`/`SETOF`, which
--    would array-wrap the PostgREST response). PR1's snapshot-freezing
--    columns (paid_months_snapshot/bonus_months_snapshot/monthly_cost_snapshot)
--    are preserved in the replacement body.
--
-- MIGRATION ORDERING: this file's timestamp (20260722010000) is later than
-- PR1's 20260722000000 — required because post_billing_charge's invoice
-- upsert uses PR1's UNIQUE(entity_type,entity_id,period) constraint as its
-- ON CONFLICT arbiter.

-- ── 1. affiliate_account_movements ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_account_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL CHECK (entity_type = 'affiliate'),
  entity_id       UUID NOT NULL,
  family_group_id UUID,
  type            TEXT NOT NULL CHECK (type IN ('charge', 'payment', 'adjustment')),
  amount          DECIMAL(12,2) NOT NULL,
  external_ref    TEXT,
  invoice_id      UUID REFERENCES public.invoices(id),
  source          TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_account_movements_signed_amount_check
    CHECK (type = 'adjustment' OR amount >= 0)
);

COMMENT ON TABLE public.affiliate_account_movements IS 'Append-only receivables ledger for DIRECT AFFILIATES ONLY (agreements out of scope). Balance is never stored — always SUM(movements) at read time via affiliate_account_balances. Rows are never updated/deleted; corrections are new adjustment movements.';
COMMENT ON COLUMN public.affiliate_account_movements.amount IS 'Always >= 0 for charge/payment (sign applied at read time: payment subtracts, charge adds). Only adjustment rows may carry a negative amount directly.';
COMMENT ON COLUMN public.affiliate_account_movements.external_ref IS 'Idempotency key. Charges: charge:affiliate:{id}:{period}. Manual payments: deterministic payment:manual:{invoice_id} so a double-click/retry collapses onto the same row. PSP payments: the PSP transaction id.';
COMMENT ON COLUMN public.affiliate_account_movements.family_group_id IS 'Denormalized from profiles.family_group_id at insert time (NULL for a standalone affiliate). Lets the RLS "family match" policy compare against the CALLER''s own family_group_id directly, mirroring family_coverage_windows'' safe pattern, instead of looking up a sibling''s profiles row (which that row''s own RLS would block, silently making the policy dead code).';

-- Idempotency arbiter: UNIQUE only where external_ref IS NOT NULL (D4).
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_account_movements_external_ref_idx
  ON public.affiliate_account_movements (external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS affiliate_account_movements_entity_idx
  ON public.affiliate_account_movements (entity_type, entity_id);

-- ── 2. RLS: self-read (+ family match) / admin-read-all. No direct writes. ─
ALTER TABLE public.affiliate_account_movements ENABLE ROW LEVEL SECURITY;

-- Compares the ROW's own family_group_id (denormalized above) against a
-- SELF-ONLY lookup of the caller's profile — never a sibling's row — so
-- this actually works under RLS. The earlier version looked up a sibling's
-- profiles row to find their id, which that row's own "Self manage" RLS
-- policy silently blocked, making the family branch dead code (judgment-day
-- finding). Mirrors family_coverage_windows' own working policy exactly.
DROP POLICY IF EXISTS "Affiliates read own account movements" ON public.affiliate_account_movements;
CREATE POLICY "Affiliates read own account movements"
  ON public.affiliate_account_movements FOR SELECT
  TO authenticated
  USING (
    entity_type = 'affiliate' AND (
      entity_id = auth.uid()
      OR (
        family_group_id IS NOT NULL
        AND family_group_id = (
          SELECT p.family_group_id FROM public.profiles p WHERE p.id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Admins read all account movements" ON public.affiliate_account_movements;
CREATE POLICY "Admins read all account movements"
  ON public.affiliate_account_movements FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Base GRANT is SELECT-only (RESOLVES the ledger-immutability requirement at
-- the GRANT layer too): no role gets table-level INSERT/UPDATE/DELETE.
-- Writes happen exclusively through the SECURITY DEFINER RPCs below, whose
-- owner bypasses both RLS and these GRANTs.
GRANT SELECT ON public.affiliate_account_movements TO authenticated;
GRANT SELECT ON public.affiliate_account_movements TO service_role;

-- ── 3. Views — SUM balance + derived status, both security_invoker ────────
CREATE OR REPLACE VIEW public.affiliate_account_balances
WITH (security_invoker = true) AS
SELECT
  entity_type,
  entity_id,
  COALESCE(SUM(CASE WHEN type = 'payment' THEN -amount ELSE amount END), 0) AS balance
FROM public.affiliate_account_movements
GROUP BY entity_type, entity_id;

COMMENT ON VIEW public.affiliate_account_balances IS 'Computed balance per affiliate = SUM(signed movements); payment subtracts, charge/adjustment add per their stored sign (D2). security_invoker=true so it enforces the CALLING user''s RLS on affiliate_account_movements, never bypassing it.';

CREATE OR REPLACE VIEW public.affiliate_payment_status
WITH (security_invoker = true) AS
SELECT
  b.entity_id,
  CASE
    WHEN b.balance > 0 AND w.paid_through < now() THEN 'overdue'
    WHEN b.balance > 0 THEN 'pending'
    ELSE 'current'
  END AS payment_status
FROM public.affiliate_account_balances b
LEFT JOIN public.profiles p ON p.id = b.entity_id
LEFT JOIN public.family_coverage_windows w
  ON (p.family_group_id IS NOT NULL AND w.family_group_id = p.family_group_id)
  OR (p.family_group_id IS NULL AND w.subject_profile_id = p.id)
WHERE b.entity_type = 'affiliate';

COMMENT ON VIEW public.affiliate_payment_status IS 'Derived, read-only payment status per affiliate: overdue (balance>0 and window expired), pending (balance>0, window still valid or no window), current (balance<=0). Replaces the deprecated profiles.payment_status raw write. security_invoker=true.';

GRANT SELECT ON public.affiliate_account_balances TO authenticated;
GRANT SELECT ON public.affiliate_account_balances TO service_role;
GRANT SELECT ON public.affiliate_payment_status TO authenticated;
GRANT SELECT ON public.affiliate_payment_status TO service_role;

-- ── 4. post_billing_charge — atomic invoice upsert + charge movement ──────
CREATE OR REPLACE FUNCTION public.post_billing_charge(
  p_entity_type   TEXT,
  p_entity_id     UUID,
  p_period        TEXT,
  p_amount        DECIMAL(12,2),
  p_external_ref  TEXT
)
RETURNS public.affiliate_account_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice          public.invoices;
  v_movement         public.affiliate_account_movements;
  v_family_group_id  UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Solo administradores pueden emitir cargos de facturacion.';
  END IF;

  IF p_entity_type <> 'affiliate' THEN
    RAISE EXCEPTION 'post_billing_charge solo soporta entity_type=affiliate (recibido: %)', p_entity_type;
  END IF;

  SELECT family_group_id INTO v_family_group_id FROM public.profiles WHERE id = p_entity_id;

  -- Invoice upsert — idempotent per (entity_type, entity_id, period), using
  -- the UNIQUE constraint added in PR1 as the ON CONFLICT arbiter. A $0
  -- charge (bonus month) is issued already 'paid' to preserve fiscal
  -- comprobante continuity without requiring a separate reconciliation.
  INSERT INTO public.invoices (entity_type, entity_id, period, net_amount, tax_amount, total_amount, status)
  VALUES (
    p_entity_type, p_entity_id, p_period, p_amount, 0, p_amount,
    CASE WHEN p_amount = 0 THEN 'paid' ELSE 'issued' END
  )
  ON CONFLICT (entity_type, entity_id, period) DO NOTHING
  RETURNING * INTO v_invoice;

  IF NOT FOUND THEN
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND period = p_period;
  END IF;

  -- Charge movement — idempotent per external_ref (D4 pattern). ON CONFLICT
  -- DO NOTHING RETURNING * returns ZERO rows on conflict, so the existing
  -- row is fetched explicitly via the NOT FOUND fallback SELECT below.
  INSERT INTO public.affiliate_account_movements (entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, created_by)
  VALUES (p_entity_type, p_entity_id, v_family_group_id, 'charge', p_amount, p_external_ref, v_invoice.id, auth.uid())
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING
  RETURNING * INTO v_movement;

  IF NOT FOUND THEN
    SELECT * INTO v_movement
    FROM public.affiliate_account_movements
    WHERE external_ref = p_external_ref;
  END IF;

  RETURN v_movement;
END;
$$;

COMMENT ON FUNCTION public.post_billing_charge IS 'Atomic, idempotent (by external_ref) invoice-upsert + charge-movement posting for a direct affiliate period. Admin-only. Self-heals on re-run: a crash between invoice upsert and movement insert is corrected by the next call for the same period/ref.';

REVOKE EXECUTE ON FUNCTION public.post_billing_charge(TEXT, UUID, TEXT, DECIMAL, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_billing_charge(TEXT, UUID, TEXT, DECIMAL, TEXT) TO authenticated;

-- ── 5. post_payment_movement — atomic payment + invoice paid + reactivate ─
CREATE OR REPLACE FUNCTION public.post_payment_movement(
  p_invoice_id    UUID,
  p_entity_type   TEXT,
  p_entity_id     UUID,
  p_amount        DECIMAL(12,2),
  p_external_ref  TEXT,
  p_source        TEXT DEFAULT NULL
)
RETURNS public.affiliate_account_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice          public.invoices;
  v_movement         public.affiliate_account_movements;
  v_family_group_id  UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Solo administradores pueden conciliar pagos.';
  END IF;

  IF p_entity_type <> 'affiliate' THEN
    RAISE EXCEPTION 'post_payment_movement solo soporta entity_type=affiliate (recibido: %)', p_entity_type;
  END IF;

  IF p_external_ref IS NULL OR p_external_ref = '' THEN
    RAISE EXCEPTION 'post_payment_movement requiere un external_ref no vacio para garantizar idempotencia.';
  END IF;

  -- Row-lock the invoice for the duration of this transaction: without it,
  -- two concurrent calls with DIFFERENT external_refs could both read
  -- status<>'paid', both pass the no-op check below, and both post a
  -- movement for what should be a single settlement.
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura % no encontrada', p_invoice_id;
  END IF;

  SELECT family_group_id INTO v_family_group_id FROM public.profiles WHERE id = p_entity_id;

  -- No-op if the invoice is already paid AND this is the same request being
  -- retried (external_ref matches a movement already posted for it) — no
  -- new movement, no re-flip, no redundant reactivation write. A DIFFERENT
  -- external_ref against an already-paid invoice is a distinct, unexpected
  -- event (e.g. a duplicate/erroneous payment attempt) and must be raised,
  -- never silently dropped or reported back as if it were the request that
  -- was actually submitted.
  IF v_invoice.status = 'paid' THEN
    SELECT * INTO v_movement
    FROM public.affiliate_account_movements
    WHERE external_ref = p_external_ref;
    IF FOUND THEN
      RETURN v_movement;
    END IF;

    RAISE EXCEPTION 'La factura % ya esta paga y no tiene un movimiento con external_ref=%; no se puede conciliar un pago distinto sobre una factura ya cerrada.', p_invoice_id, p_external_ref;
  END IF;

  -- Payment movement — idempotent per external_ref (D4 pattern).
  INSERT INTO public.affiliate_account_movements (entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by)
  VALUES (p_entity_type, p_entity_id, v_family_group_id, 'payment', p_amount, p_external_ref, p_invoice_id, p_source, auth.uid())
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING
  RETURNING * INTO v_movement;

  IF NOT FOUND THEN
    SELECT * INTO v_movement
    FROM public.affiliate_account_movements
    WHERE external_ref = p_external_ref;
  END IF;

  -- Defensive: external_ref is globally unique, but guard against an
  -- app-layer bug reusing a ref across different invoices — never flip a
  -- DIFFERENT invoice's status based on a mismatched movement.
  IF v_movement.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'external_ref % ya pertenece a la factura %, no a %; posible reuso de referencia entre facturas.', p_external_ref, v_movement.invoice_id, p_invoice_id;
  END IF;

  -- Same transaction: flip the invoice AND reactivate the affiliate's plan
  -- status — carries forward what BillingService.reconcileInvoice does
  -- today for entity_type='affiliate', now atomic with the ledger write.
  UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
  UPDATE public.profiles SET plan_status = 'active' WHERE id = p_entity_id;

  RETURN v_movement;
END;
$$;

COMMENT ON FUNCTION public.post_payment_movement IS 'Atomic, idempotent (by external_ref) payment posting for a direct affiliate invoice: payment movement + invoice status=paid + profiles.plan_status=active in one transaction. Admin-only. No-op if the invoice is already paid.';

REVOKE EXECUTE ON FUNCTION public.post_payment_movement(UUID, TEXT, UUID, DECIMAL, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_payment_movement(UUID, TEXT, UUID, DECIMAL, TEXT, TEXT) TO authenticated;

-- ── 6. renew_coverage_window — REPLACED: balance guard + composite return ─
-- Return type changes (public.family_coverage_windows -> the new composite
-- below), so the existing function must be DROPPED first — CREATE OR
-- REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS public.renew_coverage_window(UUID);

DROP TYPE IF EXISTS public.renew_coverage_window_result CASCADE;
CREATE TYPE public.renew_coverage_window_result AS (
  "window"       public.family_coverage_windows,
  is_delinquent  boolean,
  balance_due    numeric
);

COMMENT ON TYPE public.renew_coverage_window_result IS 'renew_coverage_window return shape. Deliberately a single named composite (NOT RETURNS TABLE/SETOF, which would array-wrap the PostgREST response) so callers consume it as one object: data.window.*, data.is_delinquent, data.balance_due. "window" is quoted throughout (reserved keyword).';

CREATE FUNCTION public.renew_coverage_window(p_profile_id UUID)
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

  IF v_profile.family_group_id IS NOT NULL THEN
    SELECT * INTO v_window
    FROM public.family_coverage_windows
    WHERE family_group_id = v_profile.family_group_id;
  ELSE
    SELECT * INTO v_window
    FROM public.family_coverage_windows
    WHERE subject_profile_id = p_profile_id;
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
      monthly_cost_snapshot = v_plan.monthly_cost
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

COMMENT ON FUNCTION public.renew_coverage_window IS 'Explicit, admin-only renewal for an EXPIRED coverage window. Re-derives period/quota/paid-bonus-cost snapshot from the plan currently assigned to the profile and resets consumed quota to zero. Balance-guarded: delinquency_policy.mode=block rejects renewal with balance>0; grace_period (or an unrecognized/NULL mode) completes renewal and flags the composite result with is_delinquent/balance_due. Never automatic, no scheduler.';

REVOKE EXECUTE ON FUNCTION public.renew_coverage_window(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_coverage_window(UUID) TO authenticated;
