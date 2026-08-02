-- ---------------------------------------------------------------------------
-- EVERY ACCOUNT GETS THE MEMBERSHIP ROW THE APP ASSUMES IT ALREADY HAS
--
-- `organization_memberships` is the table `my_org_ids()` reads, and
-- `my_org_ids()` is what every org-scoped RLS policy in the database is built
-- on. Nothing has ever written to it.
--
--   `handle_new_user` creates a profile with no organization and no membership.
--   `initSoloWorkspace` creates the organization, sets
--     `profiles.organization_id`, upserts `user_roles` — and stops there.
--   `trg_sync_profile_primary_org` syncs membership → profile, one direction.
--   Every one of the twenty-odd `organization_memberships` reads in the
--     TypeScript layer is a SELECT.
--
-- The only rows that exist are the two one-time backfills in
-- `20260718100000` and `20260730131845`. So every account created since those
-- ran has `profiles.organization_id` set and **no membership**, which means
-- `my_org_ids()` returns nothing for them and the first branch of every
-- org-scoped policy fails.
--
-- Most tables survive it by accident: their policies carry an
-- `organization_id IS NULL` personal-scope fallback, and because the stamp
-- trigger also reads memberships, their rows are stamped NULL and match that
-- branch. It works, but it means a solo agent's entire book sits outside org
-- scope, and any table without the fallback — `document_intake` — simply
-- rejects the insert.
--
-- Three parts, and the trigger is the one that stops this recurring.
-- ---------------------------------------------------------------------------

-- 1. Stamp from the profile when no membership exists.
--
-- Belt and braces: even after the backfill and the trigger below, a row
-- inserted in the same transaction as a profile update could still find no
-- membership. Falling back to the column the profile already carries costs one
-- lookup and removes the whole class of NULL-stamped rows.
create or replace function public.stamp_organization_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_org uuid;
begin
  if NEW.organization_id is not null then
    return NEW;
  end if;
  execute format('select ($1).%I', TG_ARGV[0]) into v_owner using NEW;
  if v_owner is null then
    return NEW;
  end if;

  select organization_id into v_org
    from public.organization_memberships
   where profile_id = v_owner and status = 'active'
   order by is_primary desc
   limit 1;

  -- Fall back to the profile's own column when the membership is missing.
  if v_org is null then
    select organization_id into v_org
      from public.profiles where id = v_owner;
  end if;

  NEW.organization_id := v_org;
  return NEW;
end $$;

-- 2. Backfill everyone the earlier migrations missed.
insert into public.organization_memberships
  (organization_id, profile_id, role, status, is_primary)
select p.organization_id,
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
on conflict (organization_id, profile_id) do nothing;

-- Org owners always hold an active membership in the org they own, even if
-- their profile never got the column set.
insert into public.organization_memberships
  (organization_id, profile_id, role, status, is_primary)
select o.id, o.owner_id, 'agency_owner', 'active', true
from public.organizations o
where o.owner_id is not null
on conflict (organization_id, profile_id)
  do update set role = 'agency_owner', status = 'active';

-- 3. Keep it true from here on.
--
-- The existing `trg_sync_profile_primary_org` runs membership → profile. This
-- is the missing other direction: whenever a profile gains or changes an
-- organization, the membership follows. Without it every future signup
-- reintroduces the same gap.
create or replace function public.sync_membership_from_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.organization_id is null then
    return NEW;
  end if;

  insert into public.organization_memberships
    (organization_id, profile_id, role, status, is_primary)
  values (
    NEW.organization_id,
    NEW.id,
    coalesce((select ur.role::text from public.user_roles ur
               where ur.user_id = NEW.id
               order by case ur.role::text
                 when 'super_admin' then 1 when 'agency_owner' then 2
                 when 'admin' then 3 when 'manager' then 4
                 when 'staff' then 5 else 6 end
               limit 1), 'agent'),
    case when NEW.status in ('invited') then 'invited'
         when NEW.status in ('terminated','inactive') then 'archived'
         else 'active' end,
    true
  )
  on conflict (organization_id, profile_id) do nothing;

  return NEW;
end $$;

drop trigger if exists trg_sync_membership_from_profile on public.profiles;
create trigger trg_sync_membership_from_profile
  after insert or update of organization_id on public.profiles
  for each row execute function public.sync_membership_from_profile();

comment on function public.sync_membership_from_profile is
  'Profile gains an organization → membership row follows. The counterpart to trg_sync_profile_primary_org, which runs the other way.';

notify pgrst, 'reload schema';
