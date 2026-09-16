-- ============================================================
-- Migration: shared_branches column + data seed (consolidated)
-- Commit: item-6/migration-consolidation
--
-- Source: shared_branches_migration.sql
-- The UPDATE seed is idempotent (SET shared_branches where subject IN ...)
-- ============================================================

-- Add the shared_branches column (safe to re-run)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS shared_branches TEXT[] DEFAULT '{}';

-- One-time seed: mark cross-branch subjects as shared.
-- Future uploads are not affected (they default to empty array).
-- This UPDATE is idempotent — safe to replay.
UPDATE public.resources
SET shared_branches = ARRAY['CSE', 'AI', 'IT', 'Cyber Security']
WHERE subject IN ('DBMS', 'DSA-II', 'TOC')
  AND (shared_branches IS NULL OR shared_branches = '{}');
