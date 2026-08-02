create table if not exists public.nova_conversations (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  title           text not null default 'New conversation',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.nova_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nova_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_nova_conversations_agent
  on public.nova_conversations(agent_id, updated_at desc);
create index if not exists idx_nova_messages_conversation
  on public.nova_messages(conversation_id, created_at);

grant select, insert, update, delete on public.nova_conversations to authenticated;
grant select, insert, update, delete on public.nova_messages to authenticated;
grant all on public.nova_conversations to service_role;
grant all on public.nova_messages to service_role;

alter table public.nova_conversations enable row level security;
alter table public.nova_messages enable row level security;

drop policy if exists nova_conversations_own on public.nova_conversations;
create policy nova_conversations_own on public.nova_conversations
  for all to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

drop policy if exists nova_messages_own on public.nova_messages;
create policy nova_messages_own on public.nova_messages
  for all to authenticated
  using (conversation_id in (select id from public.nova_conversations))
  with check (conversation_id in (select id from public.nova_conversations));

create or replace function public.touch_nova_conversation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.nova_conversations
     set updated_at = now()
   where id = NEW.conversation_id;
  return NEW;
end $$;

drop trigger if exists trg_touch_nova_conversation on public.nova_messages;
create trigger trg_touch_nova_conversation
  after insert on public.nova_messages
  for each row execute function public.touch_nova_conversation();

notify pgrst, 'reload schema';