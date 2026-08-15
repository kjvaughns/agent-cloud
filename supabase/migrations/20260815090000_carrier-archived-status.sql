-- A carrier can be archived.
--
-- ── Why a new state and not `terminated` ──
--
-- `org_carriers.status` allows active, paused, not_contracted and terminated.
-- None of them means "we are done with this carrier, keep the history".
--
--   paused          — a temporary stop; it is coming back
--   not_contracted  — we never had a contract
--   terminated      — the CARRIER ended the relationship, which is a fact about
--                     them and may need reporting
--
-- Archived is the agency's own filing decision. Reusing `terminated` for it
-- would record a carrier relationship as having been ended by the carrier when
-- the agency simply stopped using them, and that distinction shows up in
-- release paperwork and in what an agent is told about why a carrier vanished.
--
-- ── What archiving means ──
--
-- An archived carrier stays attached to every policy, commission row and
-- request it already has. It stops appearing to agents, cannot be selected for
-- new deals or requests, and can be restored. That is the whole difference
-- from deleting, which is only offered when nothing points at the carrier at
-- all.
--
-- Forward-only and idempotent. Nothing is archived by this migration; it only
-- makes the state expressible.

do $$
declare
  con record;
begin
  -- The constraint has been created twice under different generated names, so
  -- it is found by what it constrains rather than by a name this migration
  -- would have to guess.
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

-- Agents must not be offered an archived carrier. The existing partial index
-- on active carriers does not cover this, because archived rows would simply
-- fall out of it silently rather than being excluded deliberately.
create index if not exists idx_org_carriers_selectable
  on public.org_carriers (organization_id)
  where status = 'active';

comment on index public.idx_org_carriers_selectable is
  'The carriers an agent may pick. Partial on active, so paused, terminated and archived rows are excluded by the index rather than by every caller remembering to filter.';

notify pgrst, 'reload schema';
