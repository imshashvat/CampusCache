-- ============================================================
-- Add: get_own_stats function for Profile page
-- Works for ANY user (including admins), uses resources.download_count
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_own_stats(p_user_id UUID)
RETURNS TABLE(
  monthly_points     BIGINT,
  all_time_points    BIGINT,
  upload_count       BIGINT,
  downloads_received BIGINT,
  ratings_received   BIGINT
) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- Rolling 30-day points
    (
      (SELECT COUNT(*) FROM resources
        WHERE uploaded_by = p_user_id
          AND created_at >= now() - interval '30 days') * 10
      +
      -- Recent authenticated downloads of this user's files
      (SELECT COUNT(*) FROM downloads d
        JOIN resources r ON d.resource_id = r.id
        WHERE r.uploaded_by = p_user_id
          AND d.user_id IS NOT NULL
          AND d.created_at >= now() - interval '30 days')
      +
      (SELECT COUNT(*) FROM ratings rt
        JOIN resources r ON rt.resource_id = r.id
        WHERE r.uploaded_by = p_user_id
          AND rt.created_at >= now() - interval '30 days') * 2
    )::BIGINT AS monthly_points,

    -- All-time points (uses download_count column for accuracy)
    (
      (SELECT COUNT(*) FROM resources WHERE uploaded_by = p_user_id) * 10
      +
      (SELECT COALESCE(SUM(download_count), 0) FROM resources WHERE uploaded_by = p_user_id)
      +
      (SELECT COUNT(*) FROM resources WHERE uploaded_by = p_user_id AND is_featured = true) * 5
      +
      (SELECT COUNT(*) FROM ratings rt
        JOIN resources r ON rt.resource_id = r.id
        WHERE r.uploaded_by = p_user_id) * 2
    )::BIGINT AS all_time_points,

    (SELECT COUNT(*) FROM resources WHERE uploaded_by = p_user_id)::BIGINT AS upload_count,

    -- Total downloads of this user's files (all sources, for display)
    (SELECT COALESCE(SUM(download_count), 0) FROM resources WHERE uploaded_by = p_user_id)::BIGINT AS downloads_received,

    (SELECT COUNT(*) FROM ratings rt
      JOIN resources r ON rt.resource_id = r.id
      WHERE r.uploaded_by = p_user_id)::BIGINT AS ratings_received
$$;
