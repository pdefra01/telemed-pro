-- Migration: Add family_member_id to medical_documents
-- Description: Links medical documents to individual family members.

ALTER TABLE public.medical_documents
ADD COLUMN family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL;

-- Index for fast query by family member
CREATE INDEX IF NOT EXISTS idx_medical_documents_family_member ON public.medical_documents(family_member_id);
