-- ---------------------------------------------------------------------------
-- A CHILD AGENCY INHERITS ITS PARENT'S CONTRACTING POLICY
--
-- organizations.parent_org_id has existed since the beginning and is written
-- whenever an invited agency owner spins up a sub-agency — but nothing ever
-- read it. Every org's org_contracting_settings row was an island: a new
-- child agency started from the system defaults, not from how its parent
-- runs, and a parent tightening its approval rules moved nobody.
--
-- One column makes settings sparse:
--
--   overridden_fields text[]
--
--   null   the row predates inheritance. Every field it holds counts —
--          exactly how rows behaved before this migration, so applying it
--          changes NOTHING for existing agencies until someone deliberately
--          resets a field to "inherit".
--   list   only the named fields are this org's own; the rest resolve up
--          the parent_org_id chain (own override → nearest ancestor's
--          override → system default). An empty list = inherit everything.
--
-- The resolution rule lives in src/lib/contracting-ops/effective-settings.ts
-- and every server-side reader goes through it. Resolution runs on the
-- service role and returns only effective values — a child cannot read its
-- parent's row, and no RLS is widened here.
--
-- auto_assign_staff_id is deliberately outside the model: it names a person
-- in this org, and a parent's staffer means nothing in the child's queue.
--
-- Code ships before this is applied. In the window, saves retry without the
-- column (PGRST204/42703) and readers treat its absence as null — the legacy
-- semantics — so the window costs nothing but the feature itself.
-- ---------------------------------------------------------------------------

alter table public.org_contracting_settings
  add column if not exists overridden_fields text[];

comment on column public.org_contracting_settings.overridden_fields is
  'Which fields this org sets for itself; others inherit up parent_org_id. Null = legacy row, every field counts. Resolution in src/lib/contracting-ops/effective-settings.ts.';

notify pgrst, 'reload schema';
