-- ============================================================================
-- PHASE 4 — RETENTION QUEUES AND COMMISSION RECONCILIATION
-- ============================================================================

create table if not exists public.retention_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,

  policy_id uuid not null references public.policies(id) on delete cascade,
  agent_id  uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,

  risk_reason text not null default 'lapse_pending'
    check (risk_reason in ('lapse_pending','payment_failed','nsf','cancelled_pending','manual','no_contact')),
  risk_score integer not null default 0,

  status text not null default 'open'
    check (status in ('open','working','saved','lost','no_action')),

  outcome_note text,
  premium_at_risk numeric,

  opened_at   timestamptz not null default now(),
  contacted_at timestamptz,
  resolved_at timestamptz,
  updated_at  timestamptz not null default now(),

  constraint retention_cases_policy_status_sane check (status is not null)
);

grant select, insert, update, delete on public.retention_cases to authenticated;
grant all on public.retention_cases to service_role;

create index if not exists idx_retention_org      on public.retention_cases(organization_id, status, risk_score desc);
create index if not exists idx_retention_assignee on public.retention_cases(assigned_to, status);
create index if not exists idx_retention_agent    on public.retention_cases(agent_id, status);
create unique index if not exists idx_retention_one_open
  on public.retention_cases(policy_id) where status in ('open','working');

alter table public.retention_cases enable row level security;

drop policy if exists retention_cases_access on public.retention_cases;
create policy retention_cases_access on public.retention_cases
  for all to authenticated
  using (
    agent_id = auth.uid()
    or assigned_to = auth.uid()
    or (organization_id is not null
        and organization_id in (select public.my_org_ids())
        and (public.is_org_owner(organization_id)
             or public.is_in_downline(auth.uid(), agent_id)))
  )
  with check (
    agent_id = auth.uid()
    or assigned_to = auth.uid()
    or (organization_id is not null
        and organization_id in (select public.my_org_ids())
        and (public.is_org_owner(organization_id)
             or public.is_in_downline(auth.uid(), agent_id)))
  );

drop trigger if exists trg_stamp_org_retention on public.retention_cases;
create trigger trg_stamp_org_retention
  before insert on public.retention_cases
  for each row execute function public.stamp_organization_id('agent_id');

create or replace function public.touch_retention_case()
returns trigger
language plpgsql set search_path = public
as $$
begin
  NEW.updated_at := now();
  if NEW.status in ('saved','lost','no_action') and OLD.status not in ('saved','lost','no_action') then
    NEW.resolved_at := now();
  elsif NEW.status in ('open','working') then
    NEW.resolved_at := null;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_touch_retention_case on public.retention_cases;
create trigger trg_touch_retention_case
  before update on public.retention_cases
  for each row execute function public.touch_retention_case();

