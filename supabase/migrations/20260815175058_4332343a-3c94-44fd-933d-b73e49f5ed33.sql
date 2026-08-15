ALTER TABLE public.invitation_links ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.invitation_links ALTER COLUMN expires_at DROP DEFAULT;
UPDATE public.invitation_links SET expires_at = NULL WHERE expires_at IS NOT NULL;