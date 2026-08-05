-- ============================================================================
-- SAMPLE DATA, MARKED AS SUCH
--
-- The demo org, the sample data a new agency starts with, and the fixtures the
-- end-to-end tests run against are all the same rows written by the same seed.
-- What makes them safe is that every one of them says so.
--
-- Two reasons this is a column rather than a convention:
--
--   1. Deleting it has to be one action. "Clear sample data" that misses a
--      table leaves an agency with three orphan policies they cannot explain
--      and did not create.
--   2. In insurance, a demo client mistaken for a real one is a compliance
--      problem rather than a tidiness one. A row that cannot prove it is
--      sample data will eventually be treated as real.
--
-- Nullable with a false default, so nothing existing changes and no backfill
-- is needed: every row already in these tables is real, which is exactly what
-- `false` says.
-- ============================================================================

do $$
declare
  t text;
  -- Every table the seed writes. Adding one here without adding it to the
  -- delete path in seed-demo.ts is how "clear sample data" starts lying, so
  -- the script reads this same list.
  targets text[] := array[
    'clients', 'policies', 'commission_schedule', 'state_licenses',
    'producer_documents', 'contract_requests', 'tasks',
    'contracting_requests', 'writing_numbers', 'producer_appointments',
    -- Not written by the seed directly. `trg_policy_after_insert` creates a
    -- calendar event per seeded policy, and a reminder for a demo client that
    -- "clear sample data" cannot remove is exactly the orphan this column
    -- exists to prevent. The seed stamps them after the fact.
    'calendar_events'
  ];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, not present in this database', t;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists is_sample boolean not null default false', t);

    -- The index is an optimisation and the column is the point, so it is
    -- conditional rather than wrapped in an exception handler: raising inside
    -- this loop would abort the whole block and every table after this one
    -- would silently miss its column.
    --
    -- Partial, because sample rows are a small minority and the only query
    -- that cares is "delete all of them". A full index would tax every write
    -- on these tables to speed up something nobody runs twice.
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'organization_id'
    ) then
      execute format(
        'create index if not exists idx_%s_is_sample on public.%I (organization_id) where is_sample', t, t);
    else
      execute format(
        'create index if not exists idx_%s_is_sample on public.%I (is_sample) where is_sample', t, t);
    end if;
  end loop;
end $$;

comment on column public.clients.is_sample is
  'Seeded demo data. Never counts toward activation metrics, always visibly labelled, and removable in one action.';
