# Apply the seven remaining migrations

## What I verified against the live database

| Migration file | Status |
|---|---|
| `20260802190000_commission-grids-org-unique.sql` | **Not applied** — index `commission_grids_org_row_uniq` missing |
| `20260802200000_backfill-org-carrier-links.sql` | **Not applied** — `org_carriers` has 0 rows |
| `20260802201000_resolve-commission-level-requests.sql` | **Not applied** — no `resolved_at` column, no decide policy |
| `20260802210000_fix-deal-notification-text.sql` | **Not applied** — trigger still writes "— policy policy submitted." when the carrier is unknown |
| `20260802220000_writing-numbers-authoritative.sql` | **Not applied** — source check lacks `self_reported`/`legacy_backfill` |
| `20260802230000_producer-document-vocabulary.sql` | **Not applied** — no legacy `background_check`/`other` rows remain to move, but the file has never run |
| `20260802240000_agent-status-revocation.sql` | **Not applied** — `caller_is_active()` missing, status check has no `inactive`/`imported` |
| `20260728100000_owner-consolidation.sql` | Still deliberately skipped — its section 4 deletes an account |

## Plan

Run one migration containing all seven files in filename order (the order they depend on: the unique index and the `org_carriers` backfill must land before the writing-number backfill, which inserts into both):

1. **Commission grid uniqueness** — dedupe `commission_grids`, drop the old constraint, add the expression-based unique index scoped per organization (zero UUID standing in for the shared defaults).
2. **Backfill org/carrier links** — create `org_carriers` rows for private agency carriers, carriers with existing contract requests, and carriers with agency-entered grids.
3. **Resolve commission level requests** — add `resolved_at` / `resolved_by`, replace the read-only upline policy with full-downline + admin/owner read, add an update policy that excludes the requesting agent, plus a pending index.
4. **Deal notification text** — recreate `policy_after_insert` so a missing carrier reads "new policy submitted." instead of "policy policy submitted."
5. **Writing numbers authoritative** — widen the source check to include `self_reported` and `legacy_backfill`, narrow the agent's own-row policy to self-reported rows, backfill missing `org_carriers` links and then `writing_numbers` rows from `contract_requests` and `agent_commission_levels`, and mark both legacy columns deprecated by comment.
6. **Producer document vocabulary** — migrate `background_check` → `background_questionnaire` and `other` → `other_document`, superseding any duplicates.
7. **Agent status revocation** — add `inactive` / `imported` to the profile status check, add the self-set guard trigger, add `caller_is_active()`, and rewrite `is_in_downline`, `get_team_downline` and the remaining downline/roster functions so a revoked account's downline resolves empty.

## After it applies

- Regenerate `src/integrations/supabase/types.ts` and run the typecheck.
- Re-run the same existence checks so every index, column, policy, function and trigger is confirmed present.
- Delete the seven lines from `supabase/migrations/PENDING.md` so `scripts/migration-safety.ts` stops reporting them, and confirm they show on the **DB Migrations** admin page.

## Technical notes

- No table is created, so no new GRANTs are required; every statement is written to be re-runnable (`if not exists`, `drop policy if exists`, `on conflict do nothing`, `create or replace`).
- The only deletions are the commission-grid duplicate cleanup (keeps the newest row per key) — no agent, policy or commission data is removed.
- The two backfills insert only; current source rows are zero for private carriers and writing numbers on this database, so those steps are effectively no-ops today and exist for correctness going forward.
