-- Description: Removes the 2 legacy demo producer rows (PROD-101, PROD-102)
-- seeded directly via SQL in 20260628000010_subscription_and_producers.sql.
-- They were never provisioned through POST /api/create-advisor, so they have
-- no corresponding auth.users row and cannot log in — pure leftover demo data.
-- Safe: profiles.producer_id references producers with ON DELETE SET NULL,
-- and adhesion_requests.promoter_id is a plain text column, not a FK.

DELETE FROM public.producers WHERE producer_code IN ('PROD-101', 'PROD-102');
