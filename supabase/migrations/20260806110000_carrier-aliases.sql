-- ============================================================================
-- CARRIERS HAVE MORE THAN ONE NAME
--
-- A book of business exported from another platform writes carriers however
-- that platform wrote them, which is rarely how this one does. "MoO", "United
-- of Omaha", "Mutual of Omaha Life Insurance Company" and "Omaha Insurance Co"
-- are one carrier to an agent and four strings to a database.
--
-- The import used to bridge that gap with a substring test:
--
--     if (name.includes(k) || k.includes(name)) return id;
--
-- which matched a cell reading "Life" to whichever carrier with "Life" in its
-- name the loop reached first. In a life-insurance product that is most of
-- them. Policies were filed under carriers the agent holds no contract with,
-- and nothing recorded that a guess had been made.
--
-- Two things fix it, and both need somewhere to live:
--
--   1. `carriers.naic_code` — the industry's actual primary key. Where a file
--      carries one, no name matching is needed at all.
--   2. `carrier_aliases` — the names that cannot be derived. No amount of
--      string cleverness gets from "MoO" to "Mutual of Omaha"; somebody has to
--      say so once.
--
-- The matching itself is in `src/lib/carrier-match.ts`, deliberately not in
-- SQL: it returns a confidence score, and anything below the threshold has to
-- reach a human rather than a write.
-- ============================================================================

alter table public.carriers
  add column if not exists naic_code text;

comment on column public.carriers.naic_code is
  'NAIC company code, five digits. The canonical key for carrier identity — where an import carries one, it outranks every name-based match.';

-- Partial, because most rows will not have one for a while and a unique index
-- over a mostly-null column is cheap this way. Unique because two carriers
-- sharing a NAIC code is a data error worth failing on rather than absorbing.
create unique index if not exists carriers_naic_code_uniq
  on public.carriers (naic_code) where naic_code is not null;

-- ── Aliases ─────────────────────────────────────────────────────────────────

create table if not exists public.carrier_aliases (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  alias text not null,
  -- Where this alias came from. A curated alias is trustworthy; one learned
  -- from somebody confirming an import guess is trustworthy in a different
  -- way, and worth being able to tell apart later.
  source text not null default 'curated'
    check (source in ('curated', 'confirmed_import', 'carrier_filing')),
  -- Null for the shared catalog; set when one agency adds an alias only they
  -- use. Keeps a private naming quirk from leaking into everybody's matching.
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.carrier_aliases is
  'Alternate names one carrier is written under. Feeds the alias tier of carrier matching, which sits above fuzzy matching precisely because these cannot be derived from the string.';

-- Case-insensitive, because "MoO" and "moo" are the same claim, and a
-- duplicate would just make the alias tier do twice the work.
create unique index if not exists carrier_aliases_uniq
  on public.carrier_aliases (carrier_id, lower(alias), coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_carrier_aliases_lookup
  on public.carrier_aliases (lower(alias));

alter table public.carrier_aliases enable row level security;

-- Readable by anybody signed in: matching happens on every import, and the
-- shared catalog is not secret. An org-scoped alias is visible only to that
-- org, so one agency's internal shorthand stays theirs.
drop policy if exists carrier_aliases_read on public.carrier_aliases;
create policy carrier_aliases_read on public.carrier_aliases
  for select to authenticated
  using (
    organization_id is null
    or organization_id in (select public.my_org_ids())
  );

-- Writes are org-scoped only. Nobody edits the shared catalog from the app —
-- a bad alias there would mis-file policies for every agency on the platform,
-- so that stays a deliberate act in the SQL editor.
drop policy if exists carrier_aliases_write on public.carrier_aliases;
create policy carrier_aliases_write on public.carrier_aliases
  for all to authenticated
  using (organization_id is not null and organization_id in (select public.my_org_ids()))
  with check (organization_id is not null and organization_id in (select public.my_org_ids()));

-- ── Seed the aliases that are actually common ───────────────────────────────
--
-- Only for carriers this database already has, matched on exact name so this
-- cannot invent a mapping. Every one of these is a name a real book of
-- business has been seen to use for a carrier already in the catalog.

insert into public.carrier_aliases (carrier_id, alias, source)
select c.id, a.alias, 'curated'
  from public.carriers c
  join (values
    ('Mutual of Omaha', 'MoO'),
    ('Mutual of Omaha', 'United of Omaha'),
    ('Mutual of Omaha', 'United of Omaha Life Insurance Company'),
    ('Mutual of Omaha', 'Omaha Insurance Company'),
    ('Americo', 'Americo Financial Life and Annuity'),
    ('Americo', 'Americo Financial Life & Annuity Insurance Company'),
    ('Foresters', 'Independent Order of Foresters'),
    ('Foresters', 'Foresters Financial'),
    ('Transamerica', 'Transamerica Life Insurance Company'),
    ('Transamerica', 'TLIC'),
    ('Gerber Life', 'Gerber Life Insurance Company'),
    ('Aetna', 'Accendo Insurance Company'),
    ('CVS/Aetna', 'Accendo'),
    ('Corebridge', 'AIG Life'),
    ('Corebridge', 'American General Life'),
    ('Corebridge', 'AGL')
  ) as a(carrier_name, alias) on lower(c.name) = lower(a.carrier_name)
 where not exists (
   select 1 from public.carrier_aliases x
    where x.carrier_id = c.id
      and lower(x.alias) = lower(a.alias)
      and x.organization_id is null
 );
