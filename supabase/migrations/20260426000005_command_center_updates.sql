-- Migration: Command Center Updates
-- Description: Adds in_progress status and consultation_metadata to appointments table.

-- 1. Update status check constraint for appointments
-- Since Postgres doesn't easily allow modifying check constraints on the fly without dropping, 
-- we drop and recreate if it exists or just update the logic.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled'));

-- 2. Add consultation_metadata column
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS consultation_metadata JSONB DEFAULT '{}'::JSONB;

-- 3. Ensure doctors can update their own appointments' metadata and status
-- (Assuming policies already exist, but making sure they cover update)
DROP POLICY IF EXISTS "Doctors can update their own appointments" ON public.appointments;
CREATE POLICY "Doctors can update their own appointments"
ON public.appointments FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);
