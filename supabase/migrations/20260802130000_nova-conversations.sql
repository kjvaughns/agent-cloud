-- ---------------------------------------------------------------------------
-- NOVA REMEMBERS
--
-- The chat held its history in React state. It was a real back-and-forth for
-- as long as you stayed on the page, and the moment you navigated away — to
-- look up the client you were asking about — every word of it was gone. You
-- came back to an empty box and started again.
--
-- Two tables, owned by the agent, nobody else.
-- ---------------------------------------------------------------------------

create table if not exists public.nova_conversations (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  -- Taken from the opening question rather than asked for. Nobody titles a
  -- conversation before having it.
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

alter table public.nova_conversations enable row level security;
alter table public.nova_messages enable row level security;

-- Yours alone. Deliberately no downline or owner branch: a manager reading
-- what their agents asked an assistant in private is not a feature, and the
-- rest of this schema lets an owner see plenty without this.
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

-- Ordering the thread list by "when did I last say something" needs the
-- parent touched on every message, and a trigger is the only way that cannot
-- be forgotten by a caller.
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
