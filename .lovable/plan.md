## Goal

Apply the pending SQL migrations to the live database, in the exact order given, without rewriting them.

## What I verified first

- All files 1–11 exist in `supabase/migrations/`.
- **File 12 (`20260728100000_owner-consolidation.sql`) does not exist in the repo.** There is nothing to run for it, and no section 0 output to show. See "Open question" below.
- None of these have been applied yet: `organization_memberships`, `tasks`, `retention_cases`, `commission_statements`, `export_log`, `plans`, and the helpers `my_org_ids()`, `is_org_owner()`, `same_org()`, `stamp_organization_id()` are all absent from the database. So this is a clean, full run — not a partial re-apply.
- `20260717120000_contracts-restructure.sql` will be left untouched, as instructed.

## Execution order

Each file is submitted as its own migration for your approval, one at a time, in this order:

```text
1  20260718100000_org-isolation.sql              (helpers + org_id on 23 tables + ~46 RLS rewrites)
2  20260719100000_contracts-restructure-repair.sql
3  20260719110000_phase2-stabilization.sql
4  20260720100000_phase3-tasks-search.sql
5  20260721100000_phase4-retention-reconciliation.sql
6  20260722100000_phase5-reporting-notifications.sql
7  20260723100000_phase6-automation-runs.sql
8  20260724100000_phase7-cleanup-plans.sql
9  20260725100000_landing-demo-requests.sql
10 20260726100000_client-banking-card.sql
11 20260727100000_grid-uploads-and-intake.sql
```

Rules I'll follow:
- File 1 runs and succeeds before anything else is submitted. If it errors, I stop and report the file, the failing statement, and the exact error — no edits to get past it.
- Same for every subsequent file: error means stop, not skip.
- `raise notice` output is reported but is not treated as failure.
- SQL is submitted verbatim from the repo files.

## After the SQL

1. Regenerate the Supabase TypeScript types (this happens automatically after each approved migration) and remove the now-unnecessary `as any` casts where the regenerated types cover them — specifically `src/hooks/use-organization.ts` and `src/lib/org-guard.ts`, plus any other module casting the client only because the types were stale.
2. Run a TypeScript check and a production build; report both clean.
3. Report which files applied, every notice raised, and a verification query showing the new tables, helper functions, and org-scoped policies in place.

## One risk worth naming up front

File 1 removes the global `has_role(auth.uid(),'admin')` data bypass and replaces it with org matching. Your admin accounts (`kjvaughns13@gmail.com`, `info@kingofsales.net`) will only see data inside orgs they hold an active membership in. The migration backfills memberships from `profiles.organization_id` and from `organizations.owner_id`, and keeps a personal-scope fallback for rows with no org — but any record whose `organization_id` stays null will be visible only to its own agent, not to admins. After file 1 I'll run a count of null-`organization_id` rows on the core tables (clients, policies, commission_schedule) and show you the numbers before continuing, so you can see the blast radius while it's still cheap to react.

## Open question — file 12

`20260728100000_owner-consolidation.sql` isn't in the repo, so the destructive account-consolidation step can't run as described. Options, tell me which:

- **A** — Skip it. Apply files 1–11 and stop.
- **B** — I write it from scratch: you tell me which account is being removed and which account absorbs its clients, policies, commission rows, downline and org ownership. I'd structure it the same way (section 0 dry-run counts first, stop for your confirmation, reassign in 1–3, delete last).
- **C** — You paste the file contents and I run it as written.

Files 1–11 don't depend on file 12, so I can start the run now and settle this after.
