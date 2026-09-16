-- ============================================================
-- Migration: get_platform_stats() — server-side aggregate stats
-- Commit: item-4/get-platform-stats
--
-- Problem:
--   index.tsx fetches every download_count row and sums in JS.
--   admin.tsx fetches up to 200 resource rows and uses .length as count.
--   Both are inaccurate at scale and transfer unnecessary data.
--
-- Fix:
--   A STABLE SECURITY DEFINER function that returns the three stats
--   via single-pass SQL aggregates. Callers replace two round-trips
--   with one RPC call.
--
-- Non-admin / unauthenticated access unchanged:
--   This function returns aggregate scalars only — no individual rows.
--   No RLS policy change needed (function runs as SECURITY DEFINER).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE(
  total_resources BIGINT,
  total_downloads BIGINT,
  total_uploaders BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT                          AS total_resources,
    COALESCE(SUM(download_count), 0)::BIGINT  AS total_downloads,
    COUNT(DISTINCT uploaded_by)::BIGINT       AS total_uploaders
  FROM public.resources;
$$;
