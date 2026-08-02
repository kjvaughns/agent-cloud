-- ---------------------------------------------------------------------------
-- THE HELP DESK
--
-- Three separate things were wrong with support, and they compound: a ticket
-- could be routed to somebody who then could not act on it, tickets that were
-- nobody's job had no queue to sit in, and the permissions that were supposed
-- to decide any of this were checkboxes wired to nothing.
--
--   1. A non-owner assignee's writes silently did nothing.
--   2. There was no platform queue — a solo agent's ticket landed in an
--      agency queue that does not exist, and an agency had no way to hand a
--      problem upward.
--   3. Three permission keys the app reads and writes were never columns.
--
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE MISSING PERMISSION COLUMNS
--
-- `mgr_respond_tickets`, `mgr_manage_resources` and `staff_manage_resources`
-- are in MANAGER_PERMS/STAFF_PERMS, are rendered as checkboxes on the Roles
-- page, and are in the whitelist that `updateMemberPermissions` writes
-- through. None of them is a column.
--
-- The consequence is worse than a dead checkbox. `applyStaffPreset` sends
-- zeroPerms() — every key in the list — on every call, so PostgREST rejects
-- the whole upsert with "could not find the column in the schema cache" and
-- **applying any staff preset fails outright**. Adding the columns is the fix
-- for that, not just for the two features that wanted them.
-- ---------------------------------------------------------------------------

alter table public.role_permissions
  add column if not exists mgr_respond_tickets    boolean default false,
  add column if not exists mgr_manage_resources   boolean default false,
  add column if not exists staff_manage_resources boolean default false;


-- ---------------------------------------------------------------------------
-- 2. WHERE A TICKET GOES
--
-- Two desks, one table.
--
--   agency   — the agency answers its own people. The default, because that
--              is who an agent asks first and who can usually answer.
--   platform — Agent Cloud answers. Where a solo agent's ticket starts (they
--              have no agency to ask), and where an agency ticket lands when
--              the agency escalates it.
--
-- Escalation keeps `organization_id`, so the agency that raised it can still
-- follow the thread rather than watching a ticket vanish upward.
-- ---------------------------------------------------------------------------

