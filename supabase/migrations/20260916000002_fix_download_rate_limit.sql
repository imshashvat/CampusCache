-- ============================================================
-- Migration: Fix download-farming — 24-hour rate-limit per (resource, user)
-- Commit: item-2/fix-download-rate-limit
--
-- Problem:
--   increment_download_count() does an unconditional UPDATE + INSERT on
--   every call. A logged-in user can call it N times and inflate both
--   download_count and leaderboard points.
--
-- Fix:
--   For authenticated users: only increment download_count when no
--   existing downloads row exists for (resource_id, user_id) within the
--   last 24 hours. The analytics row is always inserted regardless.
--
--   For guests (auth.uid() IS NULL): always insert the analytics row
--   for analytics purposes, but never increment download_count. This
--   matches the existing guest-exclusion logic in get_leaderboard()
--   (see fix_leaderboard_exclude_admins.sql).
--
-- Non-admin / unauthenticated access unchanged:
--   First download by a signed-in student: identical behaviour to today.
--   Guest downloads: identical — row inserted, count not touched.
--   Only repeated same-user downloads within 24 h are deduplicated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_download_count(_resource_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Only increment download_count if the user has NOT downloaded this
    -- resource in the last 24 hours (deduplication / anti-farming).
    IF NOT EXISTS (
      SELECT 1
      FROM public.downloads
      WHERE resource_id = _resource_id
        AND user_id     = auth.uid()
        AND created_at >= now() - interval '24 hours'
    ) THEN
      UPDATE public.resources
        SET download_count = download_count + 1
        WHERE id = _resource_id;
    END IF;

    -- Always record the download event for analytics regardless of dedup.
    INSERT INTO public.downloads (resource_id, user_id)
    VALUES (_resource_id, auth.uid());

  ELSE
    -- Guest: record the analytics row but do NOT touch download_count.
    -- Guest downloads are excluded from leaderboard by get_leaderboard().
    INSERT INTO public.downloads (resource_id, user_id)
    VALUES (_resource_id, NULL);
  END IF;
END;
$$;
