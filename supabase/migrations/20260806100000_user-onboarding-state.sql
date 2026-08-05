-- ============================================================================
-- ONBOARDING STATE BELONGS TO A PERSON, NOT AN AGENCY
--
-- `organization_setup_state` is keyed on organization_id, which was right when
-- the checklist was one owner-only list about setting the agency up. It is
-- wrong now that every role gets its own: an owner dismissing their checklist
-- would hide the agents' checklists too, and one agent finishing a tour would
-- mark it finished for the whole agency.
--
-- So this is per-user. It deliberately does NOT record which steps are done —
-- completion is derived from database state on every read, so the list cannot
-- drift out of sync with reality and self-completes when somebody does the
-- thing on their own. The only things worth persisting are the choices a
-- person made about the checklist itself: what they dismissed, and which tours
-- they have already seen.
--
-- organization_id is stored alongside rather than joined at read time because
-- an account that moves between organizations should start its onboarding
-- again; a stale row from a previous agency is not a head start.
-- ============================================================================

create table if not exists public.user_onboarding_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  dismissed_steps text[] not null default '{}',
  checklist_dismissed boolean not null default false,
  completed_tours text[] not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table public.user_onboarding_state is
  'Per-person onboarding preferences: what they dismissed and which tours they have seen. Step completion is never stored here — it is derived from real data on every read so the checklist cannot go stale.';

create index if not exists idx_user_onboarding_state_org
  on public.user_onboarding_state (organization_id);

alter table public.user_onboarding_state enable row level security;

-- Your own row, and only your own. Nothing here is anybody else's business:
-- a manager has no reason to know which tours an agent skipped, and making it
-- visible would turn a convenience into something people feel watched by.
drop policy if exists user_onboarding_state_own on public.user_onboarding_state;
create policy user_onboarding_state_own on public.user_onboarding_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
