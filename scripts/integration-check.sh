#!/usr/bin/env bash
#
# Integration tests against the real schema.
#
#   bash scripts/integration-check.sh
#
# ── Why this exists ──
#
# The `scripts/*-check.ts` suite proves two things well: that a pure module
# computes what it should, and that the call sites are wired to it. It proves
# nothing at all about the database. Every RLS policy in this product — the
# thing standing between one agency's data and another's — was until now
# verified by reading it.
#
# This applies EVERY migration in `supabase/migrations` in order to a scratch
# Postgres, seeds two agencies, and then reads as a real member of each under
# the `authenticated` role with the policies enforced. A cross-org leak fails
# here rather than in production.
#
# ── The seeding defect that made the first version of this script useless ──
#
# The first version seeded two agencies and passed. It passed because the
# seeded users held no `user_roles` rows — and every leaking policy in the
# schema keys on exactly that table. A test whose fixtures avoid the condition
# the bug needs is not a test.
#
# The seed below gives each owner the `agency_owner` role that
# `src/lib/billing.functions.ts` inserts for every self-serve workspace
# creator, and each agent the `agent` role. With that one line added, the
# suite failed on `commission_schedule` immediately — which is how
# 20260815050000 came to be written.
#
# ── The preamble ──
#
# Supabase provides `auth.uid()`, `storage`, three roles, the realtime
# publication and a few extensions. Those are stubbed below and nothing else
# is: the migrations are applied exactly as they are in the repository, in
# filename order, with no edits.
#
# `auth.uid()` reads `test.uid` so a test can become somebody. That is the only
# behavioural difference from production, and it is the same shim every
# migration proof in this repository has used.
#
# Requires: a local postgres install, and root (for `su postgres`).

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDIR=/pgtest
export PATH="$PATH:/usr/lib/postgresql/17/bin:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin"
BIN="$(dirname "$(command -v initdb)")"

# A postmaster left behind by an earlier run holds the socket, and `kill -9`
# does not remove the lock file. Clearing both is what makes this re-runnable.
pkill -9 -f "postgres" >/dev/null 2>&1 || true
for _ in 1 2 3 4 5 6 7 8 9 10; do ps aux | grep -q "[p]ostgres" || break; sleep 1; done
sleep 1
rm -f /tmp/.s.PGSQL.5433 /tmp/.s.PGSQL.5433.lock

# `pgsodium` is a Supabase-provided extension that one migration creates and no
# function in the repository calls. A stub control file lets `CREATE EXTENSION`
# succeed so the rest of that migration applies.
EXTDIR="$(pg_config --sharedir)/extension"
if [ ! -f "$EXTDIR/pgsodium.control" ]; then
  printf "comment = 'stub'\ndefault_version = '1.0'\nrelocatable = false\nschema = pgsodium\n" > "$EXTDIR/pgsodium.control"
  printf -- "-- stub; the repository only does CREATE EXTENSION and never calls in.\n" > "$EXTDIR/pgsodium--1.0.sql"
fi

rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown -R postgres "$PGDIR" 2>/dev/null || true
su postgres -c "$BIN/initdb -A trust -D $PGDIR/data" >/dev/null
# Unix socket only. Nothing here connects over TCP, and binding a port makes a
# leftover postmaster fail the next run for a reason that has nothing to do
# with the schema.
su postgres -c "$BIN/pg_ctl -D $PGDIR/data -o '-p 5433 -k /tmp -h \"\"' -l $PGDIR/log start" >/dev/null
sleep 1
trap 'su postgres -c "$BIN/pg_ctl -D $PGDIR/data stop -m immediate" >/dev/null 2>&1 || true' EXIT

psql_()  { su postgres -c "psql -h /tmp -p 5433 -d postgres -v ON_ERROR_STOP=1 $*"; }
quiet_() { su postgres -c "psql -h /tmp -p 5433 -d postgres -q $*"; }

echo "── Supabase preamble ──"
cat > /tmp/ic-pre.sql <<'SQL'
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists storage;
create extension if not exists pgcrypto;

-- The only production difference: a test can become somebody.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid; $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');

create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;

-- Supabase's own path helpers. Every storage policy in the repo calls them.
create or replace function storage.foldername(name text) returns text[]
 language plpgsql immutable as $fn$
