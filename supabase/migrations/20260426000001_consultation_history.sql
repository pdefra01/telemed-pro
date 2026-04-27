-- Migration: Consultation History (Medical Records & Prescriptions)
-- Description: Creates tables for storing clinical documentation and prescriptions.

-- Medical Records Table
CREATE TABLE IF NOT EXISTS public.medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    doctor_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    diagnosis TEXT NOT NULL,
    notes TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'consultation' CHECK (type IN ('consultation', 'emergency', 'checkup')),
    attachments TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prescriptions Table
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    doctor_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiration_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dispensed', 'expired')),
    digital_signature TEXT NOT NULL,
    medications JSONB NOT NULL DEFAULT '[]', -- List of { name, instructions, quantity }
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- Policies for medical_records
CREATE POLICY "Patients can view their own medical records"
ON public.medical_records FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Doctors can view and create medical records"
ON public.medical_records FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor'
));

-- Policies for prescriptions
CREATE POLICY "Patients can view their own prescriptions"
ON public.prescriptions FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Doctors can view and create prescriptions"
ON public.prescriptions FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor'
));

-- Grant access to authenticated users
GRANT ALL ON public.medical_records TO authenticated;
GRANT ALL ON public.prescriptions TO authenticated;
