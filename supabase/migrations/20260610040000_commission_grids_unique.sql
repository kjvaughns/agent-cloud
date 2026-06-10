-- Deduplicate commission_grids: keep newest row per (carrier_id, product_name, level_name, age_group_min)
DELETE FROM public.commission_grids
WHERE id NOT IN (
  SELECT DISTINCT ON (carrier_id, product_name, level_name, COALESCE(age_group_min, -1))
    id
  FROM public.commission_grids
  ORDER BY carrier_id, product_name, level_name, COALESCE(age_group_min, -1), created_at DESC NULLS LAST
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE public.commission_grids
  DROP CONSTRAINT IF EXISTS commission_grids_unique_row;
ALTER TABLE public.commission_grids
  ADD CONSTRAINT commission_grids_unique_row
  UNIQUE (carrier_id, product_name, level_name, age_group_min);
