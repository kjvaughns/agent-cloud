-- ============================================================================
-- PHASE 7 — CLEANUP AND CONFIGURABLE PLANS
-- ============================================================================

create table if not exists public.plans (
  key text primary key,
  name text not null,
  monthly_price numeric not null default 0,
  setup_price numeric not null default 0,
  included_seats integer not null default 0,
  seat_overage_price numeric not null default 0,
  stripe_price_env text,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

grant select on public.plans to authenticated;
grant select on public.plans to anon;
grant all on public.plans to service_role;

alter table public.plans enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans
  for select to authenticated, anon
  using (active);

insert into public.plans
  (key, name, monthly_price, setup_price, included_seats, seat_overage_price, stripe_price_env, description, sort_order)
values
  ('solo_agent',      'Solo Agent Plan',  50,   0,  0,  0, 'STRIPE_SOLO_PLAN_PRICE_ID',
   'Full CRM, book of business and commission tracking for one producer. Nova AI Pro sold separately.', 1),
  ('agency_plan',     'Agency Plan',     399,   0, 15, 25, 'STRIPE_AGENCY_PLAN_PRICE_ID',
   'Team management, recruiting, contracting and analytics. Includes 15 agents.', 2),
  ('nova_pro',        'Nova AI Pro',      49,   0,  0,  0, 'STRIPE_NOVA_PRO_AGENT_PRICE_ID',
   'Dedicated business number, automations and retention alerts.', 3),
  ('white_label',     'White Label',     499, 999,  0,  0, 'STRIPE_WHITE_LABEL_MONTHLY_PRICE_ID',
   'Your branding, your domain. Requires an active Agency Plan.', 4)
on conflict (key) do update set
  name               = excluded.name,
  monthly_price      = excluded.monthly_price,
  setup_price        = excluded.setup_price,
  included_seats     = excluded.included_seats,
  seat_overage_price = excluded.seat_overage_price,
  description        = excluded.description,
  updated_at         = now();

-- ---------------------------------------------------------------------------
-- 2. FAQ CONTENT
-- ---------------------------------------------------------------------------

do $do$
begin
  if not exists (select 1 from public.faq_items limit 1) then
    insert into public.faq_items (section, question, answer, sort_order) values
    ('Commissions', 'When do I get paid my advance commission?',
     'On the policy effective date the system schedules 75% of your first-year commission as an advance. The remaining 25% is split evenly across months 10, 11, and 12. GTL products use a different schedule — 50% advance capped at $600 and balance over months 7–12.', 1),
    ('Commissions', 'How do override commissions work?',
     'You earn the spread between your commission level and your direct downline''s level on their personal production. Each upline in the chain only earns their differential — not the full amount.', 2),
    ('Commissions', 'Can my downline see my commission level?',
     'No. Agents only see their own level and any levels below it in the commission grids. Levels above are completely hidden.', 3),
    ('Contracting', 'Why can''t I request an annuity contract?',
     'Annuity contracts are gated on a completed Best Interest / Suitability course. Upload your WebCE certificate and the carriers will unlock automatically.', 4),
    ('Contracting', 'How do I invite a new agent?',
     'Contracts → Invite Agent. Create a link, assign carriers and commission levels (at or below your own), then share. Their contracting paperwork is pre-filled when they sign up.', 5),
    ('Account', 'What''s the difference between Login Email and Contact Email?',
     'Login Email is the credential you sign in with and never changes once set. Contact Email is what your prospects see and what carriers email you at — change it any time from Producer Profile.', 6),
    ('Nova AI', 'How does Nova Policy Recovery decide who to call?',
     'Nova targets policies in Lapse Pending status. When enabled, it dials the client, attempts re-engagement, and live-transfers warm leads back to you. You can pause it any time.', 7),
    ('Nova AI', 'What is the wallet for?',
     'Wallet funds power SMS, MMS, voice calls, and Nova Policy Recovery AI minutes. Top up from My Phone → Wallet.', 8);
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. RETIRE THE DUPLICATE EMPTY NOVA TABLES
-- ---------------------------------------------------------------------------

do $do$
declare
  _n bigint;
begin
  if to_regclass('public.nova_settings') is not null then
    execute 'select count(*) from public.nova_settings' into _n;
    if _n = 0 then
      execute 'drop table public.nova_settings cascade';
    end if;
  end if;

  if to_regclass('public.nova_activity') is not null then
    execute 'select count(*) from public.nova_activity' into _n;
    if _n = 0 then
      execute 'drop table public.nova_activity cascade';
    end if;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 4. AUDIT LOG COVERAGE
-- ---------------------------------------------------------------------------

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  _org uuid;
  _target uuid;
begin
  execute format('select ($1).%I', TG_ARGV[1])
    into _target using coalesce(NEW, OLD);

  select organization_id into _org from public.profiles where id = _target;

  insert into public.audit_log
    (organization_id, performed_by, action, target_user_id, previous_value, new_value)
  values (
    _org,
    auth.uid(),
    TG_ARGV[0],
    _target,
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
  );

  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_audit_user_roles on public.user_roles;
create trigger trg_audit_user_roles
  after insert or delete on public.user_roles
  for each row execute function public.audit_row_change('role_changed', 'user_id');

drop trigger if exists trg_audit_commission_levels on public.agent_commission_levels;
create trigger trg_audit_commission_levels
  after insert or update or delete on public.agent_commission_levels
  for each row execute function public.audit_row_change('commission_level_changed', 'agent_id');

create or replace function public.audit_profile_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status is distinct from OLD.status then
    insert into public.audit_log
      (organization_id, performed_by, action, target_user_id, previous_value, new_value)
    values (
      NEW.organization_id, auth.uid(), 'agent_status_changed', NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  end if;
  return NEW;
end $$;

drop trigger if exists trg_audit_profile_status on public.profiles;
create trigger trg_audit_profile_status
  after update of status on public.profiles
  for each row execute function public.audit_profile_status();

-- ---------------------------------------------------------------------------
-- 5. RE-SCOPE carrier_sync_logs
-- ---------------------------------------------------------------------------

do $do$
begin
  if to_regclass('public.carrier_sync_logs') is null then
    return;
  end if;

  execute 'alter table public.carrier_sync_logs
             add column if not exists organization_id uuid references public.organizations(id) on delete cascade';

  execute 'update public.carrier_sync_logs l
              set organization_id = p.organization_id
             from public.profiles p
            where l.uploaded_by = p.id
              and l.organization_id is null
              and p.organization_id is not null';

  execute 'create index if not exists idx_carrier_sync_logs_org
             on public.carrier_sync_logs(organization_id, created_at desc)';

  execute 'drop trigger if exists trg_stamp_org_carrier_sync_logs on public.carrier_sync_logs';
  execute 'create trigger trg_stamp_org_carrier_sync_logs
             before insert on public.carrier_sync_logs
             for each row execute function public.stamp_organization_id(''uploaded_by'')';

  execute 'drop policy if exists carrier_sync_logs_select on public.carrier_sync_logs';
  execute 'create policy carrier_sync_logs_select on public.carrier_sync_logs
             for select to authenticated
             using (
               uploaded_by = auth.uid()
               or (organization_id is not null
                   and organization_id in (select public.my_org_ids())
                   and (public.is_org_owner(organization_id)
                        or public.is_in_downline(auth.uid(), uploaded_by)))
             )';
end
$do$;