CREATE TABLE public.production_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('producer','leader','agency')),
  period text NOT NULL CHECK (period IN ('day','week','month')),
  holder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  premium numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  previous_premium numeric,
  previous_holder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  announced_at timestamptz,
  seen_at timestamptz,
  CONSTRAINT production_records_one_per_kind UNIQUE (organization_id, kind, period)
);

CREATE INDEX production_records_org_idx ON public.production_records (organization_id);
CREATE INDEX production_records_holder_idx ON public.production_records (holder_id);

GRANT SELECT ON public.production_records TO authenticated;
GRANT ALL ON public.production_records TO service_role;

ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organization's records"
  ON public.production_records FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR organization_id IN (
      SELECT m.organization_id FROM public.organization_memberships m WHERE m.profile_id = auth.uid()
    )
  );
