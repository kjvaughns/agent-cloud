-- ---------------------------------------------------------------------------
-- THE AGENCY LOGO UPLOAD HAS NEVER WORKED ONCE
--
-- `settings.agency.tsx` uploads the agency logo to the `agent-documents`
-- bucket at the path `org-logos/<org id>.<ext>`. That bucket's insert policy is
--
--   auth.uid()::text = (storage.foldername(name))[1]
--
-- — the first path segment must be the caller's own user id. Here it is the
-- literal string `org-logos`, so **row-level security has rejected every
-- upload since the feature was written.**
--
-- The failure was then swallowed. The code reads
--
--   if (!uploadErr) { …set logo_url… }
--
-- with no else, so on rejection it simply carried on, saved the rest of the
-- form, and reported "Agency settings saved!". An owner picked a logo, watched
-- it appear — that preview is a local `blob:` URL, not the stored file —
-- clicked save, was told it worked, and found it gone on reload.
--
-- Even a correct path would not have worked: `agent-documents` is private, and
-- the code called `getPublicUrl()` on it, which returns a URL that does not
-- serve.
--
-- So: a bucket that logos can actually live in.
--
-- Private, because this workspace refuses public buckets — the same constraint
-- that shaped `academy-media`, and the reason `src/lib/academy-media.ts` hands
-- back a long-lived signed URL instead of a public one. Branding follows the
-- same pattern.
--
-- The first path segment is the owning organisation, and that segment IS the
-- authorisation check — there is nothing else in the path for the policy to
-- key on. A change to how the path is built silently unguards this bucket,
-- which is why `scripts/agency-settings-check.ts` asserts the shape.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('org-branding', 'org-branding', false)
on conflict (id) do nothing;

-- A folder that is not an organisation id is refused rather than cast.
-- A failed cast inside a policy is an error page, not a denial — the same
-- reasoning as `may_write_academy_media`, which this deliberately mirrors so
-- there is one shape to learn rather than two.
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

-- Reads are open to any signed-in user. A logo is shown in the sidebar to
-- every agent in the agency and on shared pages; narrowing this would break
-- the rendering it exists for, and the object is a picture of a company name.
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
