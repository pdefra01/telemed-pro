-- Migration: Add province and city columns to adhesion_requests and profiles
-- Description: Supports explicit tracking of Province and City for affiliates.

ALTER TABLE public.adhesion_requests
  ADD COLUMN IF NOT EXISTS titular_province TEXT,
  ADD COLUMN IF NOT EXISTS titular_city TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;
