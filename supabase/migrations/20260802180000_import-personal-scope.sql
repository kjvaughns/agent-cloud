-- ---------------------------------------------------------------------------
-- DOCUMENT INTAKE STOPS LOCKING OUT THE PEOPLE IT IS FOR
--
-- `document_intake` is becoming Import, a tool every agent has rather than an
-- agency-admin page. Today it cannot accept most of them.
--
-- Its policy reads:
--
--   organization_id is not null
--   and organization_id in (select my_org_ids())
--   and (is_org_owner(organization_id) or uploaded_by = auth.uid())
--
-- Every other org-isolated table carries a second branch — see
-- `20260718100000_org-isolation.sql` §4b/4c, whose own comment says "legacy
-- rows with no org fall back to personal scope so nobody is locked out".
-- `document_intake` was written in a different migration and never got it.
--
-- That matters because nothing in the app has ever created a membership row —
-- see `20260802175000_org-membership-repair.sql`, which fixes the root cause.
-- This migration is the safety net beside it, not the fix: a profile can still
-- be mid-signup with no organization at all, and when that happens the upload
-- should work and be visible to its owner rather than be rejected.
--
-- Nobody hit this because the `agency-admin` nav gate meant only owners and
-- admins ever saw the page. Remove the gate without both migrations and the
-- feature is broken for precisely the people it was opened up for.
--
-- Also adds `user_note`: the plain-English line someone can type to say what
-- they are uploading. It steers classification and, more usefully, settles
-- ambiguous duplicate matches — "these are the Blue Sky clients, I already
-- imported the Aetna ones" is the sentence that answers "is this the same
-- person?".
-- ---------------------------------------------------------------------------

alter table public.document_intake
  add column if not exists user_note text;

comment on column public.document_intake.user_note is
  'Optional plain-English description the uploader gave. Feeds classification and duplicate matching.';

drop policy if exists document_intake_access on public.document_intake;
create policy document_intake_access on public.document_intake
  for all to authenticated
  using (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
    )
    or (organization_id is null and uploaded_by = auth.uid())
  )
  with check (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
    )
    or (organization_id is null and uploaded_by = auth.uid())
  );

-- An agent with no org needs their own rows to come back quickly too; the
-- existing index is (organization_id, status, created_at) and skips them.
create index if not exists idx_document_intake_uploader
  on public.document_intake(uploaded_by, created_at desc);

notify pgrst, 'reload schema';
