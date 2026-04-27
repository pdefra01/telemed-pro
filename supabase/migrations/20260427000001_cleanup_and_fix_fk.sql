-- Migration: Cleanup and FK Fix
-- Description: Drops the foreign key to auth.users to allow orphaned profiles for demo management, and cleans up redundant policies.

-- 1. Drop the Foreign Key constraint that blocks standalone profile creation
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Clean up ALL existing policies on profiles to start fresh
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Everyone can view doctors" ON public.profiles;
DROP POLICY IF EXISTS "Permitir actualizacion del propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Permitir insercion del propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Permitir lectura publica de perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public can view active doctors" ON public.profiles;

-- 3. Re-apply a CLEAN set of policies

-- Admins: Full access to everything
CREATE POLICY "Admin full access"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Users: View and update their own profile
CREATE POLICY "Self manage"
ON public.profiles FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Everyone (Authenticated): View active doctors
CREATE POLICY "View doctors"
ON public.profiles FOR SELECT
TO authenticated
USING (role = 'doctor' AND is_active = true);

-- Everyone (Authenticated): View basic info of other patients? 
-- Let's say no for now, only doctors or admins can see patients.
-- But wait, maybe we need "View all profiles" for admins? Covered by "Admin full access".

-- 4. Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Fix the infinite recursion potential
-- The is_admin() function already uses user_roles which has no RLS and no FKs. 
-- It should be safe.

-- 6. Add policy for user_roles so admins can see it if needed, or just keep it simple
-- Since is_admin is SECURITY DEFINER, it doesn't need policies on user_roles to work.
