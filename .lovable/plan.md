## Problem

Dashboard shows ~$434k team/personal production. Your actual numbers should be ~$116k personal and ~$219k team. Two bugs caused this:

### Bug 1 — "TOTALS" row imported as a policy
The Book of Business sheet's footer row (`client_label = "TOTALS"`, `annual_premium = 219,238.92`, no agent, no policy number, no effective date) was imported as a real policy. That single phantom row exactly doubles your total ($434,498 = $215,259 real + $219,238 totals row).

### Bug 2 — All 164 policies and 254 clients assigned to you
At replay time `pending_agents` was empty, so the `agent_label` → downline email mapping found nothing and every row fell back to `agent_id = Kaeden`. The breakdown that *should* exist (already present in the source JSON):

| Agent | Policies | ALP |
|---|---|---|
| Kaeden Vaughns (you) | 82 | $116,962 |
| Xaviar Watts | 50 | $61,575 |
| Charles Reese | 26 | $32,483 |
| Landon Boyd | 3 | $3,204 |
| Daniel Gonzalez | 2 | $3,360 |
| Loren Lail | 2 | $1,652 |

Clients sheet had no agent column, so clients need to be re-owned by joining to their policy's agent.

## Fix

### 1. Data cleanup (one-time, via insert tool)
- Delete the phantom TOTALS policy (`agent_label IS NULL`, `policy_number IS NULL`, `annual_premium = 219238.92`).
- Re-seed `pending_agents` from the import job's `roster` array (25 rows) with `upline_id = Kaeden`. Cross-reference roster names with `agent_label` values from `policies_raw` to confirm email matches (Xaviar Watts → xaviarwatts123@gmail.com, etc.).
- For each policy whose `agent_label` matches a downline roster name: set `agent_id = <pending stub UUID we create>` OR keep `agent_id = Kaeden` and set `assigned_to_email = <downline email>`. **Recommendation: create real `profiles` rows (status='pending') for the downline so dashboards/leaderboards/team rollups work today; when the downline signs up, `handle_new_user` already merges via email.** This matches the "inactive downline agents" pattern you asked for previously.
- Re-own clients: for any client whose only policy belongs to a downline agent, move `clients.agent_id` to that downline (or set `assigned_to_email`).
- Recompute commission schedule rows (delete + let the `generate_commission_schedule` trigger re-run on re-insert, or regenerate manually).

### 2. Importer code fixes (so this doesn't recur)
- `src/lib/agentlink-xls-parser.ts` (or wherever Book of Business is parsed): skip rows where `client_label` matches `/^totals?$/i`, or where `agent_label`, `policy_number`, and `effective_date` are all null.
- `src/lib/admin-import.functions.ts` (`replayAdminImportPolicies` + initial import handler):
  - Before the policies loop, ensure `pending_agents` (or pending `profiles`) exist for every roster entry — seed them if missing.
  - Build an `agent_label → owner` map keyed by normalized full name from roster, then resolve each policy to the right `agent_id`/`assigned_to_email` (fall back to importer only when nothing matches and log a warning).
  - When inserting a stub client for a downline policy, set the stub's owner to the downline too (not the importer).

### 3. Verify
After cleanup, dashboard "All time" should show:
- My Production ≈ $116,962
- Team Production ≈ $219,238
- My Policies = 82, Team Policies = 165 (164 real - 1 totals row + downline stubs already counted)
- Effective dates populated on all 163 real policies (the only no-eff row was the TOTALS row)

## Technical notes
- The `profiles` route is preferred over `pending_agents` for the downline stubs because `get_dashboard_metrics` and most analytics RPCs walk `profiles.upline_id` recursively; `assigned_to_email`-only rows don't get counted in those rollups. The `handle_new_user` trigger already handles the case where a real signup happens and merges by lowercase email.
- Commission schedule rows generated from the bad policies need to be wiped alongside the policy deletions, otherwise the Finances page will keep showing inflated numbers.
