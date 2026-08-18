-- An agent's agency is derivable from their upline, and now is.
--
-- ── The deadlock ──
--
-- Three things claim to know which agency somebody belongs to:
--
--   organization_memberships   the record
--   profiles.organization_id   a denormalised copy of it
--   profiles.upline_id         who they report to
--
-- Two triggers keep the first two in step, and each requires the other to have
-- already worked:
--
--   sync_membership_from_profile  returns immediately when organization_id is
--                                 null, so no membership row is written
--   sync_profile_primary_org      fires from a membership row, so it never runs
--                                 for somebody who has none
--
-- An agent who arrives with neither is therefore invisible to both, forever.
-- Nothing in the database ever repairs them, and every org-scoped feature
-- fails for them in a different way:
--
--   * `org_carriers_read` gates on `my_org_ids()`, which is memberships only —
--     so they see NO carriers, and cannot request one.
--   * `agency_levels_read` gates on `profiles.organization_id` — so the ladder
--     is empty for them: no position they can assign to their own downline,
--     and no level names to display when somebody else changes one.
--   * `getMyOrgIds` in the application finds neither, so `announceDeal` skips
--     with `no_organization` and their deals never reach Discord.
--
-- One missing row, three unrelated-looking bug reports. This is the same root
-- cause as the position-assignment failure fixed in 20260817120000, which
-- repaired membership → profile and could not help anybody who has no
-- membership to repair from.
--
-- ── The third source ──
--
-- `upline_id` is the one thing these agents DO have — it is why the roster can
-- list them while everything org-scoped cannot. So the agency is resolved by
-- walking up the hierarchy to the first ancestor who has one, which is the
-- same answer a human would give looking at the org chart.
--
-- ── Order is load-bearing ──
--
-- The backfills run BEFORE the policy and function changes. Step 5 widens
-- `my_org_ids()` and step 6 moves `agency_levels_read` onto it; running either
-- first would briefly change who can read what for people the backfill is
-- about to fix.
--
-- Safe to run more than once. Nothing is dropped, no row is deleted, and every
-- write is conditional on the value being absent.

-- ── 1. Which agency does this profile's upline belong to? ───────────────────

create or replace function public.org_of_upline(_profile uuid)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  cursor_id uuid := _profile;
  seen uuid[] := array[]::uuid[];
  found uuid;
begin
  -- Depth-capped and cycle-guarded: `upline_id` is not constrained acyclic,
  -- and a loop here would hang every insert on profiles.
  for i in 1..20 loop
    if cursor_id is null or cursor_id = any(seen) then
      return null;
    end if;
    seen := seen || cursor_id;

    -- Membership first, because it is the record; the copy is the fallback.
    select m.organization_id into found
      from public.organization_memberships m
     where m.profile_id = cursor_id and m.status = 'active'
     order by m.is_primary desc
     limit 1;
    if found is not null then return found; end if;

    select p.organization_id into found
      from public.profiles p where p.id = cursor_id;
    if found is not null then return found; end if;

    select p.upline_id into cursor_id
      from public.profiles p where p.id = cursor_id;
  end loop;
  return null;
end $$;

comment on function public.org_of_upline(uuid) is
  'The agency a profile belongs to, derived by walking upline_id to the first '
  'ancestor that has one. The third source of truth, and the only one that '
  'still knows where an agent belongs when their membership row is missing and '
  'the denormalised copy is null.';

grant execute on function public.org_of_upline(uuid) to authenticated;

-- ── 2. Fill the copy for anybody the hierarchy can place ───────────────────

update public.profiles p
   set organization_id = public.org_of_upline(p.upline_id)
 where p.organization_id is null
   and p.upline_id is not null
   and public.org_of_upline(p.upline_id) is not null;

-- ── 3. Give every profile with an agency the membership row that says so ───
--
-- Same statement as 20260802175000, re-run to catch profiles created since —
-- including the ones step 2 has just repaired. Reusing its exact shape,
-- role derivation included, keeps one definition of what a backfilled
-- membership looks like.

insert into public.organization_memberships
  (organization_id, profile_id, role, status, is_primary)
