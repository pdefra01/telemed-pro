-- Migration: adhesion_dni_photos
-- Description: The public adhesion form (anon, no session) now requires the
--   titular's DNI photo, front and back. The files are identity documents, so
--   they live in a PRIVATE bucket with no anon policy at all: the browser
--   uploads only through one-time signed upload URLs issued by the server
--   (POST /api/adhesion/dni-upload-urls, rate-limited per IP), and only admins
--   can read them, through signed URLs, from the adhesion review modal.
--   Object names are `<adhesion_request_id>/(front|back).(jpg|png|webp)`; the
--   server reserves the id before the row insert, so the folder is the only
--   link between the files and the row. server/adhesionDniPhotos.js sweeps
--   folders that never got a row.
--   No NOT NULL / CHECK on the new columns: existing rows have no photos and a
--   NOT VALID check would still reject admin UPDATEs (approve/reject) on them.
--   The requirement is enforced in AdhesionRepository.submitApplication.

ALTER TABLE public.adhesion_requests ADD COLUMN IF NOT EXISTS titular_dni_front_path TEXT;
ALTER TABLE public.adhesion_requests ADD COLUMN IF NOT EXISTS titular_dni_back_path TEXT;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adhesion-documents', 'adhesion-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated write policy: signed upload URLs bypass RLS, so the
-- server is the only gate for writes.
drop policy if exists "Public can upload adhesion DNI photos" on storage.objects;

drop policy if exists "Admins can view adhesion DNI photos" on storage.objects;
create policy "Admins can view adhesion DNI photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'adhesion-documents'
  and public.is_admin()
);

-- Public submissions (anon/authenticated, the form's only insert path) must
-- carry both photos, stored under the row's own folder and actually uploaded.
-- Server-side roles (service role, postgres: seeds, tests, backfills) are not
-- constrained. INSERT only, so admin approve/reject UPDATEs on older rows keep
-- working. SECURITY DEFINER so the trigger can look up storage.objects, which
-- anon cannot read; the submitting role comes from the `role` setting (the
-- one PostgREST sets with SET ROLE), which a definer function does not change,
-- unlike current_user. No helper is exposed, so anon gets no RPC to probe
-- which objects exist.
create or replace function public.require_adhesion_dni_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role') in ('anon', 'authenticated') and (
    new.titular_dni_front_path is null
    or new.titular_dni_back_path is null
    or new.titular_dni_front_path !~ ('^' || new.id::text || '/front\.(jpg|png|webp)$')
    or new.titular_dni_back_path !~ ('^' || new.id::text || '/back\.(jpg|png|webp)$')
    or (
      select count(*) from storage.objects
      where bucket_id = 'adhesion-documents'
        and name in (new.titular_dni_front_path, new.titular_dni_back_path)
    ) <> 2
  ) then
    raise exception 'Las fotos del DNI del titular (frente y dorso) son obligatorias.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.require_adhesion_dni_photos() from public, anon, authenticated;

drop trigger if exists require_adhesion_dni_photos on public.adhesion_requests;
create trigger require_adhesion_dni_photos
before insert on public.adhesion_requests
for each row execute function public.require_adhesion_dni_photos();
