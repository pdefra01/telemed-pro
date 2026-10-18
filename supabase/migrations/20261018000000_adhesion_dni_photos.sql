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
-- working. The trigger runs as the inserting role so current_user tells who
-- is submitting; only the object lookup below is SECURITY DEFINER, because
-- anon has no read access to storage.objects.
create or replace function public.adhesion_dni_photo_count(front_path text, back_path text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from storage.objects
  where bucket_id = 'adhesion-documents' and name in (front_path, back_path);
$$;
revoke execute on function public.adhesion_dni_photo_count(text, text) from public;
grant execute on function public.adhesion_dni_photo_count(text, text) to anon, authenticated;

create or replace function public.require_adhesion_dni_photos()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.titular_dni_front_path is null
    or new.titular_dni_back_path is null
    or new.titular_dni_front_path !~ ('^' || new.id::text || '/front\.(jpg|png|webp)$')
    or new.titular_dni_back_path !~ ('^' || new.id::text || '/back\.(jpg|png|webp)$')
    or public.adhesion_dni_photo_count(new.titular_dni_front_path, new.titular_dni_back_path) <> 2
  ) then
    raise exception 'Las fotos del DNI del titular (frente y dorso) son obligatorias.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists require_adhesion_dni_photos on public.adhesion_requests;
create trigger require_adhesion_dni_photos
before insert on public.adhesion_requests
for each row execute function public.require_adhesion_dni_photos();
