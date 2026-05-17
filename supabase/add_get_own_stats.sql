-- ============================================================
-- Fix: get_own_stats — exclude guest (NULL user_id) downloads
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
    -- Rolling 30-day points (only authenticated downloads counted)
    (
      (SELECT COUNT(*) FROM resources
        WHERE uploaded_by = p_user_id
          AND created_at >= now() - interval '30 days') * 10
      +
      (SELECT COUNT(*) FROM downloads d
        JOIN resources r ON d.resource_id = r.id
        WHERE r.uploaded_by = p_user_id
          AND d.user_id IS NOT NULL          -- exclude guest downloads
          AND d.created_at >= now() - interval '30 days')
      +
      (SELECT COUNT(*) FROM ratings rt
        JOIN resources r ON rt.resource_id = r.id
        WHERE r.uploaded_by = p_user_id
          AND rt.created_at >= now() - interval '30 days') * 2
    )::BIGINT AS monthly_points,

    -- All-time points (only authenticated downloads)
    (
      (SELECT COUNT(*) FROM resources WHERE uploaded_by = p_user_id) * 10
      +
      (SELECT COUNT(*) FROM downloads d
        JOIN resources r ON d.resource_id = r.id
        WHERE r.uploaded_by = p_user_id
          AND d.user_id IS NOT NULL)         -- exclude guest downloads
      +
      (SELECT COUNT(*) FROM resources WHERE uploaded_by = p_user_id AND is_featured = true) * 5
      +
      (SELECT COUNT(*) FROM ratings rt
        JOIN resources r ON rt.resource_id = r.id
        WHERE r.uploaded_by = p_user_id) * 2
    )::BIGINT AS all_time_points,

    -- Upload count
    (SELECT COUNT(*) FROM resources WHERE uploaded_by = p_user_id)::BIGINT AS upload_count,

    -- Downloads received: only from signed-in users (user_id IS NOT NULL)
    (SELECT COUNT(*) FROM downloads d
      JOIN resources r ON d.resource_id = r.id
      WHERE r.uploaded_by = p_user_id
        AND d.user_id IS NOT NULL)::BIGINT   AS downloads_received,

    -- Ratings received
    (SELECT COUNT(*) FROM ratings rt
      JOIN resources r ON rt.resource_id = r.id
      WHERE r.uploaded_by = p_user_id)::BIGINT AS ratings_received
$$;
