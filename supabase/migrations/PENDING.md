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

`20260814140000` adds `org_contracting_settings.overridden_fields` — the
marker that lets a child agency inherit contracting policy from its parent.
In the window: saves retry without the column on `PGRST204`/`42703`, and the
resolver treats a row without the marker as "every field is local", which is
the pre-inheritance behaviour. Nothing breaks; the How Contracting Works page
simply shows every field as "Set by you" until the column exists.
