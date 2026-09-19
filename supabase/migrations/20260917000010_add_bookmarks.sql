-- ============================================================
-- Migration 000010: Bookmarks (saved resources)
-- RLS-first: ENABLE ROW LEVEL SECURITY before any policies.
-- Policy idiom: DROP ... IF EXISTS then CREATE (no IF NOT EXISTS on CREATE POLICY).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id     UUID        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  resource_id UUID        NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resource_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Index for per-user queries (profile saved-resources list)
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON public.bookmarks (user_id, created_at DESC);

-- Users can only see, add, and remove their own bookmarks
DROP POLICY IF EXISTS "Users manage own bookmarks" ON public.bookmarks;
CREATE POLICY "Users manage own bookmarks"
  ON public.bookmarks FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
