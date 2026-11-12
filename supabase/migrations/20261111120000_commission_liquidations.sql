-- Migration: advisor commissions and monthly liquidations (odd/tasks/commercial-crm-commissions.md, D1, S2/S3/S5)
--
-- Mechanism (S3):
--   * A sale (approved adhesion request attributed by promoter_id = the promoter_code of the profile that owns it)
--     generates ONE commission when it is confirmed: its affiliate (approved_profile_id) has a positive 'payment'
--     movement in the ledger. confirmed_at = that first payment. Promoter codes are unique and only given to advisors,
--     so the attribution does not filter on the CURRENT role: an advisor promoted later keeps the commissions of the
--     sales made with their code.
--   * KNOWN LIMITATION: the amount (and plan) is a SNAPSHOT taken when the commission is GENERATED (the first
--     liquidation run after the confirmation), not at the confirmation itself: affiliate profile plan_id -> plans
--     .advisor_commission_amount at that moment. A plan or amount change between the confirmation and that run is
--     applied. With no plan the commission is 'excluded' with amount 0 and reason 'Sin plan identificable'.
--   * The admin generates the liquidation of a CLOSED month (Argentina time). Per advisor, a 'draft' liquidation
--     groups the commissions confirmed up to the end of that month that are not in any liquidation yet. A commission
--     whose affiliate has a pending debit rejection (debit_rejection_pending(), S5) is 'retained' and stays out; it is
--     released by a later generation once the rejection is resolved (MP collects, or the affiliate catches up with a
--     manual payment: see debit_rejection_pending below). The approval re-checks every line and retains the ones
--     whose debit was rejected after the generation; including an excluded line whose debit is rejected retains it.
--   * Re-running a month whose liquidation is still 'draft' recalculates it (exclusions are kept). An 'approved' or
--     'paid' liquidation is frozen: a sale confirmed late with a payment date in a frozen month goes to the next
--     generated month, never lost.
--   * The admin may exclude a commission (reason required) while it is unattached or in a draft, and undo it.
--     Approval: draft -> approved (commissions 'approved'). Payment: approved -> paid with date, method, reference.
--   * No clawback (paid stays paid) and no supervisor commission.
--   * Concurrency: every write function (generate, exclude, include, approve, pay) takes the same transaction
--     advisory lock ('public.commission_writes') before reading any state, so they run one at a time, and locks
--     the rows it reads to then write (FOR UPDATE), re-checking their status inside the locked section.
--
-- Status of a commission: generated | retained | approved | excluded | paid.
-- Status of a liquidation: draft | approved | paid.
--
-- Security: both tables are read-only for API roles (RLS: advisor own, supervisor team via is_supervisor_of, admin
-- all). Every write goes through the SECURITY DEFINER functions below, which check is_admin() themselves.
-- No foreign keys to profiles / adhesion_requests on purpose: these are money records and must survive (and never
-- block) the deletion of a user or a request; the ids are kept as audit references.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_liquidations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id        UUID NOT NULL,
  month             DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  retained_amount   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (retained_amount >= 0),
  retained_count    INTEGER NOT NULL DEFAULT 0 CHECK (retained_count >= 0),
  approved_at       TIMESTAMPTZ,
  approved_by       UUID,
  paid_at           DATE,
  paid_by           UUID,
  payment_method    TEXT,
  payment_reference TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commission_liquidations_advisor_month_key UNIQUE (advisor_id, month),
  CONSTRAINT commission_liquidations_approved_check CHECK (status = 'draft' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)),
  CONSTRAINT commission_liquidations_paid_check CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND paid_by IS NOT NULL AND payment_method IS NOT NULL))
);

COMMENT ON TABLE public.commission_liquidations IS 'Monthly commission liquidation per advisor (S3). draft -> approved -> paid; approved and paid are frozen. Written only by the commission functions.';
COMMENT ON COLUMN public.commission_liquidations.month IS 'First day of the liquidated month (Argentina time).';
COMMENT ON COLUMN public.commission_liquidations.total_amount IS 'Sum of the included (not excluded, not retained) commissions.';
COMMENT ON COLUMN public.commission_liquidations.retained_amount IS 'Informative: the advisor''s retained commissions (debit rejected) confirmed up to the end of the month, at the last calculation.';

