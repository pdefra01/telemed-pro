-- Migration: RLS policies for the medical-documents storage bucket
-- Description: The medical_documents table has had RLS since
-- 20260426000004_medical_documents.sql, but storage.objects (where the actual
-- file bytes live) never got its own policies — that migration explicitly
-- skipped it ("Storage service is disabled in config.toml", a local-dev-only
-- setting). The bucket exists in production, but with RLS enabled and no
-- policy, every upload is rejected: "new row violates row-level security
-- policy". This adds the missing policies, mirroring the folder convention
-- MedicalDocumentRepository.uploadDocument() already uses (`${patientId}/${fileName}`)
-- and the permissiveness already established on the medical_documents table
-- itself (patients see only their own row, any doctor sees every row).

-- Idempotent: the bucket already exists in production, this is a no-op there.
insert into storage.buckets (id, name, public)
values ('medical-documents', 'medical-documents', true)
on conflict (id) do nothing;

-- Idempotent: a prior partial/manual attempt on this bucket left at least one
-- of these policy names already in place in production (discovered when the
-- first version of this migration hit "policy already exists" mid-run) — drop
-- before create so this is safely re-runnable regardless of what survived.

drop policy if exists "Patients can upload their own medical documents" on storage.objects;
create policy "Patients can upload their own medical documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'medical-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Patients can view their own medical documents" on storage.objects;
create policy "Patients can view their own medical documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'medical-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Mirrors "Doctors can view patient documents" on the medical_documents table
-- (any doctor, not just the patient's assigned one — same scope as today).
drop policy if exists "Doctors can view all medical documents" on storage.objects;
create policy "Doctors can view all medical documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'medical-documents'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'doctor'
  )
);

-- Supports the cleanup-on-failure path in uploadDocument(), which removes the
-- just-uploaded file if the medical_documents DB insert fails afterward.
drop policy if exists "Patients can delete their own medical documents" on storage.objects;
create policy "Patients can delete their own medical documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'medical-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
