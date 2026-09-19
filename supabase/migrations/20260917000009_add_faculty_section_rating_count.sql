-- ============================================================
-- Migration 000009: Faculty/section columns, rating_count,
--                   and fts column regeneration.
-- Idempotent: IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS.
-- ============================================================

ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS faculty_name TEXT;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.resources DROP COLUMN IF EXISTS fts;

ALTER TABLE public.resources
  ADD COLUMN fts tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(subject, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(faculty_name, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED;

DROP INDEX IF EXISTS resources_fts_idx;
CREATE INDEX resources_fts_idx ON public.resources USING gin(fts);

CREATE OR REPLACE FUNCTION public.refresh_resource_avg_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _rid UUID;
  _avg NUMERIC(3,2);
  _cnt INTEGER;
BEGIN
  _rid := COALESCE(NEW.resource_id, OLD.resource_id);
  SELECT COALESCE(AVG(stars)::NUMERIC(3,2), 0), COUNT(*)::INTEGER
  INTO _avg, _cnt
  FROM public.ratings
  WHERE resource_id = _rid;
  UPDATE public.resources
  SET avg_rating = _avg, rating_count = _cnt
  WHERE id = _rid;
  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS trg_update_avg_rating ON public.ratings;
CREATE TRIGGER trg_update_avg_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_resource_avg_rating();

UPDATE public.resources r
SET rating_count = (
  SELECT COUNT(*)::INTEGER FROM public.ratings WHERE resource_id = r.id
);