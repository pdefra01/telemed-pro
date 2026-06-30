-- Migración: Evitar duplicados de turnos activos para el mismo médico
-- Descripción: Crea un índice único parcial en la tabla appointments para evitar que dos pacientes agenden con el mismo médico a la misma hora, excluyendo los turnos cancelados.

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_appointment 
ON public.appointments (doctor_id, scheduled_at) 
WHERE (status != 'cancelled');
