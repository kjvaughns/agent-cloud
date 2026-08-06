-- ============================================================================
-- AI MESSAGE LOG — the record that turns AI from a liability into a control
--
-- 25 states plus DC have adopted the NAIC Model Bulletin on the Use of AI by
-- insurers, and carriers push those governance obligations downstream to
-- distribution. The agency signs an agreement promising its producers'
-- communications comply; the agency is the one examined when they do not.
--
-- What an examiner asks for is not "do you screen messages" — it is "show me
-- what the system said about the message this producer sent on 14 July, and
-- show me they saw it." That is this table.
--
-- ── Immutable, and more strictly than producer_notes ────────────────────────
--
-- producer_notes grants delete to its author, because retracting a note you
-- wrote is reasonable. This grants NO delete and NO update to anyone except
-- service_role, because the whole evidentiary value is that a record cannot be
-- tidied up after a complaint arrives. A log an agency can edit is a log a
-- regulator discounts entirely.
--
-- Retention is therefore deliberate rather than incidental: rows accumulate
-- and are removed, if ever, by a service-role job with its own reasoning.
--
-- ── What is stored, and what is not ────────────────────────────────────────
--
-- The message body IS stored. That is the point — a screen result without the
-- text it screened proves nothing. It is client-facing marketing copy rather
-- than client PII: the client is referenced by id, and no name, address or
-- health information is copied in.
--
-- The screen findings are stored as jsonb rather than normalised, because they
-- are a snapshot of what one version of the ruleset said on one day. Normalising
-- them would invite a later migration to "fix" a historical finding, which is
-- the one thing this table must never allow.
-- ============================================================================

create table if not exists public.ai_message_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,

  -- Who Nova drafted it for. Kept on delete set null: losing the producer's
  -- account must not lose the agency's record of what was sent.
  agent_id uuid references public.profiles(id) on delete set null,
  -- Who it was about. Nullable — some drafts are generic.
  client_id uuid references public.clients(id) on delete set null,

  -- Which generator produced it, matching the kinds in ai-features.functions.ts.
  kind text not null,
  channel text not null default 'sms' check (channel in ('sms', 'email', 'other')),

  body text not null,

  -- The screen, exactly as it read at the time.
  screen_passed boolean not null,
  screen_flagged boolean not null default false,
  screen_findings jsonb not null default '[]'::jsonb,
  -- Which ruleset produced them, so a finding can be reproduced years later.
  ruleset_version text not null,

  -- Whether the agent went on to use it. Set at generation time to false and
  -- only ever raised by a separate append — never an update to this row.
  delivered boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists idx_ai_message_log_org
  on public.ai_message_log(organization_id, created_at desc);
create index if not exists idx_ai_message_log_agent
  on public.ai_message_log(agent_id, created_at desc);
-- The query an examination actually makes: everything flagged, newest first.
create index if not exists idx_ai_message_log_flagged
  on public.ai_message_log(organization_id, created_at desc) where screen_flagged;

-- No update. No delete. Not for anyone. See the header — this is the whole
-- design, enforced by what is not granted rather than by hoping.
grant select, insert on public.ai_message_log to authenticated;
grant all on public.ai_message_log to service_role;

alter table public.ai_message_log enable row level security;

-- Read: the producer sees their own drafts; an agency owner or admin sees the
-- agency's, because they are the ones answerable for them.
drop policy if exists ai_message_log_read on public.ai_message_log;
create policy ai_message_log_read on public.ai_message_log
  for select to authenticated
  using (
    public.is_platform_admin()
    or agent_id = auth.uid()
    or organization_id in (
      select o.id from public.organizations o where o.owner_id = auth.uid()
    )
    or exists (
      select 1
        from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.role in ('admin', 'agency_owner', 'super_admin')
    )
  );

-- Write: only as yourself, only into an org you belong to. A log somebody can
-- write on another producer's behalf is a log that can be salted.
drop policy if exists ai_message_log_insert on public.ai_message_log;
create policy ai_message_log_insert on public.ai_message_log
  for insert to authenticated
  with check (
    agent_id = auth.uid()
    and (organization_id is null or organization_id in (select public.my_org_ids()))
  );

comment on table public.ai_message_log is
  'Immutable record of every AI-drafted client message and how it screened. No update or delete is granted to authenticated — the evidentiary value depends on it.';