CREATE TABLE IF NOT EXISTS public.advisor_commissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id           UUID NOT NULL,
  adhesion_request_id  UUID NOT NULL,
  affiliate_profile_id UUID NOT NULL,
  plan_id              UUID,
  amount               NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  confirmed_at         TIMESTAMPTZ NOT NULL,
  status               TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'retained', 'approved', 'excluded', 'paid')),
  liquidation_id       UUID REFERENCES public.commission_liquidations(id),
  exclusion_reason     TEXT,
  retained_reason      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT advisor_commissions_adhesion_request_key UNIQUE (adhesion_request_id),
  CONSTRAINT advisor_commissions_excluded_check CHECK (status <> 'excluded' OR exclusion_reason IS NOT NULL),
  CONSTRAINT advisor_commissions_retained_check CHECK (status <> 'retained' OR (retained_reason IS NOT NULL AND liquidation_id IS NULL)),
  CONSTRAINT advisor_commissions_settled_check CHECK (status NOT IN ('approved', 'paid') OR liquidation_id IS NOT NULL)
);

COMMENT ON TABLE public.advisor_commissions IS 'One commission per confirmed sale (S3). amount is a snapshot of plans.advisor_commission_amount at generation. Written only by the commission functions.';
COMMENT ON COLUMN public.advisor_commissions.confirmed_at IS 'First positive ledger payment of the affiliate: the moment the sale is confirmed.';

CREATE INDEX IF NOT EXISTS advisor_commissions_advisor_idx ON public.advisor_commissions (advisor_id, status);
CREATE INDEX IF NOT EXISTS advisor_commissions_liquidation_idx ON public.advisor_commissions (liquidation_id);
CREATE INDEX IF NOT EXISTS commission_liquidations_month_idx ON public.commission_liquidations (month, status);

CREATE OR REPLACE FUNCTION public.touch_commission_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_commission_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS touch_advisor_commissions_updated_at ON public.advisor_commissions;
CREATE TRIGGER touch_advisor_commissions_updated_at BEFORE UPDATE ON public.advisor_commissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_commission_updated_at();
DROP TRIGGER IF EXISTS touch_commission_liquidations_updated_at ON public.commission_liquidations;
CREATE TRIGGER touch_commission_liquidations_updated_at BEFORE UPDATE ON public.commission_liquidations
  FOR EACH ROW EXECUTE FUNCTION public.touch_commission_updated_at();

-- ── Read access: RLS, SELECT only ───────────────────────────────────────────
ALTER TABLE public.advisor_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_liquidations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Commission readers" ON public.advisor_commissions;
CREATE POLICY "Commission readers"
  ON public.advisor_commissions FOR SELECT TO authenticated
  USING (advisor_id = auth.uid() OR public.is_supervisor_of(advisor_id) OR public.is_admin());

DROP POLICY IF EXISTS "Liquidation readers" ON public.commission_liquidations;
CREATE POLICY "Liquidation readers"
  ON public.commission_liquidations FOR SELECT TO authenticated
  USING (advisor_id = auth.uid() OR public.is_supervisor_of(advisor_id) OR public.is_admin());

-- Supabase default privileges grant everything to the API roles: take it back explicitly.
REVOKE ALL ON public.advisor_commissions, public.commission_liquidations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.advisor_commissions, public.commission_liquidations FROM authenticated;
GRANT SELECT ON public.advisor_commissions, public.commission_liquidations TO authenticated;

