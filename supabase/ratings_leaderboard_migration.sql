-- ============================================================
-- CampusCache — Ratings & Leaderboard Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ===== 1. RATINGS TABLE =====
CREATE TABLE IF NOT EXISTS public.ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars       INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  review      TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_id, user_id)
);
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ratings_resource ON public.ratings(resource_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user    ON public.ratings(user_id);

-- Updated-at trigger for ratings
DROP TRIGGER IF EXISTS set_ratings_updated ON public.ratings;
CREATE TRIGGER set_ratings_updated BEFORE UPDATE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS policies
DROP POLICY IF EXISTS "Ratings viewable by everyone"            ON public.ratings;
DROP POLICY IF EXISTS "Auth users can insert their own rating"  ON public.ratings;
DROP POLICY IF EXISTS "Auth users can update their own rating"  ON public.ratings;
DROP POLICY IF EXISTS "Auth users can delete their own rating"  ON public.ratings;

CREATE POLICY "Ratings viewable by everyone"
  ON public.ratings FOR SELECT USING (true);

-- Only allow rating if the user has downloaded the resource
CREATE POLICY "Auth users can insert their own rating"
  ON public.ratings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.downloads
      WHERE resource_id = ratings.resource_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Auth users can update their own rating"
  ON public.ratings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Auth users can delete their own rating"
  ON public.ratings FOR DELETE
  USING (auth.uid() = user_id);

-- ===== 2. ALLOW USERS TO CHECK THEIR OWN DOWNLOADS =====
-- (needed for "can this user rate?" check on the client)
DROP POLICY IF EXISTS "Users check own downloads" ON public.downloads;
CREATE POLICY "Users check own downloads"
  ON public.downloads FOR SELECT
  USING (auth.uid() = user_id);


-- ===== 3. LEADERBOARD FUNCTION =====
-- Returns contributors ranked by rolling-30-day points (monthly_points)
-- Also includes all_time_points for the "All Time" tab.
-- Points: uploads×10 + downloads_received×1 + featured×5 + ratings_received×2
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_branch TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 50
)
RETURNS TABLE(
  user_id           UUID,
  full_name         TEXT,
  branch            TEXT,
  monthly_points    BIGINT,
  all_time_points   BIGINT,
  upload_count      BIGINT,
  downloads_received BIGINT,
  featured_count    BIGINT,
  ratings_received  BIGINT
) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH
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
  download_totals AS (
    SELECT uploaded_by, COALESCE(SUM(download_count), 0) AS total
    FROM resources WHERE uploaded_by IS NOT NULL
    GROUP BY uploaded_by
  ),
  recent_downloads AS (
    SELECT r.uploaded_by, COUNT(*) AS cnt
    FROM downloads d
    JOIN resources r ON d.resource_id = r.id
    WHERE r.uploaded_by IS NOT NULL
      AND d.created_at >= now() - interval '30 days'
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
  FROM profiles p
  LEFT JOIN all_uploads           au ON au.uploaded_by  = p.id
  LEFT JOIN recent_uploads        ru ON ru.uploaded_by  = p.id
  LEFT JOIN download_totals       dt ON dt.uploaded_by  = p.id
  LEFT JOIN recent_downloads      rd ON rd.uploaded_by  = p.id
  LEFT JOIN featured_counts       fc ON fc.uploaded_by  = p.id
  LEFT JOIN all_ratings_received  ar ON ar.uploaded_by  = p.id
  LEFT JOIN recent_ratings_received rr ON rr.uploaded_by = p.id
  WHERE (p_branch IS NULL OR p.branch = p_branch)
    AND COALESCE(au.cnt, 0) > 0   -- only show users who've uploaded at least once
  ORDER BY monthly_points DESC, all_time_points DESC
  LIMIT p_limit
$$;

-- ===== SUCCESS =====
-- Next steps:
--   1. Deploy this migration (run in Supabase SQL Editor)
--   2. Redeploy the frontend (already done via git push)
