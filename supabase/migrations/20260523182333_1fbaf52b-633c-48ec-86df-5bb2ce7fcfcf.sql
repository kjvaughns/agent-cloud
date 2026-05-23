
-- recruiting_funnels extensions
ALTER TABLE public.recruiting_funnels
  ADD COLUMN IF NOT EXISTS template_slug text NOT NULL DEFAULT 'get-contracted-now',
  ADD COLUMN IF NOT EXISTS page_views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applications integer NOT NULL DEFAULT 0;

ALTER TABLE public.recruiting_funnels ALTER COLUMN published SET DEFAULT true;
UPDATE public.recruiting_funnels SET published = true WHERE published IS NULL;
ALTER TABLE public.recruiting_funnels ALTER COLUMN published SET NOT NULL;

-- Backfill slugs for any null rows before unique constraint
UPDATE public.recruiting_funnels SET slug = 'funnel-' || substr(id::text, 1, 8) WHERE slug IS NULL OR slug = '';
ALTER TABLE public.recruiting_funnels ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recruiting_funnels_slug_key ON public.recruiting_funnels(slug);

-- recruiting_prospects extensions
ALTER TABLE public.recruiting_prospects
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.recruiting_funnels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS linked_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Stage history
CREATE TABLE IF NOT EXISTS public.recruiting_prospect_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.recruiting_prospects(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rpsh_prospect_idx ON public.recruiting_prospect_stage_history(prospect_id);
ALTER TABLE public.recruiting_prospect_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY rpsh_via_prospect_select ON public.recruiting_prospect_stage_history
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.recruiting_prospects rp WHERE rp.id = prospect_id
      AND (rp.recruiter_id = auth.uid() OR public.is_in_downline(auth.uid(), rp.recruiter_id) OR public.has_role(auth.uid(), 'admin')))
  );
CREATE POLICY rpsh_via_prospect_modify ON public.recruiting_prospect_stage_history
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.recruiting_prospects rp WHERE rp.id = prospect_id
      AND (rp.recruiter_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.recruiting_prospects rp WHERE rp.id = prospect_id
      AND (rp.recruiter_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

-- Trigger to record stage changes
CREATE OR REPLACE FUNCTION public.recruiting_prospect_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.recruiting_prospect_stage_history(prospect_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, NULL, NEW.stage::text, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.recruiting_prospect_stage_history(prospect_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.stage::text, NEW.stage::text, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS recruiting_prospect_stage_change_trg ON public.recruiting_prospects;
CREATE TRIGGER recruiting_prospect_stage_change_trg
AFTER INSERT OR UPDATE OF stage ON public.recruiting_prospects
FOR EACH ROW EXECUTE FUNCTION public.recruiting_prospect_stage_change();

-- Notes
CREATE TABLE IF NOT EXISTS public.recruiting_prospect_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.recruiting_prospects(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rpn_prospect_idx ON public.recruiting_prospect_notes(prospect_id);
ALTER TABLE public.recruiting_prospect_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY rpn_via_prospect_select ON public.recruiting_prospect_notes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.recruiting_prospects rp WHERE rp.id = prospect_id
      AND (rp.recruiter_id = auth.uid() OR public.is_in_downline(auth.uid(), rp.recruiter_id) OR public.has_role(auth.uid(), 'admin')))
  );
CREATE POLICY rpn_via_prospect_modify ON public.recruiting_prospect_notes
  FOR ALL TO authenticated USING (
    agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  ) WITH CHECK (
    agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

-- landing_pages extensions
ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS lead_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.landing_pages ALTER COLUMN published SET DEFAULT true;

-- profiles agent_slug
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS agent_slug text;

-- Backfill agent_slug
DO $$
DECLARE r record; base text; candidate text; n int;
BEGIN
  FOR r IN SELECT id, first_name, last_name FROM public.profiles WHERE agent_slug IS NULL LOOP
    base := lower(regexp_replace(coalesce(r.first_name,'') || '-' || coalesce(r.last_name,''), '[^a-z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    IF base = '' OR base IS NULL THEN base := 'agent-' || substr(r.id::text,1,8); END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE agent_slug = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE public.profiles SET agent_slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_agent_slug_key ON public.profiles(agent_slug) WHERE agent_slug IS NOT NULL;

-- Atomic counter increment used by public TSS routes
CREATE OR REPLACE FUNCTION public.increment_funnel_views(_slug text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.recruiting_funnels SET page_views = page_views + 1 WHERE slug = _slug;
$$;

CREATE OR REPLACE FUNCTION public.increment_funnel_applications(_slug text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.recruiting_funnels SET applications = applications + 1 WHERE slug = _slug;
$$;

CREATE OR REPLACE FUNCTION public.increment_landing_leads(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.landing_pages SET lead_count = lead_count + 1 WHERE id = _id;
$$;
