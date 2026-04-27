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

-- 4. Storage Setup (Bucket: medical-documents)
-- Note: This requires the storage extension to be enabled.
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-documents', 'medical-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Policies
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Patients can upload medical documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medical-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow patients to view their own documents
CREATE POLICY "Patients can view their own medical documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'medical-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow doctors to view medical documents (folder must match patient_id)
CREATE POLICY "Doctors can view patient medical documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'medical-documents' AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor'
  )
);

-- 6. Grant permissions
GRANT ALL ON public.medical_documents TO authenticated;
