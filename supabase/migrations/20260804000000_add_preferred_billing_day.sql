-- Migration: 20260804000000_add_preferred_billing_day.sql
-- Description: Adds preferred_billing_day to adhesion_requests and billing_day to affiliate_payment_subscriptions

ALTER TABLE public.adhesion_requests
ADD COLUMN IF NOT EXISTS preferred_billing_day INT DEFAULT 10 CHECK (preferred_billing_day IN (1, 10));

COMMENT ON COLUMN public.adhesion_requests.preferred_billing_day IS 'Preferred day of month (1 or 10) for automatic debit charge via Mercado Pago.';

ALTER TABLE public.affiliate_payment_subscriptions
ADD COLUMN IF NOT EXISTS billing_day INT DEFAULT 10 CHECK (billing_day IN (1, 10));

COMMENT ON COLUMN public.affiliate_payment_subscriptions.billing_day IS 'Configured day of month (1 or 10) for recurring Mercado Pago debit charges.';
