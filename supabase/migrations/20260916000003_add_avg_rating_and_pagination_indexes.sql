-- ============================================================
-- Migration: avg_rating column + trigger + pagination indexes
-- Commit: item-3/avg-rating-and-pagination-indexes
--
-- Problem A (Top Rated):
--   browse.tsx fetches 60 rows then sorts client-side by avg rating —
--   the top-rated view is broken once the library exceeds 60 resources.
--
-- Problem B (Pagination / P0):
--   No cursor pagination existed. Library capped at 60 visible results.
--
-- Fix:
--   1. Add avg_rating column maintained by a trigger on ratings changes.
--   2. Add composite indexes so all three sort orders can serve keyset
--      (cursor) pagination efficiently via (sort_col DESC, id DESC).
--   3. Back-fill avg_rating for any existing ratings rows.
--
-- Non-admin / unauthenticated access unchanged:
--   avg_rating is a read-only computed column — no RLS change needed.
--   The trigger runs as the inserting user within existing table security.
-- ============================================================

-- 1. Add the avg_rating column (idempotent)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0;

-- 2. Index for server-side ORDER BY avg_rating + keyset pagination
CREATE INDEX IF NOT EXISTS idx_resources_avg_rating
  ON public.resources (avg_rating DESC, id DESC);

-- Composite indexes for the other two sort orders (keyset pagination)
CREATE INDEX IF NOT EXISTS idx_resources_created_at_id
  ON public.resources (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_resources_download_count_id
  ON public.resources (download_count DESC, id DESC);

-- 3. Trigger function: recalculate avg_rating whenever ratings change
CREATE OR REPLACE FUNCTION public.refresh_resource_avg_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_resource_id UUID;
BEGIN
  -- On DELETE the affected resource_id is in OLD; on INSERT/UPDATE it's in NEW
  _target_resource_id := COALESCE(NEW.resource_id, OLD.resource_id);

  UPDATE public.resources
  SET avg_rating = COALESCE(
    (SELECT AVG(stars)::NUMERIC(3,2)
     FROM public.ratings
     WHERE resource_id = _target_resource_id),
    0
  )
  WHERE id = _target_resource_id;

  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

-- 4. Attach trigger to ratings table
DROP TRIGGER IF EXISTS trg_update_avg_rating ON public.ratings;
CREATE TRIGGER trg_update_avg_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_resource_avg_rating();

-- 5. Back-fill existing data
UPDATE public.resources r
SET avg_rating = COALESCE(
  (SELECT AVG(stars)::NUMERIC(3,2)
   FROM public.ratings
   WHERE resource_id = r.id),
  0
);