declare parts text[];
begin parts := string_to_array(name, '/'); return parts[1 : array_length(parts,1) - 1]; end $fn$;
create or replace function storage.filename(name text) returns text
 language plpgsql immutable as $fn$
declare parts text[];
begin parts := string_to_array(name, '/'); return parts[array_length(parts,1)]; end $fn$;
create or replace function storage.extension(name text) returns text
 language plpgsql immutable as $fn$
declare parts text[];
begin parts := string_to_array(name, '.'); return parts[array_length(parts,1)]; end $fn$;

-- Realtime's publication; several migrations add tables to it.
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;

do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

-- Supabase grants these by default privilege on the public schema. Without
-- them every read below fails on a missing grant rather than on a policy,
-- which would make this script pass for the wrong reason.
alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
alter default privileges in schema public grant all on functions to authenticated, anon, service_role;
SQL
chmod a+r /tmp/ic-pre.sql
quiet_ -f /tmp/ic-pre.sql >/dev/null 2>&1

echo "── Applying every migration ──"
#
# Eleven migrations do not apply to an empty database in filename order. Every
# one is a historical artefact of a backdated filename: Lovable applied them in
# the order they were written, then wrote them to disk with an earlier
# timestamp, so replaying by name puts a dependency after its dependant.
# Production applied each exactly once, in the working order, and is unaffected.
#
# They are listed rather than tolerated silently. A migration that fails for a
# reason NOT on this list fails the run — which is the whole point, and was not
# true of the first version of this script (it ran psql without ON_ERROR_STOP,
# so a broken migration passed quietly while the header claimed otherwise).
#
KNOWN_HISTORICAL=(
  '20260605190558|already exists'          # agent_integrations, created by the backdated 20260604230000
  '20260605193009|already exists'          # agents_own_scrape_requests, same cause
  '20260606122550|cannot change return type'
  '20260609010000|does not exist'          # organization_id, added by a later-named migration
  '20260611022601|pg_net'                  # Supabase-provided extension, not stubbed
  '20260611022622|pg_net'
  '20260717120000|does not exist'          # submitted_by
  '20260728100000|not found — nothing to promote'  # seeded founder absent on scratch, by design
  '20260730131845|already exists'          # user_roles_platform_admin
  '20260802120000|does not exist'          # created_at
  '20260803000045|cannot change return type'
)
known_() {
  local file="$1" err="$2" entry
  for entry in "${KNOWN_HISTORICAL[@]}"; do
    if [[ "$file" == *"${entry%%|*}"* && "$err" == *"${entry#*|}"* ]]; then return 0; fi
  done
  return 1
}

