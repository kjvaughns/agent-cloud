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

- `20260817120000_profile-org-resync-and-position-writes.sql` — resyncs
  `profiles.organization_id` from `organization_memberships`, widens the sync
  trigger to fire on update, and adds an upline arm to `profiles_org_manage`.

  **Assigning a position works without this**, because `setAgentPosition`
  performs its write with the service-role client after `checkAssignment` has
  authorised it — the same pattern the contracting modules use — so RLS is not
  what gates that path.

  What is still wrong until it is applied: `profiles.organization_id` stays out
  of step with membership for the affected agents, and everything ELSE that
  reads that column — the RLS policies keyed on it, and any query filtering
  profiles by org — keeps seeing them as belonging to no agency. The resync is
  the repair. The upline arm on the policy matters for RLS-bound paths that
  write a profile without going through `setAgentPosition`.

  Forward only. Nothing is dropped, nothing is deleted, and re-running it is a
  no-op.
