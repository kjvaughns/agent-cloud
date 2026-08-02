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

- `20260730162000_contracting-ops-requests.sql`
- `20260731140000_ensure-assigned-contract-status.sql`
- `20260801120000_scope-layer.sql`
- `20260801121000_analytics-authorization.sql`
- `20260802120000_pending-agents.sql`
- `20260802130000_nova-conversations.sql`
- `20260802140000_help-desk.sql`
- `20260802150000_agency-resources.sql`

Order matters at the tail: `agency-resources` reads the permission columns
`help-desk` adds.
