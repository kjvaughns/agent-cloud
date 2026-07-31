## What I checked against the live database

| Migration file | Status |
|---|---|
| `20260730210000_usage-tracking.sql` | **Not applied** — `usage_events` table does not exist, no policies, no prune function |
| `20260730223000_backfill-producer-document-org.sql` | Already applied (zero documents with a missing organization) |
| `20260730230000_fix-agent-completion.sql` | Already applied (`agent_completion` no longer reads from `clients`) |
| `20260731100000_user-page-favorites.sql` | **Not applied** — `user_page_favorites` table does not exist |
| `20260728100000_owner-consolidation.sql` | Still unapplied, deliberately — section 4 deletes `info@kingofsales.net` and reassigns that account's clients, policies and commissions |

## Plan

1. Apply one migration containing the two outstanding files, in filename order:
   - **Usage tracking**: `usage_events` table (org, profile, role, plan, event type, path, action, duration, meta), its three indexes, grants to `authenticated`/`service_role` including the sequence, RLS with insert-own and org-admin-read policies, plus the `prune_usage_events()` 90-day retention function.
   - **Starred pages**: `user_page_favorites` (profile_id + page_id primary key), RLS restricted to the owning user, and its index. Grants for `authenticated` and `service_role` will be added — the original file omits them, and without them the Data API cannot reach the table.
2. Verify after it applies: both tables exist, RLS is on with the expected policies, grants are present, and `prune_usage_events` was created.
3. Regenerate `src/integrations/supabase/types.ts` and run the typecheck. Any module currently casting the client to `any` for these two tables can then use real types (no code changes unless the typecheck breaks).

## Deliberately not included

`20260728100000_owner-consolidation.sql`. Say the word if you want its non-destructive data moves (sections 1–3) run without the account deletion.
