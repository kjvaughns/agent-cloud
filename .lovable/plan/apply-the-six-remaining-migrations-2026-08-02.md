# Apply the six remaining migrations

## What I verified against the live database

| Migration file | Status |
|---|---|
| `20260802160000_rename-import-credential-columns.sql` | **Not applied** — `scrape_requests.source_username` does not exist |
| `20260802170000_debrand-seeded-resource-content.sql` | **Not applied** — 1 handbook section still names the old provider |
| `20260802175000_org-membership-repair.sql` | **Not applied** — `trg_sync_membership_from_profile` missing; 1 profile has an organization but no membership row |
| `20260802180000_import-personal-scope.sql` | **Not applied** — `document_intake.user_note` missing |
| `20260802181000_import-proposals.sql` | **Not applied** — `import_proposals` table missing |
| `20260802182000_imports-bucket.sql` | **Not applied** — no `imports` storage bucket |
| Everything up to `20260802150000` | Already applied and verified earlier |
| `20260728100000_owner-consolidation.sql` | Still deliberately skipped — its section 4 deletes an account |

## Plan

1. Run one migration containing all six files, in filename order (the order the repo's `PENDING.md` requires — membership repair before the personal-scope fallback, both before `import_proposals`, which references `document_intake`):
   - **Rename import credential columns** — `scrape_requests.agentlink_username` / `agentlink_password_encrypted` become `source_username` / `source_password_encrypted`, with comments. Historic `source` tags on imported rows are left alone on purpose.
   - **Debrand seeded resources** — targeted `replace()` on the one handbook section and the academy course blurb that still name the old provider; agency-authored text untouched.
   - **Org membership repair** — `stamp_organization_id` gains a profile-column fallback, every profile/org-owner missing a membership is backfilled, and a new `sync_membership_from_profile` trigger keeps profile → membership true for future signups.
   - **Import personal scope** — adds `document_intake.user_note`, replaces the intake policy with one carrying the `organization_id is null and uploaded_by = auth.uid()` fallback, and adds an uploader index.
   - **Import proposals** — new `import_proposals` table (target table, operation, own/shared scope, payload, match info, decision, applied_at) with its four indexes, RLS, owner and agency-admin policies, and the org-stamp trigger.
   - **Imports bucket** — private `imports` storage bucket with owner/upline/admin read and owner-only write policies.
2. The proposals table's own file already includes `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` and `GRANT ALL ... TO service_role`, so no grants need adding; I'll confirm they are present in the combined SQL before running it.
3. After it applies: regenerate `src/integrations/supabase/types.ts`, run the typecheck, and re-run the same existence checks so each object is confirmed present.
4. Delete the six lines from `supabase/migrations/PENDING.md` so `scripts/migration-safety.ts` no longer reports them as pending, and confirm they appear on the **DB Migrations** admin page.

## Technical notes

- Every file is idempotent (`if exists` rename guards, `add column if not exists`, `create index if not exists`, `drop policy if exists`, `on conflict do nothing`), so combining them into one migration is safe and re-runnable.
- No data is deleted. The membership backfill only inserts rows and, for org owners, upgrades an existing membership to active `agency_owner`.
- The new `document_intake` and `import_proposals` policies widen access only to a row's own uploader when they have no organization — no cross-org read is introduced.
