## Root cause

I traced the import job (`3f2432d3-…3cc0`): 254 clients imported, **0 policies**, 144 notes, completed without raising an error. The extracted JSON has 165 policies with valid client matches (e.g. Barbara Daniel → 2 policies). The code calls `if (!error) policiesImported++;` so every policy insert is silently being rejected.

I reproduced an insert directly against the DB and got:

```
ERROR: invalid input value for enum challenge_type: "deals"
QUERY:  SELECT * FROM public.challenges WHERE … AND type = 'deals' …
CONTEXT: PL/pgSQL function bump_challenge_progress()
```

The `public.challenges.type` column is typed as the `challenge_type` enum, but that enum only contains `daily | weekly | monthly | quarterly` (those are *period* values). The trigger `bump_challenge_progress` — which fires on every `policies` insert — filters `type = 'deals'`, which is not a valid enum member, so **every policy insert throws**. `seed_agent_challenges` is also writing `'calls' | 'deals' | 'premium' | 'recruiting'` into that column.

Clients and `contact_history` rows don't fire this trigger, which is why those imported fine.

The "policy details / monthly premium / ALP / carrier / effective date missing" and "notes section empty per client" symptoms are the same bug: policies never inserted, and the per-client notes block expected to follow the policies didn't run either (well, the standalone Client Notes did — 144 — but anything the UI shows under policies is empty).

## Fix

### 1. Migration — convert `challenges.type` to plain `text`

The trigger and seeder already use string values, so the cleanest fix is to drop the enum constraint on this column. No data loss — the enum has 4 values, but the column is used for `calls/deals/premium/recruiting`, meaning existing rows are either valid text or already broken.

```sql
ALTER TABLE public.challenges
  ALTER COLUMN type TYPE text USING type::text;
```

No app code changes needed — `mock-data.ts`, `challenges.tsx`, etc. already treat it as a string.

### 2. Replay the stuck job's policies (and any missed per-client notes)

After the migration succeeds I'll add a one-shot server function `replayAdminImportPolicies(job_id)` that:
- Reads the saved `extracted_json` for the completed job
- Re-runs the policies loop only (skips clients, skips Client Notes — those already landed)
- Matches policies to clients by `agent_id = target_agent_id` + normalized first+last name
- Inserts policies with `assigned_to_email` set to the downline owner from the Team Roster, exactly like the original code
- Updates `admin_import_jobs.policies_imported` with the new count

Then I'll call it once for `3f2432d3-741c-499b-a95c-ba6c0c0c3cc0` (your existing job) to backfill the 165 policies. The button to trigger this lives in `admin.import-requests.tsx` next to completed jobs as "Replay policies" so you can re-use it if anything similar happens later.

### 3. No changes to the parser or the multi-sheet flow

The extraction is correct — the data was there all along. Once the trigger no longer rejects inserts, future imports will land policies and notes correctly on the first pass.

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | `ALTER TABLE challenges ALTER COLUMN type TYPE text` |
| `src/lib/admin-import.functions.ts` | Add `replayAdminImportPolicies` server fn |
| `src/routes/admin.import-requests.tsx` | "Replay policies" action on completed jobs |

## Verification

1. After migration: re-run the test insert against `policies` — succeeds.
2. Call replay on job `3f2432d3-…3cc0` → expect ~165 policies inserted, `policies_imported` updated.
3. Open one of the 63 sold clients (e.g. Barbara Daniel) → policy tab now shows carrier, monthly premium, ALP, effective date.
4. Upload a fresh AgentLink XLS → policies populate on the first pass with no replay needed.
