-- Migration: atomic increment helper for advisor link sharing counter
-- Replaces the read-then-write race condition in POST /api/advisor/increment-share

CREATE OR REPLACE FUNCTION increment_links_shared(row_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_val integer;
BEGIN
  UPDATE producers
  SET links_shared_count = COALESCE(links_shared_count, 0) + 1
  WHERE id = row_id
  RETURNING links_shared_count INTO new_val;
  
  RETURN new_val;
END;
$$;
