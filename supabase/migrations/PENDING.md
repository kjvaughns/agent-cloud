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

- `20260802190000_commission-grids-org-unique.sql`

Everything else queued on 2 Aug 2026 is applied, bundled into
`20260802193054_e04946cb-f497-4d04-a0ba-a573587e18e8.sql`. That bundle improves
on what it replaces in two places worth knowing: `sync_profile_primary_org` now
writes only when the value actually changes, because a no-op rewrite still
fires the cross-org hierarchy check and some existing accounts already violate
it; and the org-owner membership backfill computes `is_primary` rather than
assuming it.

The one still listed above was written after that bundle was assembled, so it
was not part of it.
