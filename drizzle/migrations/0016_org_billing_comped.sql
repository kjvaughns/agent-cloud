ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS billing_comped boolean NOT NULL DEFAULT false;
UPDATE public.organizations SET billing_comped = true;
CREATE OR REPLACE FUNCTION public.guard_billing_comped() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.billing_comped IS DISTINCT FROM OLD.billing_comped
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can change complimentary billing';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS organizations_guard_billing_comped ON public.organizations;
CREATE TRIGGER organizations_guard_billing_comped BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_billing_comped();
CREATE OR REPLACE FUNCTION public.guard_billing_comped_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.billing_comped AND coalesce(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    NEW.billing_comped := false;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS organizations_guard_billing_comped_insert ON public.organizations;
CREATE TRIGGER organizations_guard_billing_comped_insert BEFORE INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_billing_comped_insert();