create or replace function public.sync_retention_cases(_org uuid default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  _inserted integer;
begin
  insert into public.retention_cases
    (organization_id, policy_id, agent_id, risk_reason, risk_score, premium_at_risk)
  select
    p.organization_id,
    p.id,
    p.agent_id,
    case p.status::text
      when 'lapse_pending' then 'lapse_pending'
      when 'nsf'           then 'nsf'
      else 'manual'
    end,
    least(100, round(coalesce(p.monthly_premium, 0))::integer
               + least(50, extract(day from now() - coalesce(p.updated_at, p.posted_at))::integer)),
    p.monthly_premium
  from public.policies p
  where p.status::text in ('lapse_pending','nsf')
    and (_org is null or p.organization_id = _org)
    and not exists (
      select 1 from public.retention_cases rc
       where rc.policy_id = p.id and rc.status in ('open','working')
    );

  get diagnostics _inserted = row_count;
  return _inserted;
end $$;

grant execute on function public.sync_retention_cases(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. COMMISSION RECONCILIATION
-- ---------------------------------------------------------------------------

create table if not exists public.commission_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,

  carrier_id uuid references public.carriers(id),
  carrier_name text,

  statement_date date not null,
  period_start date,
  period_end   date,

  file_name text,
  file_url  text,

  stated_total numeric,
  parsed_total numeric,

  status text not null default 'uploaded'
    check (status in ('uploaded','reconciled','disputed','closed')),

  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.commission_statements to authenticated;
grant all on public.commission_statements to service_role;

create index if not exists idx_comm_statements_org
  on public.commission_statements(organization_id, statement_date desc);

alter table public.commission_statements enable row level security;

drop policy if exists commission_statements_access on public.commission_statements;
create policy commission_statements_access on public.commission_statements
  for all to authenticated
  using (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
  )
  with check (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
  );

drop trigger if exists trg_stamp_org_comm_statements on public.commission_statements;
create trigger trg_stamp_org_comm_statements
  before insert on public.commission_statements
  for each row execute function public.stamp_organization_id('uploaded_by');

create table if not exists public.commission_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.commission_statements(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,

  policy_number text,
  insured_name  text,
  agent_name    text,
  product       text,
  paid_amount   numeric not null default 0,
  paid_date     date,

  matched_policy_id uuid references public.policies(id) on delete set null,
  matched_schedule_id uuid,
  matched_agent_id uuid references public.profiles(id) on delete set null,
  expected_amount numeric,
  variance numeric,

  match_status text not null default 'unmatched'
    check (match_status in ('unmatched','matched','variance','unexpected','disputed','resolved')),
  note text,

  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.commission_statement_lines to authenticated;
grant all on public.commission_statement_lines to service_role;

create index if not exists idx_comm_lines_statement on public.commission_statement_lines(statement_id);
create index if not exists idx_comm_lines_status    on public.commission_statement_lines(organization_id, match_status);
create index if not exists idx_comm_lines_policy    on public.commission_statement_lines(matched_policy_id);
create index if not exists idx_comm_lines_polnum    on public.commission_statement_lines(policy_number);

alter table public.commission_statement_lines enable row level security;

drop policy if exists commission_statement_lines_access on public.commission_statement_lines;
create policy commission_statement_lines_access on public.commission_statement_lines
  for all to authenticated
  using (statement_id in (select id from public.commission_statements))
  with check (statement_id in (select id from public.commission_statements));

create or replace function public.normalize_policy_number(_s text)
returns text
language sql immutable
as $$ select nullif(upper(regexp_replace(coalesce(_s,''), '[^A-Za-z0-9]', '', 'g')), '') $$;

create index if not exists idx_policies_norm_number
  on public.policies (public.normalize_policy_number(policy_number));

create or replace function public.reconcile_statement(_statement_id uuid)
returns table (matched integer, variance_count integer, unmatched integer)
language plpgsql security definer set search_path = public
as $$
declare
  _org uuid;
  _m integer; _v integer; _u integer;
begin
  select organization_id into _org
    from public.commission_statements where id = _statement_id;

  if _org is null or _org not in (
    select organization_id from public.organization_memberships
     where profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Statement not found' using errcode = 'insufficient_privilege';
  end if;

  update public.commission_statement_lines l
     set matched_policy_id = m.policy_id,
         matched_agent_id  = m.agent_id,
         expected_amount   = m.expected,
         variance          = case when m.policy_id is null then null
                                  else round(l.paid_amount - coalesce(m.expected, 0), 2) end,
         match_status = case
           when m.policy_id is null then 'unexpected'
           when abs(l.paid_amount - coalesce(m.expected, 0)) <= 0.01 then 'matched'
           else 'variance'
         end
    from (
      select
        cl.id as line_id,
        p.id  as policy_id,
        p.agent_id,
        (select sum(cs.amount) from public.commission_schedule cs where cs.policy_id = p.id) as expected
      from public.commission_statement_lines cl
      left join public.policies p
        on p.organization_id = _org
       and public.normalize_policy_number(p.policy_number)
         = public.normalize_policy_number(cl.policy_number)
       and public.normalize_policy_number(cl.policy_number) is not null
      where cl.statement_id = _statement_id
    ) m
   where l.id = m.line_id;

  select
    count(*) filter (where match_status = 'matched'),
    count(*) filter (where match_status = 'variance'),
    count(*) filter (where match_status in ('unmatched','unexpected'))
    into _m, _v, _u
    from public.commission_statement_lines
   where statement_id = _statement_id;

  update public.commission_statements
     set parsed_total = (select coalesce(sum(paid_amount), 0)
                           from public.commission_statement_lines
                          where statement_id = _statement_id),
         status = case when _v > 0 or _u > 0 then 'disputed' else 'reconciled' end,
         updated_at = now()
   where id = _statement_id;

  return query select _m, _v, _u;
end $$;

grant execute on function public.reconcile_statement(uuid) to authenticated;
grant execute on function public.normalize_policy_number(text) to authenticated;