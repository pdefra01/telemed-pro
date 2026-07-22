-- Migration: GPS-based geofence for doctor clock-in
-- Description: Replaces the office public-IP whitelist (broken by ISP IP rotation on
-- non-static residential/small-business connections) with a GPS lat/lng + radius check.

alter table public.office_locations
  add column latitude double precision,
  add column longitude double precision,
  add column radius_meters integer not null default 150;

alter table public.office_locations
  drop column public_ip;
