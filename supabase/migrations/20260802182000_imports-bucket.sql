-- ---------------------------------------------------------------------------
-- THE SOURCE DOCUMENT SURVIVES LONG ENOUGH TO BE APPROVED
--
-- Document Intake kept nothing. It rasterized the file in the browser, sent the
-- picture to the model, and dropped it — `document_intake.file_url` has existed
-- since the table was created and no code has ever written to it.
--
-- That was fine while the page only summarized. It is not fine now that an
-- agency admin has to approve proposals somebody else generated, possibly hours
-- later. Approving a commission grid you cannot look at is not approval.
--
-- Private bucket, one folder per uploader, same shape as `producer-docs`:
-- readable by the owner, by their upline, and by an admin — the three people
-- who might legitimately need to check what a proposal came from.
--
-- These files hold client PII. There is no retention job here yet; when Import
-- proves out, the batch should be swept once its proposals are all applied or
-- dismissed.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

drop policy if exists "imports_owner_select" on storage.objects;
create policy "imports_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imports' and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_in_downline(auth.uid(), ((storage.foldername(name))[1])::uuid)
      or public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

drop policy if exists "imports_owner_write" on storage.objects;
create policy "imports_owner_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imports' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "imports_owner_update" on storage.objects;
create policy "imports_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'imports' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "imports_owner_delete" on storage.objects;
create policy "imports_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imports' and auth.uid()::text = (storage.foldername(name))[1]);
