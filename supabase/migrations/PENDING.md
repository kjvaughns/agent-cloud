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

- `20260814140000_contracting-settings-inheritance.sql`
- `20260814150000_agency-relationships.sql`
- `20260814160000_imo-scope.sql`

`20260814160000` **depends on `20260814150000` — apply them in order.** It
adds `imo_org_ids()`, the `imo` arm of `scope_agent_ids`, `can_imo` in
`my_scopes()`, and the two owner visibility columns on
`organization_settings`. In the window: `my_scopes()` returns no `can_imo`,
so the Total IMO option simply never renders; the old `scope_agent_ids`
resolves an `imo` ask to `team` via its else-arm; the leaderboard's opt-out
filter and the feed's own-sales check catch the missing columns and treat
everyone as participating; `announceDeal`'s parent walk catches the missing
table and posts to the org's own channels only. Nothing breaks — the IMO
features are invisible until this lands.

`20260814150000` creates `agency_relationships` — the terms of each
parent/child agency link (production rollup, sales-feed access, status) —
and backfills one row per existing `parent_org_id`. In the window: the
Sub-Agencies page catches `42P01` and shows a "waiting on a workspace
update" notice instead of erroring; nothing else reads the table yet.

`20260814140000` adds `org_contracting_settings.overridden_fields` — the
marker that lets a child agency inherit contracting policy from its parent.
In the window: saves retry without the column on `PGRST204`/`42703`, and the
resolver treats a row without the marker as "every field is local", which is
the pre-inheritance behaviour. Nothing breaks; the How Contracting Works page
simply shows every field as "Set by you" until the column exists.
