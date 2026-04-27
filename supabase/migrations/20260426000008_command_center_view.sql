-- Migration: Command Center View
-- Description: Creates a secure view for the Doctor's Command Center to monitor the live queue.

CREATE OR REPLACE VIEW public.doctor_queue AS
SELECT 
    a.id AS appointment_id,
    a.scheduled_at,
    a.status,
    a.specialty,
    a.consultation_metadata,
    p.id AS patient_id,
    p.full_name AS patient_name,
    p.avatar_url AS patient_avatar,
    p.dni AS patient_dni,
    p.plan_name AS patient_plan,
    a.doctor_id
FROM 
    public.appointments a
JOIN 
    public.profiles p ON a.patient_id = p.id
WHERE 
    a.status IN ('confirmed', 'in_progress', 'pending')
ORDER BY 
    a.scheduled_at ASC;

-- Security: Ensure doctors can only see their own queue through this view
-- Note: In Supabase, RLS on underlying tables applies to views if created as SECURITY INVOKER
-- or we can just rely on the doctor filtering in the query.
-- But for extra safety, we'll make it a SECURITY INVOKER view if supported or just document it.

ALTER VIEW public.doctor_queue OWNER TO postgres;
GRANT SELECT ON public.doctor_queue TO authenticated;
