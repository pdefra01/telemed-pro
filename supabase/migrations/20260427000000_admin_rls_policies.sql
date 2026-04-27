-- Migration: Final Admin RLS & Schema Fixes
-- Description: Fixes infinite recursion, sets default ID for profiles, and establishes user_roles for stable authorization.

-- 1. Create user_roles table for stable, recursion-free RLS
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY, -- No FK to auth.users to allow flexible profile management in demo
  role TEXT NOT NULL DEFAULT 'patient',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sync existing roles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.profiles
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- 3. Set default for profiles.id to allow direct inserts from Admin
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 4. Function to check admin role using the new table (SECURITY DEFINER to bypass RLS on user_roles if needed)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6. Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Everyone can view doctors" ON public.profiles;

-- 7. Create recursion-free policies

-- Policy: Admins have full access
CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Policy: Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy: Everyone can view doctor profiles
CREATE POLICY "Everyone can view doctors"
ON public.profiles FOR SELECT
TO authenticated
USING (role = 'doctor' AND is_active = true);

-- 8. Add trigger to sync roles to user_roles when a profile is created or updated
CREATE OR REPLACE FUNCTION public.sync_user_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, NEW.role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_role_change ON public.profiles;
CREATE TRIGGER on_profile_role_change
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_role();

-- 9. Grant access
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
