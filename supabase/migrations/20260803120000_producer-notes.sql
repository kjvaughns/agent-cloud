-- ============================================================================
-- PRODUCER NOTES — what staff actually write down
--
-- A contracting coordinator's day is full of facts the schema had nowhere to
-- put: "called Transamerica 8/3, rep says approval by Friday", "renewal
-- submitted to NIPR 7/28". Today those go in email threads and spreadsheets
-- beside the platform, which is the failure mode the platform exists to end.
--
-- What already exists, and why none of it is this:
--
--   contracting_status_history  request-scoped, and only written when a status
--                               changes. A carrier call about an agent with no
--                               open request has nowhere to land.
--   producer_profiles.contracting_notes
--                               one text column, overwritten in place. No
--                               author, no timestamp, no second note.
--   contracting_audit_log       machine-written, service-role only. It records
--                               what the system did, not what a person learned.
--
-- So: append-only, agent-scoped, authored, timestamped. Deliberately NOT
-- editable — a note that can be rewritten after the fact is not a record, and
-- the whole value here is being able to trust what it said in July.
-- ============================================================================

create table if not exists public.producer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- The producer the note is about.
  agent_id uuid not null references public.profiles(id) on delete cascade,
  -- Who wrote it. Kept on delete set null: losing the author must not lose the
  -- note, because the note is what the next person needs.
  author_id uuid references public.profiles(id) on delete set null,

  body text not null check (length(btrim(body)) between 1 and 4000),

  -- Same split as contracting_status_history's internal_message /
  -- agent_visible_message, and for the same reason: most of what staff write
  -- is for staff. Internal is the default because the safer mistake is a note
  -- the agent cannot see.
  visibility text not null default 'internal'
    check (visibility in ('internal', 'agent_visible')),

  -- Optional anchor to the work the note came out of.
  related_request_id uuid references public.contracting_requests(id) on delete set null,
  related_carrier_id uuid references public.org_carriers(id) on delete set null,

  pinned boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists idx_producer_notes_agent
  on public.producer_notes(organization_id, agent_id, created_at desc);

create index if not exists idx_producer_notes_request
  on public.producer_notes(related_request_id) where related_request_id is not null;

-- No update grant. Append-only is enforced by what is not granted, not by
-- hoping the application never issues an UPDATE.
grant select, insert, delete on public.producer_notes to authenticated;
grant all on public.producer_notes to service_role;

alter table public.producer_notes enable row level security;

-- Read: contracting staff for the whole agency, the upline for their downline,
-- and the producer themselves for notes marked visible to them.
drop policy if exists producer_notes_read on public.producer_notes;
create policy producer_notes_read on public.producer_notes
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.can_view_contracting(organization_id)
    or public.is_in_downline(auth.uid(), agent_id)
    or (agent_id = auth.uid() and visibility = 'agent_visible')
  );

-- Write: whoever may see the contracting record may add to it, and only ever
-- as themselves. An agent cannot write notes onto their own file — the file is
-- the agency's record of working with them.
drop policy if exists producer_notes_insert on public.producer_notes;
create policy producer_notes_insert on public.producer_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and organization_id in (select public.my_org_ids())
    and (
      public.can_view_contracting(organization_id)
      or public.is_in_downline(auth.uid(), agent_id)
    )
  );

-- Delete: only the author, and only their own note. Retracting something you
-- wrote is not the same as editing the record out from under somebody.
drop policy if exists producer_notes_delete on public.producer_notes;
create policy producer_notes_delete on public.producer_notes
  for delete to authenticated
  using (author_id = auth.uid() and organization_id in (select public.my_org_ids()));

drop trigger if exists trg_producer_notes_org on public.producer_notes;
create trigger trg_producer_notes_org
  before insert on public.producer_notes
  for each row execute function public.stamp_organization_id('agent_id');

comment on table public.producer_notes is
  'Append-only, agent-scoped notes written by contracting staff. Internal by default.';

-- ---------------------------------------------------------------------------
-- SUBMISSION METHOD VOCABULARY
--
-- org_carrier_methods.method has always been constrained. The two columns that
-- record what was actually used were free text, so the configured vocabulary
-- and the recorded one could drift — the same shape of problem producer_
-- documents.doc_type and the duplicated writing_number columns already hit.
--
-- Now that the application can write submission methods, close it. Existing
-- values outside the vocabulary are normalised to 'other' rather than blocking
-- the constraint, and NULL stays legal: "not recorded" is a real state.
-- ---------------------------------------------------------------------------

update public.contracting_requests
   set submission_method = 'other'
 where submission_method is not null
   and submission_method not in (
     'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
   );

alter table public.contracting_requests
  drop constraint if exists contracting_requests_submission_method_check;
alter table public.contracting_requests
  add constraint contracting_requests_submission_method_check
  check (submission_method is null or submission_method in (
    'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
  ));

update public.contracting_submissions
   set method = 'other'
 where method is not null
   and method not in (
     'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
   );

alter table public.contracting_submissions
  drop constraint if exists contracting_submissions_method_check;
alter table public.contracting_submissions
  add constraint contracting_submissions_method_check
  check (method is null or method in (
    'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
  ));
