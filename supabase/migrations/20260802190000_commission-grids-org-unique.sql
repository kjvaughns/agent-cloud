-- ---------------------------------------------------------------------------
-- TWO AGENCIES MAY HOLD DIFFERENT RATES FOR THE SAME PRODUCT
--
-- `commission_grids` gained an `organization_id` in
-- `20260727100000_grid-uploads-and-intake.sql`, whose own comment explains the
-- design: NULL means the shared default set, and an agency's own rows shadow
-- the defaults for that carrier.
--
-- Its unique constraint was never updated to match. From
-- `20260610040000_commission_grids_unique.sql`:
--
--   unique (carrier_id, product_name, level_name, age_group_min)
--
-- No organization. So the shared default for GTL / Term Life / 100% and an
-- agency's own rate for the same are the same row as far as the database is
-- concerned, and the second one is rejected.
--
-- It has not caused visible damage yet only because `age_group_min` is usually
-- NULL, and Postgres treats NULLs in a UNIQUE constraint as distinct — which
-- makes the constraint simultaneously wrong and, for the common case, inert.
-- The moment a grid carries age bands, an agency cannot enter its own rates for
-- a product the defaults already cover. That is the case this fixes.
--
-- The same NULL-distinctness has a second consequence worth cleaning up: it has
-- never actually prevented duplicate rows for the common case either, so there
-- may be duplicates on file right now. Deduplicate before adding the index, or
-- creating it fails.
-- ---------------------------------------------------------------------------

-- Keep the newest row per (organization, carrier, product, level, age band).
-- `coalesce` on both nullables so NULL compares equal to NULL here — the whole
-- point of the exercise.
delete from public.commission_grids a
 using public.commission_grids b
 where a.carrier_id = b.carrier_id
   and a.product_name = b.product_name
   and a.level_name = b.level_name
   and coalesce(a.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
     = coalesce(b.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
   and coalesce(a.age_group_min, -1) = coalesce(b.age_group_min, -1)
   and a.id < b.id;

alter table public.commission_grids
  drop constraint if exists commission_grids_unique_row;

-- An index rather than a table constraint: a constraint cannot be defined over
-- expressions, and `coalesce` is exactly what makes NULL behave here.
create unique index if not exists commission_grids_org_row_uniq
  on public.commission_grids (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    carrier_id,
    product_name,
    level_name,
    coalesce(age_group_min, -1)
  );

comment on index public.commission_grids_org_row_uniq is
  'One rate per organization, carrier, product, level and age band. The zero UUID stands in for the shared default set so NULL organizations compare equal to each other rather than to nothing.';

notify pgrst, 'reload schema';
