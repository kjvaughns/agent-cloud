alter table public.announcements
  add column if not exists status text not null default 'published',
  add column if not exists publish_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists target_roles text[] not null default '{}',
  add column if not exists target_upline_id uuid references public.profiles(id) on delete set null;

comment on column public.announcements.status is
  'draft | scheduled | published. Whether a post is visible RIGHT NOW is derived from this together with publish_at and expires_at — never stored, so nothing has to run for a scheduled post to appear or an expired one to go.';
comment on column public.announcements.target_roles is
  'Empty array means everybody, which is what every pre-existing row carries.';
comment on column public.announcements.target_upline_id is
  'Null means everybody. Set means this person and their downline.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_status_check') then
    alter table public.announcements
      add constraint announcements_status_check
      check (status in ('draft', 'scheduled', 'published'));
  end if;
  -- A scheduled post with no date would never become visible, and would look
  -- to its author exactly like one that had been published.
  if not exists (select 1 from pg_constraint where conname = 'announcements_scheduled_needs_date') then
    alter table public.announcements
      add constraint announcements_scheduled_needs_date
      check (status <> 'scheduled' or publish_at is not null);
  end if;
  -- An announcement that expires before it appears is a mistake every time.
  if not exists (select 1 from pg_constraint where conname = 'announcements_expiry_after_publish') then
    alter table public.announcements
      add constraint announcements_expiry_after_publish
      check (expires_at is null or publish_at is null or expires_at > publish_at);
  end if;
end $$;

create index if not exists idx_announcements_org_visibility
  on public.announcements (organization_id, status, publish_at desc);
create index if not exists idx_announcements_expiry
  on public.announcements (expires_at)
  where expires_at is not null;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to authenticated
  using (
    organization_id in (select public.my_org_ids())
    and (
      -- The author and the owner see everything, at every stage.
      created_by = auth.uid()
      or public.is_org_owner(organization_id)
      or (
        (status = 'published' or (status = 'scheduled' and publish_at <= now()))
        and (expires_at is null or expires_at > now())
        and (
          cardinality(target_roles) = 0
          or exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid()
              and ur.role::text = any (target_roles)
          )
        )
        and (
          target_upline_id is null
          or target_upline_id = auth.uid()
          or public.is_in_downline(target_upline_id, auth.uid())
        )
      )
    )
  );

notify pgrst, 'reload schema';