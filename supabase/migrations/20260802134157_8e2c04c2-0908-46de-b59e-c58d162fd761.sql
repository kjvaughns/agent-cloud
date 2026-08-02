alter table public.role_permissions
  add column if not exists mgr_respond_tickets    boolean default false,
  add column if not exists mgr_manage_resources   boolean default false,
  add column if not exists staff_manage_resources boolean default false;

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

update public.support_tickets
   set scope = 'platform'
 where organization_id is null
   and scope = 'agency';

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

create or replace function public.is_platform_operator()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'super_admin')
$$;

grant execute on function public.can_work_tickets(uuid),
                         public.is_platform_operator()
  to authenticated;

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