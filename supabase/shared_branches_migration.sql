-- ============================================================
-- CampusCache — Shared Branches Migration + One-time Seeding
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- STEP 1: Add the shared_branches column (safe to re-run)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS shared_branches TEXT[] DEFAULT '{}';

-- STEP 2: One-time — mark DBMS, DSA-II, TOC as shared across
-- CSE, AI, IT, and Cyber Security branches.
-- Future uploads are NOT affected (they default to empty array).
UPDATE public.resources
SET shared_branches = ARRAY['CSE', 'AI', 'IT', 'Cyber Security']
WHERE subject IN ('DBMS', 'DSA-II', 'TOC');

-- STEP 3: Verify — check how many rows were updated
SELECT id, title, subject, branch, shared_branches
FROM public.resources
WHERE subject IN ('DBMS', 'DSA-II', 'TOC');
