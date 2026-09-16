-- ============================================================
-- Migration: Fix RLS — prevent non-admins from setting is_admin_upload = true
-- Commit: item-1/rls-fix-is-admin-upload
--
-- Problem:
--   The original "Authenticated users can upload" policy only checks
--   auth.uid() = uploaded_by. Any authenticated user can therefore
--   POST to resources with is_admin_upload = true, granting themselves
--   the admin badge on their own resource.
--
-- Fix:
--   Add a WITH CHECK guard: is_admin_upload may only be true if the
--   inserting user has the 'admin' role (via has_role()).
--
-- Non-admin / unauthenticated access unchanged:
--   A normal student never sets is_admin_upload = true — contribute.tsx
--   sends isAdmin which is false for all non-admin users. The insert
--   succeeds identically for them. Only a deliberately malicious payload
--   with is_admin_upload = true from a non-admin is now rejected.
-- ============================================================

-- Drop the old permissive policy (idempotent)
DROP POLICY IF EXISTS "Authenticated users can upload" ON public.resources;

-- Recreate with the additional WITH CHECK guard
CREATE POLICY "Authenticated users can upload"
  ON public.resources
  FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND (
      is_admin_upload = false
      OR public.has_role(auth.uid(), 'admin')
    )
  );
