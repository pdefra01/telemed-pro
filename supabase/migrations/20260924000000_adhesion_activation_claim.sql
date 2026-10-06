-- Description: activation claim + audit columns for adhesion requests
-- (odd/adhesion-auto-activation, T1).
--   activation_claimed_at: set atomically (guarded by status='pending' and a NULL claim) by
--     server/adhesionActivation.js before creating the auth user, so concurrent activations
--     (auto + admin) create at most one user. Cleared again when a blocking step fails.
--   activated_at / activation_source: when and how the request was activated ('auto' | 'admin').
-- Only the service role (server) may write them: the public sign-up form inserts
-- adhesion_requests as `anon`, so the existing protection trigger blanks them for
-- anon and authenticated callers, like the payment fields.

ALTER TABLE public.adhesion_requests
  ADD COLUMN IF NOT EXISTS activation_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_source     TEXT;

ALTER TABLE public.adhesion_requests
  DROP CONSTRAINT IF EXISTS adhesion_requests_activation_source_check;
ALTER TABLE public.adhesion_requests
  ADD CONSTRAINT adhesion_requests_activation_source_check
  CHECK (activation_source IS NULL OR activation_source IN ('auto', 'admin'));

COMMENT ON COLUMN public.adhesion_requests.activation_claimed_at IS 'Set by the server when an activation attempt claims the pending request; NULL = unclaimed. Prevents concurrent activations from creating two auth users.';
COMMENT ON COLUMN public.adhesion_requests.activated_at IS 'When the request was activated (auth user + profile created and status set to approved).';
COMMENT ON COLUMN public.adhesion_requests.activation_source IS 'How the request was activated: auto (after email verification) | admin (manual approval).';

-- Extends the latest definition (20260920060000) with the activation columns.
CREATE OR REPLACE FUNCTION public.protect_adhesion_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.mp_checkout_preference_id := NULL;
      NEW.mp_payment_id := NULL;
      NEW.payment_status := NULL;
      NEW.paid_at := NULL;
      NEW.mp_paid_amount := NULL;
      NEW.ledger_posted_at := NULL;
      NEW.activation_claimed_at := NULL;
      NEW.activated_at := NULL;
      NEW.activation_source := NULL;
    ELSE
      NEW.mp_checkout_preference_id := OLD.mp_checkout_preference_id;
      NEW.mp_payment_id := OLD.mp_payment_id;
      NEW.payment_status := OLD.payment_status;
      NEW.paid_at := OLD.paid_at;
      NEW.mp_paid_amount := OLD.mp_paid_amount;
      NEW.ledger_posted_at := OLD.ledger_posted_at;
      NEW.activation_claimed_at := OLD.activation_claimed_at;
      NEW.activated_at := OLD.activated_at;
      NEW.activation_source := OLD.activation_source;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
