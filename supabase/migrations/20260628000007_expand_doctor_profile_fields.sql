-- Migration: Expand Doctor Profile Fields & Contractual Dates
-- Description: Adds professional accreditation, contact details, consultation fee, and contractual start/end dates to doctor profiles.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS provincial_license TEXT,
ADD COLUMN IF NOT EXISTS cuit TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS university TEXT,
ADD COLUMN IF NOT EXISTS graduation_year INTEGER,
ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS contract_start_date DATE,
ADD COLUMN IF NOT EXISTS contract_end_date DATE;

COMMENT ON COLUMN public.profiles.provincial_license IS 'Matrícula Provincial del médico.';
COMMENT ON COLUMN public.profiles.cuit IS 'CUIT / Identificación tributaria del médico.';
COMMENT ON COLUMN public.profiles.contract_start_date IS 'Fecha de inicio de la relación laboral / contrato.';
COMMENT ON COLUMN public.profiles.contract_end_date IS 'Fecha de fin de la relación laboral / contrato.';
