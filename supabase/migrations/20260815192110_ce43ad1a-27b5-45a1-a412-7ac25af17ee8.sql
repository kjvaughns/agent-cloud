create table if not exists public.agent_debt_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  agent_name text not null,
  agent_number text,
  agent_email text,
  npn text,
  upline_name text,
  commission_level text,
  carrier_id uuid references public.carriers(id) on delete set null,
  carrier_name text,
  balance numeric(12, 2) not null default 0,
  unsecured_advance numeric(12, 2),
  unpaid_commission numeric(12, 2),
  age_of_debt integer,
  pending_policies integer,
  agent_status text,
  source_line text,
  as_of_date date,
  source_document_id uuid references public.document_intake(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_debt_balances_unique_idx
  on public.agent_debt_balances (organization_id, lower(agent_name), coalesce(lower(carrier_name), ''), coalesce(as_of_date, '1900-01-01'::date));

create index if not exists agent_debt_balances_agent_idx
  on public.agent_debt_balances (organization_id, agent_id);
create index if not exists agent_debt_balances_email_idx
  on public.agent_debt_balances (organization_id, lower(agent_email));

grant select, insert, update, delete on public.agent_debt_balances to authenticated;
grant all on public.agent_debt_balances to service_role;

alter table public.agent_debt_balances enable row level security;

drop policy if exists "debt readable by owner upline and admins" on public.agent_debt_balances;
create policy "debt readable by owner upline and admins"
  on public.agent_debt_balances for select
  to authenticated
  using (
    organization_id in (select public.my_org_ids())
    and (
      agent_id = auth.uid()
      or public.is_org_admin(organization_id)
      or public.is_org_owner(organization_id)
      or (agent_id is not null and public.is_in_downline(auth.uid(), agent_id))
    )
  );

drop policy if exists "debt writable by org admins" on public.agent_debt_balances;
create policy "debt writable by org admins"
  on public.agent_debt_balances for all
  to authenticated
  using (
    organization_id in (select public.my_org_ids())
    and (public.is_org_admin(organization_id) or public.is_org_owner(organization_id))
  )
  with check (
    organization_id in (select public.my_org_ids())
    and (public.is_org_admin(organization_id) or public.is_org_owner(organization_id))
  );

drop trigger if exists agent_debt_balances_updated_at on public.agent_debt_balances;
create trigger agent_debt_balances_updated_at
  before update on public.agent_debt_balances
  for each row execute function public.touch_updated_at();