-- Migration: Medical Documents & Storage Setup
-- Description: Creates table for storing medical documents and configures Supabase Storage bucket.

-- 1. Create Medical Documents Table
CREATE TABLE IF NOT EXISTS public.medical_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('lab_result', 'imaging', 'certificate', 'other')),
    url TEXT NOT NULL,
    uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('patient', 'doctor')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.medical_documents ENABLE ROW LEVEL SECURITY;

-- 3. Policies for medical_documents
CREATE POLICY "Patients can view their own documents"
ON public.medical_documents FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Patients can upload their own documents"
ON public.medical_documents FOR INSERT
WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Doctors can view patient documents"
ON public.medical_documents FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor'
));

-- 4. Storage Setup (Bucket: medical-documents) and Storage Policies are disabled because Storage service is disabled in config.toml

-- 6. Grant permissions
GRANT ALL ON public.medical_documents TO authenticated;
