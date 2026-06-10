-- Index for fast filtering by profile status (supports imported/active/pending queries)
CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles (status);