alter table public.support_tickets
  add column if not exists scope          text not null default 'agency',
  add column if not exists escalated_at   timestamptz,
  add column if not exists escalated_by   uuid references public.profiles(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_tickets_scope_check'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_scope_check check (scope in ('agency', 'platform'));
  end if;
end $$;

create index if not exists idx_support_tickets_scope
  on public.support_tickets(scope, status, created_at desc);

-- A ticket with no agency has nobody to answer it. Every one of those already
-- in the table belongs on the platform desk.
update public.support_tickets
   set scope = 'platform'
 where organization_id is null
   and scope = 'agency';

-- ...and the same rule for new ones, in a trigger rather than in the four
-- call sites that create tickets. It resolves the org itself instead of
-- relying on the stamping trigger having already run — before-insert triggers
-- fire in name order, and a rule that depends on alphabetical luck is a bug
-- waiting for a rename.
create or replace function public.route_support_ticket()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.organization_id is null and NEW.agent_id is not null then
    select organization_id into NEW.organization_id
      from public.profiles where id = NEW.agent_id;
  end if;

  if NEW.organization_id is null then
    NEW.scope := 'platform';
  end if;

  return NEW;
end $$;

drop trigger if exists trg_route_support_ticket on public.support_tickets;
create trigger trg_route_support_ticket
  before insert on public.support_tickets
  for each row execute function public.route_support_ticket();


-- ---------------------------------------------------------------------------
-- 3. WHO MAY WORK A TICKET
--
-- Until now: the reporter, the assignee (read-only, see below), and the org
-- owner. A manager the owner had ticked "respond to support tickets" for saw
-- nothing, and so did a client-services staffer whose whole preset is built
-- around ticket work.
-- ---------------------------------------------------------------------------

create or replace function public.can_work_tickets(_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select _org is not null and (
    public.is_org_admin(_org)
    or exists (
      select 1 from public.role_permissions rp
       where rp.profile_id = auth.uid()
         and rp.organization_id = _org
         and (coalesce(rp.mgr_respond_tickets, false)
              or coalesce(rp.staff_view_all_tickets, false)
              or coalesce(rp.staff_respond_tickets, false)
              or coalesce(rp.admin_view_agency_tickets, false))
    )
  )
$$;

-- Deliberately super_admin alone. `admin` is an agency-level role in this
-- schema — is_org_admin() grants on it — so treating it as a platform role
-- would let any agency admin read every other agency's escalations.
create or replace function public.is_platform_operator()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'super_admin')
$$;

grant execute on function public.can_work_tickets(uuid),
                         public.is_platform_operator()
  to authenticated;


-- ---------------------------------------------------------------------------
-- 4. THE POLICIES
--
-- Two different failures came out of one policy, and they failed differently.
-- Both were reproduced against this migration before and after.
--
-- The old `with check` read
--
--     agent_id = auth.uid() or (organization_id is not null and is_org_owner(...))
--
-- while `using` also allowed `assigned_to = auth.uid()`. So:
--
--   An assignee who was not the owner  — `using` let them see the row, so the
--     UPDATE found its target and then `with check` rejected the result:
--     "new row violates row-level security policy for table support_tickets",
--     raw, in a toast, on every status change and every assignment.
--
--   Anyone else on ticket duty — a manager with mgr_respond_tickets, a
--     client-services staffer — failed `using` outright. Their queue was
--     empty, so the UPDATE matched no rows at all. That one *is* silent:
--     Postgres does not error when `using` filters an UPDATE's target out,
--     it simply updates nothing and reports success.
--
-- Split by command rather than one `for all`, because the read set and the
-- write set are genuinely different: an assignee may act on a ticket but must
-- not be able to conjure one attributed to someone else.
-- ---------------------------------------------------------------------------

alter table public.support_tickets enable row level security;

drop policy if exists "admin_all"                on public.support_tickets;
drop policy if exists support_tickets_admin_all  on public.support_tickets;
drop policy if exists support_tickets_owner      on public.support_tickets;
drop policy if exists support_tickets_access     on public.support_tickets;
drop policy if exists support_tickets_read       on public.support_tickets;
drop policy if exists support_tickets_open       on public.support_tickets;
drop policy if exists support_tickets_work       on public.support_tickets;
drop policy if exists support_tickets_remove     on public.support_tickets;

create policy support_tickets_read on public.support_tickets
  for select to authenticated
  using (
    agent_id = auth.uid()
    or assigned_to = auth.uid()
    or public.can_work_tickets(organization_id)
    or (scope = 'platform' and public.is_platform_operator())
  );

-- You raise a ticket as yourself. Nothing else in the app files one on
-- somebody's behalf, and allowing it here would let anyone attribute a
-- complaint to another agent.
create policy support_tickets_open on public.support_tickets
  for insert to authenticated
  with check (agent_id = auth.uid());

create policy support_tickets_work on public.support_tickets
  for update to authenticated
  using (
    agent_id = auth.uid()
    or assigned_to = auth.uid()
    or public.can_work_tickets(organization_id)
    or (scope = 'platform' and public.is_platform_operator())
  )
  with check (
    agent_id = auth.uid()
    or assigned_to = auth.uid()
    or public.can_work_tickets(organization_id)
    or (scope = 'platform' and public.is_platform_operator())
  );

create policy support_tickets_remove on public.support_tickets
  for delete to authenticated
  using (agent_id = auth.uid() or public.can_work_tickets(organization_id));


-- Messages follow the ticket: the subselect runs through the SELECT policy
-- above, so widening who can see a ticket widens who can see its thread,
-- once, in one place.
alter table public.support_ticket_messages enable row level security;

drop policy if exists "admin_all_messages"              on public.support_ticket_messages;
drop policy if exists support_ticket_messages_admin_all on public.support_ticket_messages;
drop policy if exists support_ticket_messages_access    on public.support_ticket_messages;

create policy support_ticket_messages_access on public.support_ticket_messages
  for all to authenticated
  using (ticket_id in (select id from public.support_tickets))
  with check (
    sender_id = auth.uid()
    and ticket_id in (select id from public.support_tickets)
  );

notify pgrst, 'reload schema';
