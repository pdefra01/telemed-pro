-- Alter availability column in profiles to JSONB type.
-- Previously it was TEXT[], which prevented storing structured JSON objects natively.

alter table profiles alter column availability drop default;

alter table profiles alter column availability type jsonb using '[]'::jsonb;

alter table profiles alter column availability set default '[]'::jsonb;
