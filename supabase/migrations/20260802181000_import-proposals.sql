-- ---------------------------------------------------------------------------
-- WHAT IMPORT INTENDS TO DO, BEFORE IT DOES IT
--
-- Document Intake classified a file and stopped. It has never written a row —
-- 'applied' was bookkeeping. Import turns the same pipeline into one that acts,
-- and everything about acting safely lives here: one row per intended change,
-- decided individually, applied once.
--
-- Why a table rather than more jsonb on `document_intake.extracted`:
--
--   `applied_at`. A book of business is thousands of rows and an apply can fail
--   halfway. Without a per-row record of what already landed, the retry creates
--   every client a second time — the exact thing the user asked to be
--   protected from. With it, apply is resumable and idempotent.
--
--   `decision` per row. The uploader approves their own clients; anything
--   touching shared data — commission grids, the carrier catalogue, the agent
--   roster — waits for an agency admin. One agent's misread grid would
--   otherwise become every agent's comp numbers. That routing needs a
--   filterable, indexable column, not a key inside a blob.
--
--   Audit. `carrier-sync.functions.ts` already re-verifies every row at apply
--   rather than trusting the preview it was handed. A durable proposal row is
--   what you re-verify against.
--
-- `payload` is deliberately loose jsonb: the shape differs per target table and
-- pinning it here would mean a migration every time Import learns a new one.
-- The server functions validate with Zod before applying.
-- ---------------------------------------------------------------------------

create table if not exists public.import_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.document_intake(id) on delete cascade,
  batch_id uuid not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,

  -- Where this row wants to go, and what it wants to do there.
  target_table text not null,
  operation text not null default 'insert'
    check (operation in ('insert', 'update', 'skip')),

  -- 'own'    → the uploader approves it
  -- 'shared' → an agency admin approves it
  scope text not null default 'own'
    check (scope in ('own', 'shared')),

  payload jsonb not null,

  -- What we matched against, if anything. 'exact' is auto-skipped and only
  -- counted; 'fuzzy' is what actually gets shown to a human.
  match_id uuid,
  match_kind text check (match_kind in ('exact', 'fuzzy')),
  match_reason text,
  confidence numeric,

  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'skipped', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,

  -- Set once the row has actually landed. The idempotency guard.
  applied_at timestamptz,
  applied_record_id uuid,
  apply_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_proposals_document
  on public.import_proposals(document_id, decision);

create index if not exists idx_import_proposals_batch
  on public.import_proposals(batch_id);

-- The admin approvals queue: everything shared and still undecided in my org.
create index if not exists idx_import_proposals_approvals
  on public.import_proposals(organization_id, scope, decision)
  where scope = 'shared';

-- The uploader's own view, and the personal-scope path for agents with no org.
create index if not exists idx_import_proposals_creator
  on public.import_proposals(created_by, decision);

alter table public.import_proposals enable row level security;

grant select, insert, update, delete on public.import_proposals to authenticated;
grant all on public.import_proposals to service_role;

-- Same personal-scope fallback as every other org-isolated table, for the same
-- reason: an agent with no organization membership still has to be able to use
-- this. See `20260802180000_import-personal-scope.sql`.
drop policy if exists import_proposals_own on public.import_proposals;
create policy import_proposals_own on public.import_proposals
  for all to authenticated
  using (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (created_by = auth.uid() or public.is_org_owner(organization_id))
    )
    or (organization_id is null and created_by = auth.uid())
  )
  with check (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (created_by = auth.uid() or public.is_org_owner(organization_id))
    )
    or (organization_id is null and created_by = auth.uid())
  );

-- Agency admins are not necessarily the org owner, so `is_org_owner` above does
-- not reach them. They get the shared queue and nothing else: a proposal
-- landing in someone's own client list is not theirs to approve.
--
-- Via `has_role`, not a subquery on `user_roles`. A policy's subquery runs with
-- the *caller's* privileges, and `user_roles` is never granted to
-- `authenticated` — an inline `select 1 from user_roles` raises "permission
-- denied" and takes the whole statement with it. `has_role` is SECURITY
-- DEFINER and is explicitly granted, which is why the storage policies use it.
drop policy if exists import_proposals_admin_shared on public.import_proposals;
create policy import_proposals_admin_shared on public.import_proposals
  for all to authenticated
  using (
    scope = 'shared'
    and organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  with check (
    scope = 'shared'
    and organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

drop trigger if exists trg_stamp_org_import_proposals on public.import_proposals;
create trigger trg_stamp_org_import_proposals
  before insert on public.import_proposals
  for each row execute function public.stamp_organization_id('created_by');

comment on table public.import_proposals is
  'One intended change per row, produced by Import and applied only after a decision. applied_at makes re-running an apply idempotent.';

notify pgrst, 'reload schema';
