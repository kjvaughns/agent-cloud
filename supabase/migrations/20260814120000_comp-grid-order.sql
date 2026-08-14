-- ---------------------------------------------------------------------------
-- A COMP GRID KEEPS THE ORDER IT WAS ARRANGED IN
--
-- commission_grids has never carried ordering. The editor listed rows in
-- whatever order the planner returned them — `listMyGrids` had no ORDER BY at
-- all, so reloading the page could shuffle the products — and the reader
-- sorted products alphabetically and level columns by rate size. Carriers
-- publish their grids in a deliberate order (flagship products first, levels
-- descending the way the contract ladder reads), and an agency re-keying a
-- grid had no way to keep it.
--
-- Two nullable integers, stamped by the editor on save:
--
--   sort_order   the product row's position in the editor
--   level_sort   the level column's position
--
-- Nullable on purpose. Legacy rows have no authored order, and both readers
-- treat null as "no opinion" — such rows fall back to the old alphabetical /
-- by-rate ordering, sorted after any authored rows rather than interleaved
-- with them. No backfill: inventing an order for rows nobody arranged would
-- just freeze the current accident.
--
-- Code ships before this is applied. The write path retries without these
-- columns on PGRST204 (see writeGridRows), and both read paths select `*` and
-- sort in code, so the window costs nothing but the feature itself.
-- ---------------------------------------------------------------------------

alter table public.commission_grids
  add column if not exists sort_order integer,
  add column if not exists level_sort integer;

comment on column public.commission_grids.sort_order is
  'Authored position of the product row in the grid editor. Null = no authored order; readers fall back to alphabetical.';
comment on column public.commission_grids.level_sort is
  'Authored position of the level column in the grid editor. Null = no authored order; readers fall back to rate magnitude.';

notify pgrst, 'reload schema';
