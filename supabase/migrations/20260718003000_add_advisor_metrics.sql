-- Migration: Add Links Shared Count to Producers
-- Description: Adds links_shared_count column to public.producers to track advisor sharing productivity metrics.

ALTER TABLE public.producers ADD COLUMN IF NOT EXISTS links_shared_count INTEGER NOT NULL DEFAULT 0;
