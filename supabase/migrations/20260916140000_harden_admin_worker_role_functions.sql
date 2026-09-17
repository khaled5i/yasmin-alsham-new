-- Keep authorization helpers independent from the caller's search_path.
-- Order triggers intentionally use an empty search_path, so every relation
-- referenced by these SECURITY DEFINER helpers must be schema-qualified.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS profile
    WHERE profile.id = (SELECT auth.uid())
      AND profile.role = 'admin'
      AND profile.is_active IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_worker()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS profile
    WHERE profile.id = (SELECT auth.uid())
      AND profile.role = 'worker'
      AND profile.is_active IS TRUE
  );
$$;
