-- Migration: Add appointments and notifications to Supabase Realtime publication
-- Description: The doctor_queue update flow requires that Supabase Realtime
-- broadcasts INSERT/UPDATE/DELETE events on the 'appointments' table so that
-- the doctor's dashboard channel (`doctor-dashboard-{userId}`) receives the
-- event when a patient cancels (status UPDATE to 'cancelled') or a new
-- appointment is booked (INSERT). Without this, the channel never fires and
-- the dashboard only updates via the 30s polling fallback.
--
-- The notifications table was also referenced in a previous migration comment
-- (20260426000006) but never actually added — fixing that here too.

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

-- Add notifications to realtime as well (was commented out in migration 20260426000006)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
