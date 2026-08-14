ALTER TABLE public.invitation_links
  ADD COLUMN IF NOT EXISTS upline_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invitation_links_upline_id_idx ON public.invitation_links(upline_id);

COMMENT ON COLUMN public.invitation_links.upline_id IS 'Who the invited agent reports to. Null means the link creator, which is what every existing link meant.';