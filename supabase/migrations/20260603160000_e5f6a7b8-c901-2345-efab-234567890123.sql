create table if not exists public.commission_level_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.profiles(id) on delete cascade not null,
  carrier_id uuid references public.carriers(id) on delete cascade not null,
  message text,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table public.commission_level_requests enable row level security;

create policy "own" on public.commission_level_requests
  using (agent_id = auth.uid());

create policy "upline_read" on public.commission_level_requests for select
  using (agent_id in (select id from public.profiles where upline_id = auth.uid()));
