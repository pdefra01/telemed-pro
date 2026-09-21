-- Migration: email_in_use
-- Description: lets the admin API check whether an email already belongs to an
--   auth account (supabase-js has no get-by-email). Case-insensitive.
--   SECURITY DEFINER reads auth.users; EXECUTE is limited to the service role.

CREATE OR REPLACE FUNCTION public.email_in_use(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(btrim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.email_in_use(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_in_use(TEXT) TO service_role;
