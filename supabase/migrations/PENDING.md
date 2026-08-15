# Migrations not yet applied

Migrations are applied by hand in Lovable, so a migration can sit in this
repository for hours or days before the database has it. Code deployed in that
window must still work — see `scripts/migration-safety.ts`, which reads this
file.

**This list is a fallback.** When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are set, the script asks `list_applied_migrations` instead and ignores this
file entirely, because a hand-maintained list going stale is the same kind of
mistake it exists to prevent. Keep it current anyway, for anyone running
without credentials.

Delete a line once the migration is applied.

_Nothing pending._

- `20260815060000_import-tooling-org-bound.sql`

Three tables the org-bound pass missed. `20260815050000` was re-recorded and
applied as `20260815045002`, and that re-record covers all of it except
`import_jobs`, `import_duplicates` and `migration_roster` — all three still
carrying `auth.uid() IN (SELECT user_id FROM user_roles WHERE role IN
('admin','manager'))`, which names no organization and so answers yes for an
admin of any agency. An import job carries the imported roster: third-party
names and contact details belonging to one agency's book.

This closes exactly those three and nothing else. Re-running the original would
also re-drop and re-create fifty already-correct policies, and a migration that
touches fifty to fix three is one nobody can review.

Idempotent, and safe whether or not they are currently leaking. Each keeps its
`agents_own_*` policy, so an agent's own rows are unaffected either way.

In the window: the three stay readable across agencies until this is applied.

- `20260815070000_grid-rules-state-risk-and-bands.sql`

State and risk exceptions on a comp grid, plus the rules that keep it sane.

`commission_grids` could express product, age band, level and three renewal
columns, but not the two things carriers publish alongside them: a state
exception and a risk split. `state_code` and `risk_class` are both nullable and
NULL means "applies to all", so every existing row keeps its exact current
meaning.

The load-bearing part is the index. `commission_grids_org_row_uniq` keyed on
(org, carrier, product, level, age_min), so a Florida row for the same product
and band as the national row collided with it and could not be stored at all.
It is replaced by a key that also carries the upper age bound, the state and
the risk class — which is the brief's "refuse duplicates unless a more specific
state or risk rule distinguishes them", written as a unique key. Two national
rows for one band are still refused.

`age_group_max` joining the key fixes a second thing: two bands sharing a lower
bound are different rules, and the old key treated them as one, so a second
band starting at the same age silently overwrote the first on upsert.

An inverted age band is refused going forward, added NOT VALID so applying this
cannot reject rows already stored. The header carries the query to list any.

Also a partial unique index on `discord_deliveries`, so one event reaches one
channel once. Partial on `status = 'sent'` because a skip and a later
successful send are two different facts and both belong in the ledger. It was
enforced in application code only, which holds until two requests race — which
is exactly what a retry is.

Proven on scratch Postgres, applied twice, with all six rules asserted to bite:
a state exception sits beside its national row, a duplicate national rule is
refused, two bands sharing a lower bound are two rules, and an inverted band, a
made-up risk class and a non two-letter state code are each refused.

In the window: nothing writes `state_code` or `risk_class` yet, and the
selector treats a row with neither as applying everywhere — which is every row
today. So the product behaves exactly as it does now until an owner records an
exception.

- `20260815080000_agency-settings-permissions.sql`

**The six Agency Settings permissions get somewhere to live.**

`role_permissions` is a table of fixed boolean columns, not a key-value bag.
The six keys the tab guard reads — agency profile, levels, carriers, grids,
automations, integrations — had no columns, so an owner could not have granted
one if they tried: the write would be dropped and the read would return
undefined forever. Code that reads a name nothing can write is not a permission
system, it is a permanently-false constant with a suggestive name. Same shape
as the `OrgCarrierSchema` defect the contracting checklist turned up.

Every column defaults to false, and the guards treat an owner or platform admin
as permitted without consulting any of them — so applying this changes nothing
for owners and starts staff at no access until somebody grants it. Defaulting
to true so nothing appeared to change would have silently handed every existing
staff member the ability to rewrite comp grids.

Also `can_manage_agency_settings(_org, _key)`, the database's own answer,
shaped after `is_org_admin`: an active membership in THAT organization plus
either an agency-level role or the specific column. It exists so an RLS policy
can ask the same question the server does instead of re-deriving it. The key is
checked against a fixed list of six before the column is read, so an arbitrary
column name cannot be used to read something else off the row.

Proven on scratch Postgres: an owner is permitted without holding any toggle, a
staff member gets exactly what they were granted and nothing else, an arbitrary
column name is refused, and neither is permitted in an organization they do not
belong to.

In the window: the tab gate and the server guards both treat a missing column
as "not granted", so before this is applied only owners and platform admins can
reach the six areas. That is stricter than today rather than looser, and no
staff member loses anything they can currently do — the permissions did not
exist to be held.
