-- Description: first-period payment tracking for sign-ups that pay through
-- Mercado Pago Checkout Pro (cash / transfer / Rapipago / link).
-- (odd/mandatory-mp-signup-payment, M3)
--   mp_checkout_preference_id: the Checkout Pro preference created for the request (idempotency).
--   mp_payment_id / payment_status / paid_at: recorded by the `payment` webhook.
-- Only the service role (server) may write them: the public sign-up form inserts
-- adhesion_requests as `anon`, so a trigger blanks these columns for anon and
-- authenticated callers.

ALTER TABLE public.adhesion_requests
  ADD COLUMN IF NOT EXISTS mp_checkout_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id             TEXT,
  ADD COLUMN IF NOT EXISTS payment_status            TEXT,
  ADD COLUMN IF NOT EXISTS paid_at                   TIMESTAMPTZ;

ALTER TABLE public.adhesion_requests
  DROP CONSTRAINT IF EXISTS adhesion_requests_payment_status_check;
ALTER TABLE public.adhesion_requests
  ADD CONSTRAINT adhesion_requests_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.adhesion_requests.mp_checkout_preference_id IS 'Mercado Pago Checkout Pro preference id created for the first-period payment of manual-method sign-ups.';
COMMENT ON COLUMN public.adhesion_requests.mp_payment_id IS 'Mercado Pago payment id that approved the first period (set by the payment webhook).';
COMMENT ON COLUMN public.adhesion_requests.payment_status IS 'First-period Checkout Pro payment status: pending | approved | rejected. NULL when the sign-up does not pay through Checkout.';
COMMENT ON COLUMN public.adhesion_requests.paid_at IS 'When Mercado Pago approved the first-period payment.';

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
    ELSE
      NEW.mp_checkout_preference_id := OLD.mp_checkout_preference_id;
      NEW.mp_payment_id := OLD.mp_payment_id;
      NEW.payment_status := OLD.payment_status;
      NEW.paid_at := OLD.paid_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS adhesion_requests_protect_payment_fields ON public.adhesion_requests;
CREATE TRIGGER adhesion_requests_protect_payment_fields
  BEFORE INSERT OR UPDATE ON public.adhesion_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_adhesion_payment_fields();
