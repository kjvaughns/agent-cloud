ALTER TABLE public.recruiting_prospects ADD COLUMN IF NOT EXISTS tracker_type text NOT NULL DEFAULT 'recruiting';
UPDATE public.recruiting_prospects SET tracker_type = 'recruiting' WHERE tracker_type IS NULL;
CREATE INDEX IF NOT EXISTS idx_recruiting_prospects_tracker_type ON public.recruiting_prospects(tracker_type);