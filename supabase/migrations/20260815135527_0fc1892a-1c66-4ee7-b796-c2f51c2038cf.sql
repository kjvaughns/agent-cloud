ALTER TABLE public.org_carriers
  ADD COLUMN IF NOT EXISTS max_advance_option public.advance_option;

-- Existing rows: whatever the agency default is today is at most what the
-- carrier allows, so seed the ceiling from it rather than leaving every
-- configured carrier suddenly missing a maximum.
UPDATE public.org_carriers
   SET max_advance_option = default_advance_option
 WHERE max_advance_option IS NULL
   AND default_advance_option IS NOT NULL;

-- The agency default may never exceed the carrier ceiling. Enum values are
-- ordered by declaration, so a plain comparison is the rule.
ALTER TABLE public.org_carriers
  DROP CONSTRAINT IF EXISTS org_carriers_advance_within_max;
ALTER TABLE public.org_carriers
  ADD CONSTRAINT org_carriers_advance_within_max
  CHECK (
    default_advance_option IS NULL
    OR (max_advance_option IS NOT NULL AND default_advance_option <= max_advance_option)
  );