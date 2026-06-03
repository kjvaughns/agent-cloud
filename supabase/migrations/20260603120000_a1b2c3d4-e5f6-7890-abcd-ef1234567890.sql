-- Add unique constraint so agent+phone upsert works for AgentLink import
alter table public.clients
  add constraint clients_agent_phone_unique unique (agent_id, phone);

-- Banking table for AgentLink imported banking info
create table if not exists public.client_banking (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null unique,
  bank_name text,
  routing_number text,
  account_number_masked text,
  account_type text default 'checking',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.client_banking enable row level security;

create policy "agent_own" on public.client_banking using (
  client_id in (select id from public.clients where agent_id = auth.uid())
);
