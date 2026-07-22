-- Migration: Create lead_survey_responses table
-- Description: Public, anonymous "opinion survey" leads captured via an
-- advisor's own shareable QR/link (mirrors adhesion_requests' public-insert
-- pattern from 20260718000000_create_adhesion_requests.sql), but for a short
-- fixed opinion survey instead of a full patient adhesion application.

create table public.lead_survey_responses (
  id uuid primary key default gen_random_uuid(),
  promoter_code text,
  full_name text not null,
  age integer,
  whatsapp text not null,
  pain_point text not null,
  who_gets_sick_more text not null,
  knew_remote_care boolean not null,
  interested_in_easier_access boolean not null,
  fair_monthly_value numeric not null,
  consent_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.lead_survey_responses (promoter_code);
create index on public.lead_survey_responses (created_at);

alter table public.lead_survey_responses enable row level security;

-- Public lead capture: anyone (including anon) can submit a response.
-- Matches the "Enable public inserts" policy on adhesion_requests
-- (20260718000000_create_adhesion_requests.sql), explicitly scoped here to
-- anon/authenticated for clarity.
create policy "Public can submit lead survey responses"
  on public.lead_survey_responses for insert
  to anon, authenticated
  with check (true);

-- Admins can read everything.
create policy "Admins can view all lead survey responses"
  on public.lead_survey_responses for select
  to authenticated
  using (public.is_admin());

-- An advisor can read only their own submissions, matched via their own
-- profile row (self-readable via auth.uid()) — not a lookup of someone
-- else's row.
create policy "Advisors can view their own lead survey responses"
  on public.lead_survey_responses for select
  to authenticated
  using (promoter_code = (select promoter_code from public.profiles where id = auth.uid()));