-- ── S5 rule, refined: a manual catch-up resolves a rejection ───────────────
-- Same signature and grants as 20261111110000. A payment_failed or cancelled subscription is no longer pending when a
-- positive 'payment' movement (amount > 0, as the generation counts a confirmed sale) was created after its
-- last_failure_at (the affiliate caught up: S3 "MP collects or the affiliate catches up"); a 0-amount row proves nothing. This also clears the "Débito rechazado" mark in
-- Cobranzas and the Padrón in that case. A payment_failed row without last_failure_at stays pending.
CREATE OR REPLACE FUNCTION public.debit_rejection_pending(
  p_profile_id      UUID,
  p_status          TEXT,
  p_last_failure_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status IN ('payment_failed', 'cancelled') AND p_last_failure_at IS NOT NULL THEN NOT EXISTS (
      SELECT 1 FROM public.affiliate_account_movements m
       WHERE m.entity_type = 'affiliate'
         AND m.entity_id = p_profile_id
         AND m.type = 'payment'
         AND m.amount > 0
         AND m.created_at > p_last_failure_at)
    WHEN p_status = 'payment_failed' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.debit_rejection_pending IS 'Débito rechazado rule (S5): the current subscription is payment_failed or cancelled after a rejection, with no positive payment movement created since the last rejection (a payment_failed row without a rejection date is always pending).';

REVOKE ALL ON FUNCTION public.debit_rejection_pending(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.debit_rejection_pending(UUID, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

-- ── Internal: is the affiliate's current debit rejected? ────────────────────
-- The current subscription is the newest non-reservation row (as advisor_collections and admin_debit_rejections).
CREATE OR REPLACE FUNCTION public.commission_debit_pending(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.debit_rejection_pending(p_profile_id, s.status, s.last_failure_at)
      FROM public.affiliate_payment_subscriptions s
     WHERE s.profile_id = p_profile_id AND s.status <> 'pending'
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT 1), false);
$$;
REVOKE ALL ON FUNCTION public.commission_debit_pending(UUID) FROM PUBLIC, anon, authenticated;

-- ── Internal: recompute a draft liquidation ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_commission_liquidation(p_liquidation_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.commission_liquidations l
     SET total_amount = COALESCE((
           SELECT sum(c.amount) FROM public.advisor_commissions c
            WHERE c.liquidation_id = l.id AND c.status IN ('generated', 'approved', 'paid')), 0),
         retained_amount = COALESCE((
           SELECT sum(c.amount) FROM public.advisor_commissions c
            WHERE c.advisor_id = l.advisor_id AND c.status = 'retained'
              AND c.confirmed_at < ((l.month + interval '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')), 0),
         retained_count = (
           SELECT count(*) FROM public.advisor_commissions c
            WHERE c.advisor_id = l.advisor_id AND c.status = 'retained'
              AND c.confirmed_at < ((l.month + interval '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))
   WHERE l.id = p_liquidation_id AND l.status = 'draft';
$$;
REVOKE ALL ON FUNCTION public.recompute_commission_liquidation(UUID) FROM PUBLIC, anon, authenticated;

-- ── Generation ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_commission_liquidations(p_month DATE)
RETURNS TABLE (
  advisors             INTEGER,
  commissions_attached INTEGER,
  retained_count       INTEGER,
  total_amount         NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_tz    CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_month DATE;
  v_end   TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede generar liquidaciones de comisiones' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'El mes a liquidar es obligatorio';
  END IF;
  v_month := date_trunc('month', p_month)::date;
  IF v_month >= date_trunc('month', now() AT TIME ZONE v_tz)::date THEN
    RAISE EXCEPTION 'Solo se liquidan meses cerrados: % todavía no cerró', to_char(v_month, 'MM/YYYY');
  END IF;
  -- the instant the month ends in Argentina
  v_end := (v_month + interval '1 month')::timestamp AT TIME ZONE v_tz;

  -- one commission write at a time (shared with exclude, include, approve and pay)
  PERFORM pg_advisory_xact_lock(hashtext('public.commission_writes'));

  -- 1. A commission per confirmed sale not recorded yet (amount snapshot of the plan).
  INSERT INTO public.advisor_commissions
    (advisor_id, adhesion_request_id, affiliate_profile_id, plan_id, amount, confirmed_at, status, exclusion_reason)
  SELECT a.id, ar.id, ar.approved_profile_id, pl.id,
         COALESCE(pl.advisor_commission_amount, 0),
         fp.paid_at,
         CASE WHEN pl.id IS NULL THEN 'excluded' ELSE 'generated' END,
         CASE WHEN pl.id IS NULL THEN 'Sin plan identificable' END
    FROM public.adhesion_requests ar
    JOIN public.profiles a ON a.promoter_code = ar.promoter_id
    JOIN LATERAL (
      SELECT min(m.created_at) AS paid_at
        FROM public.affiliate_account_movements m
       WHERE m.entity_type = 'affiliate' AND m.entity_id = ar.approved_profile_id
         AND m.type = 'payment' AND m.amount > 0
    ) fp ON fp.paid_at IS NOT NULL
    LEFT JOIN public.profiles ap ON ap.id = ar.approved_profile_id
    LEFT JOIN public.plans pl ON pl.id = ap.plan_id
   WHERE ar.status = 'approved'
     AND ar.approved_profile_id IS NOT NULL
     AND fp.paid_at < v_end
  ON CONFLICT (adhesion_request_id) DO NOTHING;

  -- 2. This month's drafts are recalculated from scratch (exclusions stay attached).
  UPDATE public.advisor_commissions c
     SET liquidation_id = NULL
    FROM public.commission_liquidations l
   WHERE c.liquidation_id = l.id AND l.month = v_month AND l.status = 'draft' AND c.status = 'generated';

  -- 3. Retention (S5) for the open commissions of advisors whose month is not frozen.
  UPDATE public.advisor_commissions c
     SET status          = CASE WHEN r.pending THEN 'retained' ELSE 'generated' END,
         retained_reason = CASE WHEN r.pending THEN 'Débito rechazado' END
    FROM (
      SELECT o.id, public.commission_debit_pending(o.affiliate_profile_id) AS pending
        FROM public.advisor_commissions o
       WHERE o.status IN ('generated', 'retained')
         AND o.liquidation_id IS NULL
         AND o.confirmed_at < v_end
         AND NOT EXISTS (SELECT 1 FROM public.commission_liquidations f
                          WHERE f.advisor_id = o.advisor_id AND f.month = v_month AND f.status <> 'draft')
    ) r
   WHERE c.id = r.id;

  -- 4. A draft for every advisor with something to attach, then attach.
  INSERT INTO public.commission_liquidations (advisor_id, month)
  SELECT DISTINCT c.advisor_id, v_month
    FROM public.advisor_commissions c
   WHERE c.liquidation_id IS NULL
     AND c.status IN ('generated', 'excluded')
     AND c.confirmed_at < v_end
  ON CONFLICT (advisor_id, month) DO NOTHING;

  UPDATE public.advisor_commissions c
     SET liquidation_id = l.id
    FROM public.commission_liquidations l
   WHERE l.advisor_id = c.advisor_id AND l.month = v_month AND l.status = 'draft'
     AND c.liquidation_id IS NULL
     AND c.status IN ('generated', 'excluded')
     AND c.confirmed_at < v_end;

  DELETE FROM public.commission_liquidations l
   WHERE l.month = v_month AND l.status = 'draft'
     AND NOT EXISTS (SELECT 1 FROM public.advisor_commissions c WHERE c.liquidation_id = l.id);

  -- 5. Totals.
  PERFORM public.recompute_commission_liquidation(l.id)
     FROM public.commission_liquidations l
    WHERE l.month = v_month AND l.status = 'draft';

  RETURN QUERY
  SELECT count(*)::integer,
         COALESCE((SELECT count(*) FROM public.advisor_commissions c
                    JOIN public.commission_liquidations d ON d.id = c.liquidation_id
                   WHERE d.month = v_month AND d.status = 'draft' AND c.status = 'generated'), 0)::integer,
         COALESCE((SELECT count(*) FROM public.advisor_commissions c
                   WHERE c.status = 'retained' AND c.confirmed_at < v_end
                     AND NOT EXISTS (SELECT 1 FROM public.commission_liquidations f
                                      WHERE f.advisor_id = c.advisor_id AND f.month = v_month AND f.status <> 'draft')), 0)::integer,
         COALESCE(sum(l.total_amount), 0)::numeric
    FROM public.commission_liquidations l
   WHERE l.month = v_month AND l.status = 'draft';
END;
$$;

COMMENT ON FUNCTION public.generate_commission_liquidations(DATE) IS 'Admin only. Generates (or recalculates while draft) the commission liquidations of a closed month (Argentina time). Returns advisors, commissions attached, retained and total of the month''s drafts.';

-- ── Exclusion ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exclude_commission(p_commission_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission public.advisor_commissions%ROWTYPE;
  v_status     TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede excluir comisiones' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de la exclusión es obligatorio';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.commission_writes'));

  SELECT * INTO v_commission FROM public.advisor_commissions WHERE id = p_commission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La comisión no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_commission.liquidation_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.commission_liquidations WHERE id = v_commission.liquidation_id FOR UPDATE;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'La comisión pertenece a una liquidación ya aprobada';
    END IF;
  END IF;
  IF v_commission.status NOT IN ('generated', 'retained') THEN
    RAISE EXCEPTION 'Solo se excluye una comisión generada o retenida (estado actual: %)', v_commission.status;
  END IF;

  UPDATE public.advisor_commissions
     SET status = 'excluded', exclusion_reason = btrim(p_reason), retained_reason = NULL
   WHERE id = p_commission_id;

  IF v_commission.liquidation_id IS NOT NULL THEN
    PERFORM public.recompute_commission_liquidation(v_commission.liquidation_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.exclude_commission(UUID, TEXT) IS 'Admin only. Excludes a generated or retained commission (reason required) while it is unattached or in a draft liquidation.';

CREATE OR REPLACE FUNCTION public.include_commission(p_commission_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission public.advisor_commissions%ROWTYPE;
  v_status     TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede incluir comisiones' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.commission_writes'));

  SELECT * INTO v_commission FROM public.advisor_commissions WHERE id = p_commission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La comisión no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_commission.liquidation_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.commission_liquidations WHERE id = v_commission.liquidation_id FOR UPDATE;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'La comisión pertenece a una liquidación ya aprobada';
    END IF;
  END IF;
  IF v_commission.status <> 'excluded' THEN
    RAISE EXCEPTION 'La comisión no está excluida';
  END IF;
  IF v_commission.plan_id IS NULL THEN
    RAISE EXCEPTION 'La venta no tiene un plan identificable: no hay comisión que incluir';
  END IF;

  IF public.commission_debit_pending(v_commission.affiliate_profile_id) THEN
    -- the debit is still rejected: back to retained, out of any liquidation
    UPDATE public.advisor_commissions
       SET status = 'retained', exclusion_reason = NULL, retained_reason = 'Débito rechazado', liquidation_id = NULL
     WHERE id = p_commission_id;
  ELSE
    UPDATE public.advisor_commissions
       SET status = 'generated', exclusion_reason = NULL
     WHERE id = p_commission_id;
  END IF;

  IF v_commission.liquidation_id IS NOT NULL THEN
    PERFORM public.recompute_commission_liquidation(v_commission.liquidation_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.include_commission(UUID) IS 'Admin only. Undoes an exclusion while the commission is unattached or in a draft liquidation; if the affiliate''s debit is rejected the commission goes back to retained (out of the liquidation).';

-- ── Approval and payment ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_commission_liquidation(p_liquidation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar liquidaciones' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.commission_writes'));

  SELECT status INTO v_status FROM public.commission_liquidations WHERE id = p_liquidation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La liquidación no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Solo se aprueba una liquidación en borrador (estado actual: %)', v_status;
  END IF;
  PERFORM 1 FROM public.advisor_commissions WHERE liquidation_id = p_liquidation_id FOR UPDATE;

  -- S5: a line whose debit was rejected after the generation is retained, not approved
  UPDATE public.advisor_commissions
     SET status = 'retained', retained_reason = 'Débito rechazado', liquidation_id = NULL
   WHERE liquidation_id = p_liquidation_id AND status = 'generated'
     AND public.commission_debit_pending(affiliate_profile_id);

  PERFORM public.recompute_commission_liquidation(p_liquidation_id);

  UPDATE public.advisor_commissions
     SET status = 'approved'
   WHERE liquidation_id = p_liquidation_id AND status = 'generated';

  UPDATE public.commission_liquidations
     SET status = 'approved', approved_at = now(), approved_by = auth.uid()
   WHERE id = p_liquidation_id;
END;
$$;

COMMENT ON FUNCTION public.approve_commission_liquidation(UUID) IS 'Admin only. draft -> approved; lines whose debit is rejected are retained first, the rest become approved. Frozen from then on.';

CREATE OR REPLACE FUNCTION public.pay_commission_liquidation(
  p_liquidation_id UUID,
  p_paid_at        DATE,
  p_method         TEXT,
  p_reference      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar el pago de una liquidación' USING ERRCODE = '42501';
  END IF;
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'La fecha de pago es obligatoria';
  END IF;
  IF NULLIF(btrim(p_method), '') IS NULL THEN
    RAISE EXCEPTION 'El medio de pago es obligatorio';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.commission_writes'));

  SELECT status INTO v_status FROM public.commission_liquidations WHERE id = p_liquidation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La liquidación no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Solo se paga una liquidación aprobada (estado actual: %)', v_status;
  END IF;

  UPDATE public.advisor_commissions
     SET status = 'paid'
   WHERE liquidation_id = p_liquidation_id AND status = 'approved';

  UPDATE public.commission_liquidations
     SET status = 'paid', paid_at = p_paid_at, paid_by = auth.uid(),
         payment_method = btrim(p_method), payment_reference = NULLIF(btrim(p_reference), '')
   WHERE id = p_liquidation_id;
END;
$$;

COMMENT ON FUNCTION public.pay_commission_liquidation(UUID, DATE, TEXT, TEXT) IS 'Admin only. approved -> paid, recording date, method (required) and reference; its commissions become paid. No clawback afterwards.';

-- ── Reads for the UI ────────────────────────────────────────────────────────
-- Per advisor: generated (not approved yet) / retained / approved to collect / collected (all time).
-- The advisors are the profiles with role 'advisor' plus anyone who owns commissions (a promoted advisor, or a
-- deleted profile: then the name is the stored id).
CREATE OR REPLACE FUNCTION public.advisor_commission_summary()
RETURNS TABLE (
  advisor_id        UUID,
  advisor_name      TEXT,
  generated_amount  NUMERIC,
  generated_count   BIGINT,
  retained_amount   NUMERIC,
  retained_count    BIGINT,
  to_collect_amount NUMERIC,
  to_collect_count  BIGINT,
  collected_amount  NUMERIC,
  collected_count   BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owners AS (
    SELECT p.id FROM public.profiles p WHERE p.role = 'advisor'
    UNION
    SELECT DISTINCT c.advisor_id FROM public.advisor_commissions c
  )
  SELECT o.id,
         COALESCE(v.full_name::text, o.id::text),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'generated'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'generated'),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'retained'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'retained'),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'approved'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'approved'),
         COALESCE(sum(c.amount) FILTER (WHERE c.status = 'paid'), 0)::numeric,
         count(c.id) FILTER (WHERE c.status = 'paid')
    FROM owners o
    LEFT JOIN public.profiles v ON v.id = o.id
    LEFT JOIN public.advisor_commissions c ON c.advisor_id = o.id
   WHERE o.id = auth.uid() OR public.is_supervisor_of(o.id) OR public.is_admin()
   GROUP BY o.id, v.full_name
   ORDER BY 2, 1;
$$;

COMMENT ON FUNCTION public.advisor_commission_summary() IS 'Commission summary per advisor (S3): generated, retained, approved to collect, collected. Scope: own (advisor), team (supervisor), all (admin).';

-- Commission detail with affiliate and plan names (same scope), optionally narrowed to one liquidation, one advisor
-- and/or the commissions in no liquidation (retained, excluded or not liquidated yet). The filters only narrow the
-- scope, never widen it. Ordered by a unique key so the client can page through it.
CREATE OR REPLACE FUNCTION public.advisor_commission_list(
  p_liquidation_id  UUID    DEFAULT NULL,
  p_advisor_id      UUID    DEFAULT NULL,
  p_unattached_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id                   UUID,
  advisor_id           UUID,
  advisor_name         TEXT,
  affiliate_profile_id UUID,
  affiliate_name       TEXT,
  plan_id              UUID,
  plan_name            TEXT,
  amount               NUMERIC,
  confirmed_at         TIMESTAMPTZ,
  status               TEXT,
  exclusion_reason     TEXT,
  retained_reason      TEXT,
  liquidation_id       UUID,
  liquidation_month    DATE,
  liquidation_status   TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- LEFT JOIN: a deleted advisor's commissions still show, named by their stored id
  SELECT c.id, c.advisor_id, COALESCE(v.full_name::text, c.advisor_id::text), c.affiliate_profile_id, ap.full_name::text,
         c.plan_id, pl.name::text, c.amount, c.confirmed_at, c.status, c.exclusion_reason, c.retained_reason,
         c.liquidation_id, l.month, l.status
    FROM public.advisor_commissions c
    LEFT JOIN public.profiles v ON v.id = c.advisor_id
    LEFT JOIN public.profiles ap ON ap.id = c.affiliate_profile_id
    LEFT JOIN public.plans pl ON pl.id = c.plan_id
    LEFT JOIN public.commission_liquidations l ON l.id = c.liquidation_id
   WHERE (c.advisor_id = auth.uid() OR public.is_supervisor_of(c.advisor_id) OR public.is_admin())
     AND (p_liquidation_id IS NULL OR c.liquidation_id = p_liquidation_id)
     AND (p_advisor_id IS NULL OR c.advisor_id = p_advisor_id)
     AND (NOT COALESCE(p_unattached_only, false) OR c.liquidation_id IS NULL)
   ORDER BY 3, c.confirmed_at, c.id;
$$;

COMMENT ON FUNCTION public.advisor_commission_list(UUID, UUID, BOOLEAN) IS 'Commissions with affiliate and plan names, optionally of one liquidation, one advisor and/or only unattached. Scope: own (advisor), team (supervisor), all (admin).';

-- ── Function privileges ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.generate_commission_liquidations(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exclude_commission(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.include_commission(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_commission_liquidation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_commission_liquidation(UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advisor_commission_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advisor_commission_list(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.generate_commission_liquidations(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exclude_commission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.include_commission(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_commission_liquidation(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_commission_liquidation(UUID, DATE, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_commission_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_commission_list(UUID, UUID, BOOLEAN) TO authenticated, service_role;
