-- ============================================================
-- Fix: Exclude admins from the Contributor Leaderboard
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_branch TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 50
)
RETURNS TABLE(
  user_id            UUID,
  full_name          TEXT,
  branch             TEXT,
  monthly_points     BIGINT,
  all_time_points    BIGINT,
  upload_count       BIGINT,
  downloads_received BIGINT,
  featured_count     BIGINT,
  ratings_received   BIGINT
) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH
  -- Exclude admin users from the leaderboard entirely
  non_admin_profiles AS (
    SELECT p.id, p.full_name, p.branch
    FROM profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'admin'
    )
  ),
  all_uploads AS (
    SELECT uploaded_by, COUNT(*) AS cnt
    FROM resources WHERE uploaded_by IS NOT NULL
    GROUP BY uploaded_by
  ),
  recent_uploads AS (
    SELECT uploaded_by, COUNT(*) AS cnt
    FROM resources
    WHERE uploaded_by IS NOT NULL
      AND created_at >= now() - interval '30 days'
    GROUP BY uploaded_by
  ),
  -- Only count downloads from non-admin users
  download_totals AS (
    SELECT r.uploaded_by, COALESCE(SUM(r.download_count), 0) AS total
    FROM resources r WHERE r.uploaded_by IS NOT NULL
    GROUP BY r.uploaded_by
  ),
  -- Recent downloads: from downloads table, exclude admin downloaders
  recent_downloads AS (
    SELECT r.uploaded_by, COUNT(*) AS cnt
    FROM downloads d
    JOIN resources r ON d.resource_id = r.id
    WHERE r.uploaded_by IS NOT NULL
      AND d.created_at >= now() - interval '30 days'
      -- Exclude downloads made by admins
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = d.user_id AND ur.role = 'admin'
      )
    GROUP BY r.uploaded_by
  ),
  featured_counts AS (
    SELECT uploaded_by, COUNT(*) AS cnt
    FROM resources
    WHERE uploaded_by IS NOT NULL AND is_featured = true
    GROUP BY uploaded_by
  ),
  all_ratings_received AS (
    SELECT r.uploaded_by, COUNT(*) AS cnt
    FROM ratings rt
    JOIN resources r ON rt.resource_id = r.id
    WHERE r.uploaded_by IS NOT NULL
    GROUP BY r.uploaded_by
  ),
  recent_ratings_received AS (
    SELECT r.uploaded_by, COUNT(*) AS cnt
    FROM ratings rt
    JOIN resources r ON rt.resource_id = r.id
    WHERE r.uploaded_by IS NOT NULL
      AND rt.created_at >= now() - interval '30 days'
    GROUP BY r.uploaded_by
  )
  SELECT
    p.id                                AS user_id,
    p.full_name,
    p.branch,
    -- Rolling 30-day score
    (  COALESCE(ru.cnt,  0) * 10
     + COALESCE(rd.cnt,  0)
     + COALESCE(rr.cnt,  0) * 2
    )                                   AS monthly_points,
    -- All-time score
    (  COALESCE(au.cnt,  0) * 10
     + COALESCE(dt.total, 0)
     + COALESCE(fc.cnt,  0) * 5
     + COALESCE(ar.cnt,  0) * 2
    )                                   AS all_time_points,
    COALESCE(au.cnt,   0)               AS upload_count,
    COALESCE(dt.total, 0)               AS downloads_received,
    COALESCE(fc.cnt,   0)               AS featured_count,
    COALESCE(ar.cnt,   0)               AS ratings_received
  FROM non_admin_profiles p
  LEFT JOIN all_uploads             au ON au.uploaded_by  = p.id
  LEFT JOIN recent_uploads          ru ON ru.uploaded_by  = p.id
  LEFT JOIN download_totals         dt ON dt.uploaded_by  = p.id
  LEFT JOIN recent_downloads        rd ON rd.uploaded_by  = p.id
  LEFT JOIN featured_counts         fc ON fc.uploaded_by  = p.id
  LEFT JOIN all_ratings_received    ar ON ar.uploaded_by  = p.id
  LEFT JOIN recent_ratings_received rr ON rr.uploaded_by  = p.id
  WHERE (p_branch IS NULL OR p.branch = p_branch)
    AND COALESCE(au.cnt, 0) > 0   -- only show users who've uploaded at least once
  ORDER BY monthly_points DESC, all_time_points DESC
  LIMIT p_limit
$$;
