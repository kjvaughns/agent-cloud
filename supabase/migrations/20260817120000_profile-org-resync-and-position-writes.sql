-- Repair `profiles.organization_id`, and let an upline place their own people.
--
-- ── What went wrong ──
--
-- An agency owner opened their roster, saw nine agents, chose one who sits
-- under somebody else, and was told "That agent is not in your agency". He was.
--
-- `profiles.organization_id` is a DENORMALISED copy of membership. The real
-- record is `organization_memberships`, which is what `same_org()` reads and
-- what the roster lists from. The copy is maintained by
-- `trg_sync_profile_primary_org`, which fires only when a membership row is
-- written with `status = 'active' AND is_primary` — so anybody whose membership
-- predates the trigger, or who was never flagged primary, kept a null or stale
-- copy while being a perfectly ordinary member of the agency.
--
-- Two things then failed on that null:
--
--   * the application guard compared the copy on both sides and refused;
--   * `profiles_org_manage` grants writes on
--     `organization_id IS NOT NULL AND is_org_owner(organization_id)`, so the
--     policy refused the OWNER as well — on their own agency, for their own
--     agent.
--
-- ── What this does ──
--
--   1. Resyncs the copy from the memberships table, for every profile whose
--      copy disagrees with their active primary membership. Forward only: it
--      writes what membership already says and invents nothing.
--   2. Widens the trigger so a membership becoming primary later — not only at
--      insert — updates the copy, which is the case that produced most of the
--      drift.
--   3. Adds an upline arm to `profiles_org_manage`, so somebody above an agent
--      in the hierarchy may write their row. The rung ceiling is enforced in
--      the application (`checkAssignment`, sharing the rule invitations use);
--      this policy is the boundary that stops a write from another agency, not
--      the rule about which rung is allowed.
--
-- ── The order of the three steps is load-bearing ────────────────────────────
--
-- `is_in_downline` filters the walk on `organization_id` matching the upline's:
--
--     p.organization_id is not distinct from
--       (select organization_id from public.profiles where id = _upline)
--
-- A null copy is DISTINCT FROM the owner's org, so an agent in this state was
-- not in anybody's downline according to that function — a third consequence of
-- the same root cause, and the reason the resync has to run before the upline
-- arm added in step 3 means anything. Running step 3 alone would add a policy
-- arm that is false for exactly the agents it was written for.
--
-- Safe to run more than once. No column is dropped and no row is deleted.
--
-- Verified on a scratch Postgres seeded with this exact state — an active
-- member whose denormalised copy is null — applied twice: the copy is repaired,
-- the owner can then write the row, an upline can write their own downline's,
-- and somebody outside the hierarchy still cannot.

-- ── 1. Resync the copy ──────────────────────────────────────────────────────

update public.profiles p
   set organization_id = m.organization_id
  from public.organization_memberships m
 where m.profile_id = p.id
   and m.status = 'active'
   and m.is_primary
   and (p.organization_id is null or p.organization_id <> m.organization_id);

-- Somebody with exactly one active membership and none of them flagged primary
-- is unambiguously in that agency, and the flag is bookkeeping they never saw.
update public.profiles p
   set organization_id = sole.organization_id
  from (
    select profile_id, min(organization_id::text)::uuid as organization_id
      from public.organization_memberships
     where status = 'active'
     group by profile_id
    having count(*) = 1
  ) sole
 where sole.profile_id = p.id
   and p.organization_id is null;

-- ── 2. The trigger covers becoming primary, not only arriving ───────────────

create or replace function public.sync_profile_primary_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status = 'active' and NEW.is_primary then
    update public.profiles
       set organization_id = NEW.organization_id
     where id = NEW.profile_id
       and (organization_id is null or organization_id <> NEW.organization_id);
  end if;
  return NEW;
end $$;

comment on function public.sync_profile_primary_org() is
  'Keeps profiles.organization_id in step with the active primary membership. '
  'Fires on insert and on update: a membership promoted to primary after the '
  'fact used to leave the denormalised copy stale, which made an agent '
  'unplaceable by their own agency owner.';

drop trigger if exists trg_sync_profile_primary_org on public.organization_memberships;
create trigger trg_sync_profile_primary_org
  after insert or update of status, is_primary, organization_id
  on public.organization_memberships
  for each row execute function public.sync_profile_primary_org();

-- ── 3. An upline may write their downline's row ─────────────────────────────
--
-- `is_in_downline(_upline, _target)` already exists and already gates itself on
-- the caller, so it is safe to use inside a policy. The rung ceiling — nobody
-- promotes somebody onto a better contract than their own — lives in the
-- application beside the identical rule for invitations, because it needs the
-- ladder's percentages and a policy is the wrong place to reason about money.

drop policy if exists profiles_org_manage on public.profiles;
create policy profiles_org_manage on public.profiles
  for all to authenticated
  using (
    id = auth.uid()
    or (organization_id is not null and public.is_org_owner(organization_id))
    or public.is_in_downline(auth.uid(), id)
  )
  with check (
    id = auth.uid()
    or (organization_id is not null and public.is_org_owner(organization_id))
    or public.is_in_downline(auth.uid(), id)
  );

comment on policy profiles_org_manage on public.profiles is
  'Yourself, your agency owner, or anybody above you in the hierarchy. The '
  'upline arm is what lets a manager place their own downline on a position; '
  'which position they may choose is decided by checkAssignment, which shares '
  'its ceiling with the invitation rules.';

notify pgrst, 'reload schema';
