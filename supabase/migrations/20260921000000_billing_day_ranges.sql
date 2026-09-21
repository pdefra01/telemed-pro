-- Migration: Billing day ranges
-- Description: The sign-up form offers two ranges instead of day 1 / day 10:
--   1 to 10  (active employees) -> charged on day 10
--   10 to 20 (retirees)         -> charged on day 20
-- Only replaces the seeded default; a value an admin already customized is kept.
UPDATE public.system_settings
SET value = '[10, 20]'::jsonb
WHERE key = 'debit_billing_days'
  AND value = '[1, 10]'::jsonb;
