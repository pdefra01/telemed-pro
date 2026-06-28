-- Migration: Add Consultation Duration to Appointments
-- Description: Adds duration_minutes to appointments table to track session length for doctor KPIs.

ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 15;
