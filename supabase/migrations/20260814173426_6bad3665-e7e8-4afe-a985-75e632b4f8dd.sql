ALTER TABLE public.invitation_links
  ADD COLUMN IF NOT EXISTS is_agency_link boolean NOT NULL DEFAULT false;