applied=0; tolerated=0
for f in $(ls "$REPO"/supabase/migrations/*.sql | sort); do
  cp "$f" /tmp/ic-m.sql; chmod a+r /tmp/ic-m.sql
  if out=$(su postgres -c "psql -h /tmp -p 5433 -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/ic-m.sql" 2>&1); then
    applied=$((applied + 1))
  else
    err=$(echo "$out" | grep -m1 ERROR || true)
    if known_ "$(basename "$f")" "$err"; then
      # Apply the rest of the file statement by statement, so everything that
      # is not the one historical conflict still lands.
      quiet_ -f /tmp/ic-m.sql >/dev/null 2>&1 || true
      tolerated=$((tolerated + 1))
    else
      echo "FAILED to apply $(basename "$f")"
      echo "    $err"
      echo ""
      echo "This is not one of the known historical ordering conflicts. Either the"
      echo "migration is broken, or it depends on something a newer migration"
      echo "creates under an earlier filename."
      exit 1
    fi
  fi
done
echo "   $applied migrations applied, $tolerated known historical conflicts tolerated"

echo "── Seeding two agencies ──"
cat > /tmp/ic-seed.sql <<'SQL'
-- Agency A and agency B, unrelated. Each with an owner and an agent.
insert into auth.users (id, email) values
 ('a0000000-0000-0000-0000-00000000000a','ownerA@example.com'),
 ('a0000000-0000-0000-0000-00000000000b','agentA@example.com'),
 ('b0000000-0000-0000-0000-00000000000a','ownerB@example.com'),
 ('b0000000-0000-0000-0000-00000000000b','agentB@example.com');

insert into public.organizations (id, name, slug, owner_id) values
 ('0a000000-0000-0000-0000-000000000001','Agency A','agency-a','a0000000-0000-0000-0000-00000000000a'),
 ('0b000000-0000-0000-0000-000000000001','Agency B','agency-b','b0000000-0000-0000-0000-00000000000a');

-- A profile is created from `auth.users` by trigger, so these are updates
-- rather than inserts. Finding that out is exactly why this runs against the
-- real schema instead of a hand-built one.
insert into public.profiles (id) values
 ('a0000000-0000-0000-0000-00000000000a'),
 ('a0000000-0000-0000-0000-00000000000b'),
 ('b0000000-0000-0000-0000-00000000000a'),
 ('b0000000-0000-0000-0000-00000000000b')
on conflict (id) do nothing;

update public.profiles set organization_id='0a000000-0000-0000-0000-000000000001', first_name='Owner', last_name='A'
 where id='a0000000-0000-0000-0000-00000000000a';
update public.profiles set organization_id='0a000000-0000-0000-0000-000000000001', upline_id='a0000000-0000-0000-0000-00000000000a', first_name='Agent', last_name='A'
 where id='a0000000-0000-0000-0000-00000000000b';
update public.profiles set organization_id='0b000000-0000-0000-0000-000000000001', first_name='Owner', last_name='B'
 where id='b0000000-0000-0000-0000-00000000000a';
update public.profiles set organization_id='0b000000-0000-0000-0000-000000000001', upline_id='b0000000-0000-0000-0000-00000000000a', first_name='Agent', last_name='B'
 where id='b0000000-0000-0000-0000-00000000000b';

insert into public.organization_memberships (organization_id, profile_id, status)
select organization_id, id, 'active' from public.profiles where organization_id is not null
on conflict do nothing;

-- ── The line the first version of this script was missing ──
--
-- `user_roles` has no `organization_id`, so every policy that tests it is
-- unbounded across tenants. Without these four rows the whole class of leak is
-- invisible to this suite: nobody holds a role, so no role arm ever fires.
--
-- `agency_owner` is what `src/lib/billing.functions.ts` inserts for every
-- self-serve workspace creator, so this is the ordinary state of a real
-- account, not a contrived privilege.
insert into public.user_roles (user_id, role) values
 ('a0000000-0000-0000-0000-00000000000a','agency_owner'),
 ('b0000000-0000-0000-0000-00000000000a','agency_owner'),
 ('a0000000-0000-0000-0000-00000000000b','agent'),
 ('b0000000-0000-0000-0000-00000000000b','agent')
on conflict do nothing;

insert into public.clients (id, agent_id, first_name, last_name, organization_id) values
 ('c0a00000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000b','Client','A','0a000000-0000-0000-0000-000000000001'),
 ('c0b00000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','Client','B','0b000000-0000-0000-0000-000000000001');

insert into public.policies (id, agent_id, client_id, annual_premium, status, posted_at, organization_id) values
 ('90a00000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000b','c0a00000-0000-0000-0000-000000000001',1000,'active', now(),'0a000000-0000-0000-0000-000000000001'),
 ('90b00000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','c0b00000-0000-0000-0000-000000000001',2000,'active', now(),'0b000000-0000-0000-0000-000000000001');

insert into public.announcements (id, title, body_html, created_by, organization_id) values
 ('a1100000-0000-0000-0000-000000000001','A only','<p>a</p>','a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001'),
 ('b1100000-0000-0000-0000-000000000001','B only','<p>b</p>','b0000000-0000-0000-0000-00000000000a','0b000000-0000-0000-0000-000000000001');

insert into public.agency_levels (id, organization_id, name, base_pct) values
 ('1aa00000-0000-0000-0000-000000000001','0a000000-0000-0000-0000-000000000001','Agent A',80),
 ('1bb00000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000001','Agent B',85);

insert into public.notifications (id, user_id, title) values
 ('11a00000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000b','For agent A'),
 ('11b00000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','For agent B');

-- ── The money and identity rows the role-keyed policies exposed ──

insert into public.commission_schedule
 (id, policy_id, agent_id, payment_date, payment_type, amount, status, organization_id,
  carrier, commission_pct, annual_premium, client_name) values
 ('5b000000-0000-0000-0000-000000000001','90b00000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-00000000000b', current_date,'advance',1840,'pending',
  '0b000000-0000-0000-0000-000000000001','Mutual of B',92,2000,'Client B');

insert into public.ssn_audit_log (id, agent_id, revealed_by)
 values ('55b00000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',
         'b0000000-0000-0000-0000-00000000000a');

insert into public.carriers (id, name) values
 ('caa00000-0000-0000-0000-000000000001','Mutual of B') on conflict do nothing;

insert into public.commission_level_requests (id, agent_id, carrier_id, status)
 values ('c1b00000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',
         'caa00000-0000-0000-0000-000000000001','pending');

insert into public.import_jobs (id, agent_id, source, status)
 values ('11b00000-0000-0000-0000-00000000000f','b0000000-0000-0000-0000-00000000000b','csv','complete');
SQL
chmod a+r /tmp/ic-seed.sql
psql_ -f /tmp/ic-seed.sql >/dev/null
echo "   seeded, with the roles the product actually issues"

echo "── Reading as a real member of each agency ──"
cat > /tmp/ic-assert.sql <<'SQL'
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on all functions in schema public to authenticated;

begin;
set local role authenticated;

do $$
declare n int;
begin
  -- ── Agency B's agent must not see agency A ──
  perform set_config('test.uid', 'b0000000-0000-0000-0000-00000000000b', true);

  select count(*) into n from public.policies
   where id = '90a00000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: agency B read agency A''s policy'; end if;

  select count(*) into n from public.clients
   where id = 'c0a00000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: agency B read agency A''s client'; end if;

  select count(*) into n from public.announcements
   where id = 'a1100000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: agency B read agency A''s announcement'; end if;

  select count(*) into n from public.agency_levels
   where id = '1aa00000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: agency B read agency A''s pay ladder'; end if;

  -- A notification is addressed to one person.
  select count(*) into n from public.notifications
   where id = '11a00000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: agency B read another user''s notification'; end if;

  -- ── …and must still see its own ──
  select count(*) into n from public.policies
   where id = '90b00000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'TOO TIGHT: agency B cannot read its own policy'; end if;

  select count(*) into n from public.announcements
   where id = 'b1100000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'TOO TIGHT: agency B cannot read its own announcement'; end if;

  select count(*) into n from public.agency_levels
   where id = '1bb00000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'TOO TIGHT: agency B cannot read its own ladder'; end if;

  select count(*) into n from public.notifications
   where id = '11b00000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'TOO TIGHT: an agent cannot read their own notification'; end if;

  select count(*) into n from public.commission_schedule;
  if n <> 1 then raise exception 'TOO TIGHT: an agent cannot read their own commission'; end if;

  raise notice 'agency B: isolated, and can see its own';

  -- ── The mirror, so a one-sided policy cannot pass ──
  perform set_config('test.uid', 'a0000000-0000-0000-0000-00000000000b', true);

  select count(*) into n from public.policies
   where id = '90b00000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: agency A read agency B''s policy'; end if;

  select count(*) into n from public.announcements
   where id = 'b1100000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: agency A read agency B''s announcement'; end if;

  select count(*) into n from public.policies
   where id = '90a00000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'TOO TIGHT: agency A cannot read its own policy'; end if;

  raise notice 'agency A: isolated, and can see its own';

  -- ── An owner sees their own agency's people, not the other's ──
  perform set_config('test.uid', 'a0000000-0000-0000-0000-00000000000a', true);

  select count(*) into n from public.profiles
   where id = 'b0000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'LEAK: agency A''s owner read agency B''s agent profile'; end if;

  select count(*) into n from public.profiles
   where id = 'a0000000-0000-0000-0000-00000000000b';
  if n <> 1 then raise exception 'TOO TIGHT: an owner cannot read their own agent'; end if;

  raise notice 'owner: sees their own roster only';

  -- ── An owner WITH the agency_owner role is still bounded ──
  --
  -- This is the block the leak lived in. Every table below was readable by
  -- any agency owner on the platform, because the policy asked "are you an
  -- admin anywhere" and `user_roles` has no organization to answer with.
  --
  -- The uid is still agency A's owner, who holds `agency_owner`.

  select count(*) into n from public.commission_schedule;
  if n <> 0 then
    raise exception 'LEAK: agency A''s owner read % commission_schedule rows belonging to agency B', n;
  end if;

  select count(*) into n from public.ssn_audit_log;
  if n <> 0 then raise exception 'LEAK: agency A''s owner read agency B''s SSN access log'; end if;

  select count(*) into n from public.commission_level_requests;
  if n <> 0 then raise exception 'LEAK: agency A''s owner read agency B''s commission level requests'; end if;

  select count(*) into n from public.import_jobs;
  if n <> 0 then raise exception 'LEAK: agency A''s owner read agency B''s import jobs'; end if;

  raise notice 'agency owner: the role does not reach past their own agency';

  -- ── …and agency B's owner still sees all of theirs ──
  perform set_config('test.uid', 'b0000000-0000-0000-0000-00000000000a', true);

  select count(*) into n from public.commission_schedule;
  if n <> 1 then raise exception 'TOO TIGHT: agency B''s owner cannot read their own commission schedule'; end if;
  select count(*) into n from public.ssn_audit_log;
  if n <> 1 then raise exception 'TOO TIGHT: agency B''s owner cannot read their own SSN access log'; end if;
  select count(*) into n from public.commission_level_requests;
  if n <> 1 then raise exception 'TOO TIGHT: agency B''s owner cannot read their own level requests'; end if;
  select count(*) into n from public.import_jobs;
  if n <> 1 then raise exception 'TOO TIGHT: agency B''s owner cannot read their own import jobs'; end if;

  raise notice 'agency owner: still sees everything in their own agency';

  -- ── Signed out reads nothing ──
  perform set_config('test.uid', '', true);
  select count(*) into n from public.policies;
  if n <> 0 then raise exception 'LEAK: an unauthenticated read returned % policies', n; end if;
  select count(*) into n from public.announcements;
  if n <> 0 then raise exception 'LEAK: an unauthenticated read returned % announcements', n; end if;
  select count(*) into n from public.commission_schedule;
  if n <> 0 then raise exception 'LEAK: an unauthenticated read returned % commission rows', n; end if;

  raise notice 'signed out: nothing';
end $$;
commit;

-- ── No policy may test an agency-level role without an organization ──
--
-- The structural form of the bug above, checked directly so it cannot come
-- back in a policy nobody thought to seed a row for.
--
-- `user_roles` is `(user_id, role)`. It has no `organization_id`, so
-- `has_role(auth.uid(), 'admin' | 'manager' | 'agency_owner')` names no
-- agency and answers yes for an admin of any agency on the platform. All
-- three are issued per-agency by ordinary product flows.
--
-- `super_admin` is the one role in that table that is genuinely platform-wide,
-- and `is_platform_admin()` tests exactly it, so both are allowed.
--
-- The org-bounded replacements are `is_org_admin(org)`, `is_org_owner(org)`,
-- `is_admin_of_agent(agent)` and `same_org(profile)`.
do $$
declare bad text;
begin
  select string_agg(format('%s.%s', c.relname, p.polname), E'\n     ') into bad
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'storage')
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
          coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
         -- Parenthesised: `~` binds tighter than `||`, so an unbracketed
         -- concatenation compares against the first fragment and then
         -- appends the rest to the boolean.
         ~ ('(has_role\(auth\.uid\(\), ''(admin|agency_owner|manager)''::app_role\)'
            || '|user_roles[^)]*''(admin|agency_owner|manager)''::app_role'
            || '|''(admin|agency_owner|manager)''::app_role[^)]*user_roles)');
  if bad is not null then
    raise exception E'A policy tests an agency-level role with no organization to bound it.\n     %\n\n'
      '     user_roles has no organization_id, so this grants across every tenant.\n'
      '     Use is_org_admin(org), is_admin_of_agent(agent) or is_platform_admin().', bad;
  end if;
  raise notice 'no policy grants on a role without naming an agency';
end $$;

-- ── A table with RLS on and no policy denies everything ──
--
-- Different bug from a leak, and easy to ship by accident: the table looks
-- protected and is simply broken.
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     -- A table only the service role touches is legitimately policy-free.
     and has_table_privilege('authenticated', c.oid, 'SELECT');
  if bad is not null then
    raise exception 'RLS on with no policy, so nothing can be read: %', bad;
  end if;
  raise notice 'no table is silently denying everything';
end $$;
SQL
chmod a+r /tmp/ic-assert.sql
psql_ -f /tmp/ic-assert.sql

echo ""
echo "ALL INTEGRATION CHECKS PASSED"
