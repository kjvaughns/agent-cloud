do $$
declare
  con record;
begin
  for con in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'org_carriers'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%not_contracted%'
  loop
    execute format('alter table public.org_carriers drop constraint %I', con.conname);
  end loop;
end $$;

do $$ begin
  alter table public.org_carriers
    add constraint org_carriers_status_check
    check (status in ('active', 'paused', 'not_contracted', 'terminated', 'archived'));
exception when duplicate_object then null; end $$;

comment on column public.org_carriers.status is
  'The agency''s own relationship with this carrier. archived means the agency has filed it away: history is kept, agents stop seeing it, and it can be restored. Distinct from terminated, which records that the CARRIER ended the relationship.';

create index if not exists idx_org_carriers_selectable
  on public.org_carriers (organization_id)
  where status = 'active';

comment on index public.idx_org_carriers_selectable is
  'The carriers an agent may pick. Partial on active, so paused, terminated and archived rows are excluded by the index rather than by every caller remembering to filter.';

notify pgrst, 'reload schema';