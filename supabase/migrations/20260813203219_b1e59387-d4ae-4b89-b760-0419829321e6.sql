create or replace function public.may_write_org_branding(_folder text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if _folder is null then
    return false;
  end if;
  if _folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.is_org_admin(_folder::uuid);
end $$;

grant execute on function public.may_write_org_branding(text) to authenticated;

drop policy if exists "org_branding_read" on storage.objects;
create policy "org_branding_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'org-branding');

drop policy if exists "org_branding_insert" on storage.objects;
create policy "org_branding_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-branding'
    and public.may_write_org_branding((storage.foldername(name))[1])
  );

drop policy if exists "org_branding_update" on storage.objects;
create policy "org_branding_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'org-branding'
    and public.may_write_org_branding((storage.foldername(name))[1])
  );

drop policy if exists "org_branding_delete" on storage.objects;
create policy "org_branding_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-branding'
    and public.may_write_org_branding((storage.foldername(name))[1])
  );

notify pgrst, 'reload schema';