-- support_tickets
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number serial,
  agent_id uuid references auth.users(id) not null,
  subject text not null,
  category text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  description text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id),
  sender_role text default 'agent',
  body text not null,
  created_at timestamptz default now()
);

alter table public.support_tickets enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'support_tickets' and policyname = 'agents_own'
  ) then
    create policy "agents_own" on public.support_tickets using (agent_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'support_tickets' and policyname = 'admin_all'
  ) then
    create policy "admin_all" on public.support_tickets using (
      auth.uid() in (select user_id from user_roles where role in ('admin', 'manager'))
    );
  end if;
end $$;

alter table public.support_ticket_messages enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'support_ticket_messages' and policyname = 'agent_own_messages'
  ) then
    create policy "agent_own_messages" on public.support_ticket_messages using (
      ticket_id in (select id from support_tickets where agent_id = auth.uid())
    );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'support_ticket_messages' and policyname = 'admin_all_messages'
  ) then
    create policy "admin_all_messages" on public.support_ticket_messages using (
      auth.uid() in (select user_id from user_roles where role in ('admin', 'manager'))
    );
  end if;
end $$;

-- Admin activity log
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

alter table public.admin_audit_log enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'admin_audit_log' and policyname = 'admin_only'
  ) then
    create policy "admin_only" on public.admin_audit_log using (
      auth.uid() in (select user_id from user_roles where role = 'admin')
    );
  end if;
end $$;

-- Unique constraint on user_roles.user_id for upsert
alter table public.user_roles drop constraint if exists user_roles_user_id_key;
alter table public.user_roles add constraint user_roles_user_id_key unique (user_id);