select
  p.organization_id,
  p.id,
  coalesce((select ur.role::text from public.user_roles ur
             where ur.user_id = p.id
             order by case ur.role::text
               when 'super_admin' then 1 when 'agency_owner' then 2
               when 'admin' then 3 when 'manager' then 4
               when 'staff' then 5 else 6 end
             limit 1), 'agent'),
  case when p.status in ('invited') then 'invited'
       when p.status in ('terminated','inactive') then 'archived'
       else 'active' end,
  true
  from public.profiles p
 where p.organization_id is not null
   and not exists (
     select 1 from public.organization_memberships m where m.profile_id = p.id
   )
on conflict (organization_id, profile_id) do nothing;

-- ── 4. And the copy back from the record, so the two agree ─────────────────

update public.profiles p
   set organization_id = m.organization_id
  from public.organization_memberships m
 where m.profile_id = p.id
   and m.status = 'active'
   and m.is_primary
   and p.organization_id is distinct from m.organization_id;

-- ── 5. One notion of "my organizations" ────────────────────────────────────
--
-- `my_org_ids()` was memberships only while the application's `getMyOrgIds`
-- has always carried a revocation-guarded fallback to the profile copy. So the
-- database and the server disagreed about who belongs where, and the answer
-- you got depended on which one happened to be asking.
--
-- The fallback fires ONLY when the membership table has never heard of this
-- person — no row at all, in any state. An ARCHIVED row is a decision somebody
-- made, and it has to beat a stale copy: revocation archives the membership,
-- and a first draft of this keyed the fallback on "no ACTIVE membership",
-- which handed the agency straight back to anybody who had been revoked. The
-- scratch-Postgres run caught it.
--
-- The profile status guard stays as well, for the case where a profile is
-- terminated before it ever had a membership row.

create or replace function public.my_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from public.organization_memberships
   where profile_id = auth.uid() and status = 'active'
  union
  select p.organization_id
    from public.profiles p
   where p.id = auth.uid()
     and p.organization_id is not null
     and coalesce(p.status, '') not in ('inactive', 'terminated')
     and not exists (
       select 1 from public.organization_memberships m where m.profile_id = auth.uid()
     )
$$;

comment on function public.my_org_ids() is
  'Organizations the caller actively belongs to. Membership is the record; the '
  'profile copy is a fallback that fires only when NO membership row exists in '
  'any state, so an archived membership cannot be bypassed by a stale copy. '
  'Mirrors getMyOrgIds in src/lib/org-guard.ts — change both together.';

-- ── 6. The ladder answers the same question the carriers do ────────────────
--
-- `agency_levels_read` keyed on the denormalised copy while `org_carriers_read`
-- keyed on membership, so an agent could see their agency's carriers and not
-- its positions, or the reverse, with nothing explaining why.

drop policy if exists agency_levels_read on public.agency_levels;
create policy agency_levels_read on public.agency_levels
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

drop policy if exists agency_level_mappings_read on public.agency_level_carrier_mappings;
create policy agency_level_mappings_read on public.agency_level_carrier_mappings
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

-- ── 7. Stop it happening to the next recruit ───────────────────────────────
--
-- Before the membership trigger can help, the profile needs an organization.
-- BEFORE the row is written, so this sets the value rather than updating the
-- table again — an AFTER trigger writing to profiles would re-enter itself.

create or replace function public.set_profile_org_from_upline()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.organization_id is null and NEW.upline_id is not null then
    NEW.organization_id := public.org_of_upline(NEW.upline_id);
  end if;
  return NEW;
end $$;

comment on function public.set_profile_org_from_upline() is
  'A recruit inherits their upline''s agency. Without this a profile created '
  'with an upline and no organization is invisible to both membership triggers '
  'at once, and stays that way.';

drop trigger if exists trg_profile_org_from_upline on public.profiles;
create trigger trg_profile_org_from_upline
  before insert or update of upline_id, organization_id
  on public.profiles
  for each row execute function public.set_profile_org_from_upline();

notify pgrst, 'reload schema';
