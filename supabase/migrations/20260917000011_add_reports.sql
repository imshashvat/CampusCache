-- ============================================================
-- Migration 000011: Resource reports
-- RLS-first. Admin policy uses public.has_role() helper (consistent
-- with every other admin policy in the schema).
-- Policy idiom: DROP ... IF EXISTS then CREATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID        NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  reporter_id UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  details     TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Index for admin list view (newest first)
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports (created_at DESC);
-- Index for "has user already reported this resource?" check
CREATE INDEX IF NOT EXISTS idx_reports_reporter_resource ON public.reports (reporter_id, resource_id);

-- Any authenticated user can file a report
DROP POLICY IF EXISTS "Auth users can report" ON public.reports;
CREATE POLICY "Auth users can report"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Users can read their own submitted reports
DROP POLICY IF EXISTS "Users see own reports" ON public.reports;
CREATE POLICY "Users see own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Admins can read and update all reports (uses the existing has_role() helper)
DROP POLICY IF EXISTS "Admins manage reports" ON public.reports;
CREATE POLICY "Admins manage reports"
  ON public.reports FOR ALL
  USING  (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
