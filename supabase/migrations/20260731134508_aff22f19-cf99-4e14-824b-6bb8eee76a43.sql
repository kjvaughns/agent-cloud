create table if not exists public.invite_acceptances (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitation_links(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, profile_id)
);

grant select on public.invite_acceptances to authenticated;
grant all on public.invite_acceptances to service_role;

alter table public.invite_acceptances enable row level security;

create index if not exists idx_invite_acceptances_invitation
  on public.invite_acceptances(invitation_id);
create index if not exists idx_invite_acceptances_profile
  on public.invite_acceptances(profile_id);

drop policy if exists invite_acceptances_read on public.invite_acceptances;
create policy invite_acceptances_read on public.invite_acceptances
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.invitation_links il
       where il.id = invitation_id
         and il.created_by = auth.uid()
    )
  );

drop trigger if exists trg_touch_invite_acceptances on public.invite_acceptances;
create trigger trg_touch_invite_acceptances
  before update on public.invite_acceptances
  for each row execute function public.touch_updated_at();

-- 'assigned' contract status
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status' AND typnamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
       WHERE enumlabel = 'assigned'
         AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contract_status' AND typnamespace = 'public'::regnamespace)
    ) THEN
      ALTER TYPE public.contract_status ADD VALUE 'assigned' BEFORE 'requested';
    END IF;
  ELSE
    CREATE TYPE public.contract_status AS ENUM (
      'assigned', 'requested', 'submitted', 'processing', 'issue', 'active', 'rejected'
    );
  END IF;
END $$;

-- Admin-only read of the applied migration log.
create or replace function public.list_applied_migrations()
returns table (version text, name text)
language plpgsql
stable
security definer
set search_path = public, supabase_migrations
as $$
begin
  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  ) then
    raise exception 'Admin role required';
  end if;

  return query
    select m.version::text, coalesce(m.name, '')::text
      from supabase_migrations.schema_migrations m
     order by m.version desc;
end;
$$;

revoke all on function public.list_applied_migrations() from public;
grant execute on function public.list_applied_migrations() to authenticated;
grant execute on function public.list_applied_migrations() to service_role;