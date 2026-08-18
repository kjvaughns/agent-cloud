-- Read-only API access to an agency's production numbers.
--
-- ── What this is for ──
--
-- An agency owner wants their upline to be able to put the team's sales
-- numbers on their own website. Today the only way is a screenshot or a person
-- retyping figures, which goes stale the moment it is pasted.
--
-- So: the AGENCY OWNER issues a key, and hands it to whoever needs the data.
-- The data owner grants the access, which is the right way round — the upline
-- does not need an account here, and nobody outside can mint themselves a key.
--
-- ── What a key can read, and what it deliberately cannot ──
--
-- Totals and per-agent production. Never a client, never a policy number,
-- never a face amount tied to a person. This is insurance: a client's identity
-- on somebody else's public website is a compliance problem rather than an
-- untidiness, and the same rule already governs what the Discord announcer
-- sends. `scopes` is an array so a narrower key is possible — an owner who
-- wants to share the agency total without naming who wrote what issues a key
-- with `production:read` and not `producers:read`.
--
-- ── The key itself is never stored ──
--
-- Only a SHA-256 hash and the first few characters, which is enough for the
-- owner to recognise a key in a list and not enough for anybody who reads this
-- table to use one. The full key is shown once, at creation, and cannot be
-- recovered — losing it means issuing another and revoking the first.
--
-- Safe to run more than once.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- What it is for, in the owner's words: "Marcus's website".
  name text not null,

  -- The first characters, for recognising a key in a list. Not a secret.
  key_prefix text not null,
  -- SHA-256 of the whole key. The only copy that exists after creation.
  key_hash text not null unique,

  scopes text[] not null default array['production:read']::text[],

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,

  -- Revocation is a timestamp rather than a delete, so the usage history of a
  -- key that was withdrawn is still readable afterwards.
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_api_keys_hash on public.api_keys(key_hash);
create index if not exists idx_api_keys_org on public.api_keys(organization_id, created_at desc);

-- ── Every call leaves a row ────────────────────────────────────────────────
--
-- An owner who has handed out a key needs to be able to answer "is it being
-- used, by whom, and for what" without asking the person holding it. Failures
-- are recorded too: a key that is being refused is the thing somebody most
-- needs to see.

create table if not exists public.api_key_usage (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.api_keys(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  endpoint text not null,
  status integer not null,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_key_usage_key on public.api_key_usage(api_key_id, created_at desc);
create index if not exists idx_api_key_usage_org on public.api_key_usage(organization_id, created_at desc);

alter table public.api_keys enable row level security;
alter table public.api_key_usage enable row level security;

grant select on public.api_keys, public.api_key_usage to authenticated;
grant all on public.api_keys, public.api_key_usage to service_role;

-- ── Only the agency owner ──────────────────────────────────────────────────
--
-- Issuing a key is handing the agency's numbers to somebody outside it, which
-- is the owner's decision and nobody else's. Reads are owner-only for the same
-- reason: `key_prefix` plus a name tells you who has been given access, and
-- that is not information an agent needs.
--
-- Writes go through the server functions, which check the same thing before
-- touching the service-role client; this policy is the boundary underneath,
-- not the only guard.

drop policy if exists api_keys_owner_all on public.api_keys;
create policy api_keys_owner_all on public.api_keys
  for all to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

drop policy if exists api_key_usage_owner_read on public.api_key_usage;
create policy api_key_usage_owner_read on public.api_key_usage
  for select to authenticated
  using (public.is_org_owner(organization_id));

comment on table public.api_keys is
  'Read-only API credentials an agency owner issues so somebody outside the '
  'agency — typically their upline — can pull production figures into their own '
  'site. The key is stored only as a SHA-256 hash; the full value is shown once '
  'at creation and cannot be recovered.';

comment on column public.api_keys.scopes is
  'What the key may read. production:read is totals; producers:read adds the '
  'per-agent breakdown with names. Client identity is not available under any '
  'scope — see the endpoint in src/routes/api/v1.';

notify pgrst, 'reload schema';
