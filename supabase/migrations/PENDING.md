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

- `20260802160000_rename-import-credential-columns.sql`
- `20260802170000_debrand-seeded-resource-content.sql`
- `20260802175000_org-membership-repair.sql`
- `20260802180000_import-personal-scope.sql`
- `20260802181000_import-proposals.sql`
- `20260802182000_imports-bucket.sql`
- `20260802190000_commission-grids-org-unique.sql`

Order matters at the tail. `import-proposals` references `document_intake`,
and its policies assume the personal-scope fallback `import-personal-scope`
adds; both assume the membership rows `org-membership-repair` creates. Apply
the four in the order listed.

The eight queued earlier on 2 Aug 2026 are all applied.
