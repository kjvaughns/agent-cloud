-- An announcement can be drafted, scheduled, aimed, and allowed to expire.
--
-- Today an announcement has exactly one life: written and immediately visible
-- to every member of the agency, forever. An owner who wants to prepare
-- Monday's message on Friday has to remember to come back and paste it; one
-- that only concerns managers goes to every agent as well; and last quarter's
-- bonus deadline sits at the top of the feed indefinitely, because nothing can
-- take it down but a delete, which destroys the record of it ever going out.
--
-- ── The lifecycle, derived rather than stored ──
--
--   status      'draft' | 'scheduled' | 'published'
--   publish_at  when a scheduled one starts being visible
--   expires_at  when any of them stops being visible
--
-- Whether a post is *currently* visible is computed from those three, never
-- stored:
--
--   visible = (status = 'published'
--              or (status = 'scheduled' and publish_at <= now()))
--             and (expires_at is null or expires_at > now())
--
-- That is deliberate, and it is the reason this migration adds no background
-- job. A stored `status` that some scheduler has to flip is a status that is
-- wrong for as long as the scheduler is down, and this repository has no
-- scheduler it can create: the one pg_cron job the product uses is applied
-- through the Supabase Management API by an external tool and calls an Edge
-- Function that does not live here (see 20260611022622_email_infra.sql:285).
-- Deriving visibility means a scheduled announcement appears on time because
-- time passed, not because a job ran.
--
-- Sending it to Discord and email is the one part that genuinely needs
-- something to fire, and that is handled in the application by a dispatch
-- function guarded by the existing `announcement_deliveries` ledger, so
-- calling it twice cannot send twice.
--
-- ── Targeting ──
--
--   target_roles      text[]  empty means everybody
--   target_upline_id  uuid    null means everybody; set means that person's
--                             downline, and that person
--
-- Both are additive filters on the read policy. An empty array and a null
-- upline reproduce today's behaviour exactly, which is what every existing row
-- gets.
--
-- Forward only. Nothing is dropped, every existing announcement keeps every
-- value it has, and each one defaults to `published` with no targeting — which
-- is precisely what it is today.

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

-- The feed filters on these on every read.
create index if not exists idx_announcements_org_visibility
  on public.announcements (organization_id, status, publish_at desc);
create index if not exists idx_announcements_expiry
  on public.announcements (expires_at)
  where expires_at is not null;

-- ── Who can see it ──
--
-- Replaces the org-only rule from 20260814200000. Three things are added and
-- nothing is taken away from an owner:
--
--   * a draft, or a scheduled post whose time has not come, is visible only to
--     the person who wrote it and to the agency owner — otherwise "draft"
--     would mean "published, but labelled draft"
--   * an expired post drops out of the feed, and stays readable to its author,
--     because the record of what went out must survive the thing going out
--   * targeting narrows the audience by role and by downline
--
-- `is_org_owner` and `is_in_downline` are the same helpers every other policy
-- in this schema uses, so the vocabulary does not fork.
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
