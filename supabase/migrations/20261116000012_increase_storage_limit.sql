-- Increase the resources storage bucket file size limit to 50 MB
-- (was unset / defaulting to Supabase project limit)
UPDATE storage.buckets
SET file_size_limit = 52428800  -- 50 * 1024 * 1024 bytes
WHERE id = 'resources';
