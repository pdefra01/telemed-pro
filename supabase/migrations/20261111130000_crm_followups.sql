-- Migration: CRM follow-ups (odd/tasks/commercial-crm-followups.md, S1, S3)
--
--   * S1 The system-set prospect columns (source, converted_profile_id, status_changed_at, created_at,
--     updated_at, id) are not writable through the API: authenticated users get INSERT and UPDATE only on
--     the columns a person edits. The automatic intake runs as the service role and keeps full access.
--   * S3 A collection action stores its author's name when it is logged, so every reader sees who logged
--     it even when RLS hides the author's profile (an advisor cannot read their supervisor's profile).

-- ── S1: column-level write grants on prospects ──────────────────────────────
REVOKE INSERT, UPDATE ON public.prospects FROM authenticated;
GRANT INSERT (advisor_id, full_name, phone, email, notes, status, last_contact_at) ON public.prospects TO authenticated;
GRANT UPDATE (advisor_id, full_name, phone, email, notes, status, last_contact_at) ON public.prospects TO authenticated;

-- ── S3: author name snapshot on collection actions ──────────────────────────
ALTER TABLE public.collection_actions ADD COLUMN IF NOT EXISTS created_by_name TEXT;
COMMENT ON COLUMN public.collection_actions.created_by_name IS 'Full name of the author when the action was logged. Set by a trigger; never written by clients.';

-- SECURITY DEFINER: the name is read regardless of which profiles the author can see.
CREATE OR REPLACE FUNCTION public.stamp_collection_action_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT NULLIF(btrim(full_name), '') INTO NEW.created_by_name FROM public.profiles WHERE id = NEW.created_by;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_collection_action_author() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_collection_action_author ON public.collection_actions;
CREATE TRIGGER stamp_collection_action_author
  BEFORE INSERT ON public.collection_actions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_collection_action_author();

-- Existing rows: the current name of their author.
UPDATE public.collection_actions a
   SET created_by_name = NULLIF(btrim(p.full_name), '')
  FROM public.profiles p
 WHERE p.id = a.created_by
   AND a.created_by_name IS NULL;
