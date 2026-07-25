-- Migration: Seed default session security policy
-- Description: Inserts the default session security configuration (timeouts and persistence per role)
-- into the system_settings table.

insert into public.system_settings (key, value)
values (
  'session_security_policy',
  '{"admin": {"timeoutMinutes": 15, "persistent": false}, "doctor": {"timeoutMinutes": 30, "persistent": false}, "advisor": {"timeoutMinutes": 30, "persistent": false}, "patient": {"timeoutMinutes": 0, "persistent": true}}'::jsonb
)
on conflict (key)
do update set value = excluded.value;
