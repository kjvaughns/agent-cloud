update public.profiles p
   set organization_id = m.organization_id
  from public.organization_memberships m
 where m.profile_id = p.id
   and m.status = 'active'
   and m.is_primary
   and (p.organization_id is null or p.organization_id <> m.organization_id);

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