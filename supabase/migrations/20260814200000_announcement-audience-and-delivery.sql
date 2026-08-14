-- ---------------------------------------------------------------------------
-- ANNOUNCEMENTS: STOP LEAKING, START WORKING, THEN REACH SUB-AGENCIES
--
-- Three problems, and the first two are why this migration leads with repair
-- rather than with the feature it was written for.
--
--   1. `createAnnouncement` never set organization_id. The write policy from
--      the org-isolation work reads
--
--          organization_id is not null and is_org_owner(organization_id)
--
--      so an insert with a null org fails that check outright. Posting an
--      announcement has been rejected for agency owners since that policy
--      landed.
--
--   2. The read policy is `organization_id is null or organization_id in
--      (my_org_ids())`. That null arm was a kindness to pre-isolation rows,
--      and it means any row that DID reach the table without an org is
--      readable by every authenticated user of every agency on the platform.
--      One agency's internal notice, published to all of them.
--
--   3. There was no way to say who an announcement is for.
--
-- The backfill runs first, attributing every orphan to its author's
-- organization — the same rule the org-isolation migration used, re-run for
-- everything created since. Only then is the null arm dropped.
--
-- Be clear about what dropping it does: a row that still cannot be attributed
-- afterwards — an author with no organization, or one whose profile is gone —
-- becomes invisible instead of global. That is the fix and not a side effect.
-- Nothing is deleted; an orphan row stays exactly where it is and can be
-- attributed by hand later if anybody wants it back.
--
-- The feature half is small by comparison: an audience, a group id so one
-- send to several agencies reads as one entry in the sender's own feed, and a
-- ledger of what went out on which channel.
-- ---------------------------------------------------------------------------

-- ── 1 · Repair ─────────────────────────────────────────────────────────────

update public.announcements a
   set organization_id = p.organization_id
  from public.profiles p
 where a.created_by = p.id
   and a.organization_id is null
   and p.organization_id is not null;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

-- ── 2 · Audience ───────────────────────────────────────────────────────────

alter table public.announcements
  add column if not exists audience text not null default 'agency',
  -- One send to a parent and its children writes one row per agency, so each
  -- agency's own feed shows it under RLS that already works. The group id ties
  -- those rows back together for the sender.
  add column if not exists announcement_group_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_audience_check'
  ) then
    alter table public.announcements
      add constraint announcements_audience_check
      check (audience in ('agency', 'agency_and_subs'));
  end if;
end $$;

create index if not exists idx_announcements_group
  on public.announcements(announcement_group_id)
  where announcement_group_id is not null;

-- ── 3 · What went out, and where ───────────────────────────────────────────

-- Deliberately not an extension of `discord_deliveries`: that table is keyed
-- to policy events and carries a policy_id, and announcements are neither.
create table if not exists public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'discord')),
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  -- Who or where: a profile id, an address, a channel label. Free text because
  -- the three channels do not share an addressing scheme.
  target text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcement_deliveries_announcement
  on public.announcement_deliveries(announcement_id, created_at desc);

alter table public.announcement_deliveries enable row level security;

-- Readable by the agency it belongs to, which is the same audience that can
-- read the announcement. Writes come from the server on the caller's behalf.
drop policy if exists announcement_deliveries_read on public.announcement_deliveries;
create policy announcement_deliveries_read on public.announcement_deliveries
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

drop policy if exists announcement_deliveries_write on public.announcement_deliveries;
create policy announcement_deliveries_write on public.announcement_deliveries
  for all to authenticated
  using (
    (organization_id is not null and public.is_org_owner(organization_id))
    or public.is_platform_admin()
  );

notify pgrst, 'reload schema';
