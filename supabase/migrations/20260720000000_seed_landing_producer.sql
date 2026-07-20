-- Description: Seeds a "LANDING" producer so the new "Adherite al servicio"
-- link on the patient login screen (Auth.tsx) can attribute signups to
-- promoter_id='LANDING' without failing AdhesionRepository's active-producer
-- validation. No commission payout intent — purely an attribution bucket for
-- patients who signed up directly from the login page, not via a real advisor.

INSERT INTO public.producers (name, producer_code, email, commission_rate, status)
SELECT 'Landing Directo (sin asesor)', 'LANDING', 'no-reply@medinex.com.ar', 0.00, 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.producers WHERE producer_code = 'LANDING');
