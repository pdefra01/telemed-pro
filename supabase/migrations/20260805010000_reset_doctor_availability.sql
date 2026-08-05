-- Reset doctor availability to empty array.
-- The old format stored flat time strings (e.g. '["09:00","10:00"]').
-- The new format uses DaySchedule objects ({ day, slots }).
-- Admins must reconfigure each doctor's schedule via the UI.
update profiles
set availability = '[]'::jsonb
where role = 'doctor'
  and availability is not null
  -- Only reset if the first element is a plain string (old format)
  and jsonb_typeof(availability) = 'array'
  and jsonb_array_length(availability) > 0
  and jsonb_typeof(availability -> 0) = 'string';
