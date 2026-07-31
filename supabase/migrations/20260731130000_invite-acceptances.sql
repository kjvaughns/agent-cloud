-- ---------------------------------------------------------------------------
-- Who accepted which invite.
--
-- Invite links are shareable and reusable — one link, many agents. Acceptance
-- was previously recorded by stamping linked_agent_id and onboarding_step onto
-- the invitation_links row itself, which only works if exactly one person ever
-- uses it. With a reusable link the second person overwrote the first, and the
-- stamped onboarding_step made the shared link resume mid-wizard for everybody
-- who opened it afterwards.
--
-- Acceptances belong in their own table for the same reason a policy does not
-- live on the agent row: there are many of them per link.
-- ---------------------------------------------------------------------------

create table if not exists public.invite_acceptances (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitation_links(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  -- One row per person per link. Re-opening a link you already accepted should
  -- not add a second acceptance.
  unique (invitation_id, profile_id)
);

alter table public.invite_acceptances enable row level security;

create index if not exists idx_invite_acceptances_invitation
  on public.invite_acceptances(invitation_id);

-- You can see that you accepted, and the person whose link it is can see who
-- accepted theirs. Nobody else has a reason to.
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

-- Writes happen server-side through the service role during signup, when the
-- accepting user may not have a session yet. No client-side insert policy.
