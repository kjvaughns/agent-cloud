
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email citext NOT NULL UNIQUE,
  phone text,
  persona text,
  source text,
  utm jsonb,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.waitlist_signups TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.waitlist_signups TO authenticated;
GRANT ALL ON public.waitlist_signups TO service_role;

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist_signups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read waitlist"
  ON public.waitlist_signups FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'agency_owner'));

CREATE POLICY "Admins can update waitlist"
  ON public.waitlist_signups FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can delete waitlist"
  ON public.waitlist_signups FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_waitlist_signups_updated_at
  BEFORE UPDATE ON public.waitlist_signups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.waitlist_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.waitlist_signups;
$$;

GRANT EXECUTE ON FUNCTION public.waitlist_count() TO anon, authenticated;
