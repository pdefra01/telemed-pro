-- Migration: 20260804010000_debit_billing_days_setting.sql
-- Description: Expand billing day range to 1-28 and seed debit_billing_days in system_settings

-- 1. Relax CHECK constraint on adhesion_requests.preferred_billing_day to allow 1-28
ALTER TABLE public.adhesion_requests
DROP CONSTRAINT IF EXISTS adhesion_requests_preferred_billing_day_check;

ALTER TABLE public.adhesion_requests
ADD CONSTRAINT adhesion_requests_preferred_billing_day_check
CHECK (preferred_billing_day BETWEEN 1 AND 28);

-- 2. Relax CHECK constraint on affiliate_payment_subscriptions.billing_day to allow 1-28
ALTER TABLE public.affiliate_payment_subscriptions
DROP CONSTRAINT IF EXISTS affiliate_payment_subscriptions_billing_day_check;

ALTER TABLE public.affiliate_payment_subscriptions
ADD CONSTRAINT affiliate_payment_subscriptions_billing_day_check
CHECK (billing_day BETWEEN 1 AND 28);

-- 3. Seed default available debit billing days in system_settings
INSERT INTO public.system_settings (key, value)
VALUES ('debit_billing_days', '[1, 10]'::jsonb)
ON CONFLICT (key) DO NOTHING;
