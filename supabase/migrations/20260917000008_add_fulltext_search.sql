-- Migration: add full-text search column and index to resources
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE guards.
-- Does NOT touch any RLS policy.

-- 1. Add the generated tsvector column (persisted/stored for performance)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
      setweight(to_tsvector('english', coalesce(subject, '')),     'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED;

-- 2. GIN index so full-text queries are fast even at scale
CREATE INDEX IF NOT EXISTS resources_fts_idx
  ON public.resources
  USING gin(fts);
