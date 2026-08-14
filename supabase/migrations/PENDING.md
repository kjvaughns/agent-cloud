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

- `20260814200000_announcement-audience-and-delivery.sql`

`20260814200000` repairs announcements and then extends them. It backfills
`organization_id` on rows that have none (attributing each to its author's
agency), drops the `organization_id is null` arm from `announcements_read`,
and adds `audience`, `announcement_group_id` and the `announcement_deliveries`
ledger. **Apply this promptly — until it lands, posting an announcement fails
outright for agency owners** (the write policy requires an organization the
old code never set) and any row already sitting there without one is readable
by every agency on the platform. In the window: the new columns do not exist,
so the audience picker's choice is not persisted and the feed's channel badges
stay empty; `listAnnouncements` selects `*` and the ledger read is best-effort,
so nothing errors. Nothing is dropped and no row is deleted — a post that
cannot be attributed to any agency becomes invisible rather than global, which
is the fix rather than a side effect.

- `20260814190000_new-agents-start-active.sql`

`20260814190000` moves `profiles.status`'s default to `'active'` and makes
`handle_new_user()`'s plain-signup branch say so explicitly, so nobody new
lands in the "pending" state the activation gate used to hold them in.
Accepting an invite already writes `'active'` in application code, so that
path does not wait on this. In the window: somebody who signs up *without* an
invite still gets `'pending'` from the old column default — but the gate that
read it is gone from the code, so they see the full app regardless. The only
visible residue is cosmetic: the roster shows them under "Pending" until this
lands. Nothing is dropped and no existing row is rewritten; `'pending'` stays
a legal status, and agencies with people sitting in it keep seeing them.
