-- Migration: Doctor Work Shifts and Office Locations Whitelist
-- Description: Creates tables for office locations IP whitelist and doctor work shifts tracking.

-- 1. Office Locations Table
CREATE TABLE IF NOT EXISTS public.office_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  public_ip TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Doctor Work Shifts Table
CREATE TABLE IF NOT EXISTS public.doctor_work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  office_location_id UUID REFERENCES public.office_locations(id) ON DELETE SET NULL,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out TIMESTAMPTZ,
  duration_minutes INTEGER,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.office_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_work_shifts ENABLE ROW LEVEL SECURITY;

-- Permissive Policies for Demo/Dev
CREATE POLICY "Allow all read office_locations" ON public.office_locations FOR SELECT USING (true);
CREATE POLICY "Allow all write office_locations" ON public.office_locations FOR ALL USING (true);

CREATE POLICY "Allow all read doctor_work_shifts" ON public.doctor_work_shifts FOR SELECT USING (true);
CREATE POLICY "Allow all write doctor_work_shifts" ON public.doctor_work_shifts FOR ALL USING (true);

-- Seed Initial Office Location
INSERT INTO public.office_locations (name, public_ip, is_active)
VALUES 
  ('Oficina Central', '127.0.0.1', TRUE),
  ('Sucursal Desarrollo (LAN)', '192.168.0.141', TRUE)
ON CONFLICT DO NOTHING;
