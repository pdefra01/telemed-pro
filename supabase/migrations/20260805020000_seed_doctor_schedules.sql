-- Seed doctor schedules with the new DaySchedule[] format.
-- day values follow JS Date.getDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
--
-- Franco Aguirre   : Mon–Sat  08:00–13:00
-- Milagros Morales : Mon/Wed/Fri  14:00–19:00
-- Lourdes Flores   : Tue/Thu  14:00–19:00

-- ── Franco Aguirre ───────────────────────────────────────────────────────────
update profiles
set availability = '[
  {"day":1,"slots":["08:00","09:00","10:00","11:00","12:00","13:00"]},
  {"day":2,"slots":["08:00","09:00","10:00","11:00","12:00","13:00"]},
  {"day":3,"slots":["08:00","09:00","10:00","11:00","12:00","13:00"]},
  {"day":4,"slots":["08:00","09:00","10:00","11:00","12:00","13:00"]},
  {"day":5,"slots":["08:00","09:00","10:00","11:00","12:00","13:00"]},
  {"day":6,"slots":["08:00","09:00","10:00","11:00","12:00","13:00"]}
]'::jsonb
where role = 'doctor'
  and full_name ilike '%Franco%Aguirre%';

-- ── Milagros Morales ─────────────────────────────────────────────────────────
update profiles
set availability = '[
  {"day":1,"slots":["14:00","15:00","16:00","17:00","18:00","19:00"]},
  {"day":3,"slots":["14:00","15:00","16:00","17:00","18:00","19:00"]},
  {"day":5,"slots":["14:00","15:00","16:00","17:00","18:00","19:00"]}
]'::jsonb
where role = 'doctor'
  and full_name ilike '%Milagros%Morales%';

-- ── Lourdes Flores ───────────────────────────────────────────────────────────
update profiles
set availability = '[
  {"day":2,"slots":["14:00","15:00","16:00","17:00","18:00","19:00"]},
  {"day":4,"slots":["14:00","15:00","16:00","17:00","18:00","19:00"]}
]'::jsonb
where role = 'doctor'
  and full_name ilike '%Lourdes%Flores%';

-- ── Verify ───────────────────────────────────────────────────────────────────
select full_name, specialty, availability
from profiles
where role = 'doctor'
  and full_name ilike any(array['%Aguirre%','%Morales%','%Flores%'])
order by full_name;
