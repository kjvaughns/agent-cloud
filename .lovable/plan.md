# Apply the one remaining migration

## What I checked against the live database

| Migration | Status |
|---|---|
| `20260803010000_recruiting-challenge-audience.sql` | Applied (shipped inside the `20260803025510` bundle — the live `seed_agent_challenges` has the downline gate) |
| `20260803020000_academy-course-builder.sql` | **Not applied** — none of its six lesson columns exist, neither of its two functions exist, and the `academy-media` bucket is absent |
| Everything earlier | Applied |
| `20260728100000_owner-consolidation.sql` | Still deliberately skipped — its section 4 deletes an account |

## Plan

Run `20260803020000_academy-course-builder.sql` as one migration:

1. **Lesson fields** — add `section`, `kind`, `duration_minutes`, `is_published`, `created_at`, `updated_at` to academy lessons, plus an ordering index and a check on the allowed lesson kinds. Backfill `kind` from what the reader currently infers, so no existing lesson changes how it renders.
2. **Course duration roll-up** — a trigger that sums lesson durations into the course, leaving externally-hosted courses (no lessons) with the number that was typed.
3. **One progress row per agent per lesson** — deduplicate existing rows (keeping the completion, then the most recent), then add the unique constraint only if an equivalent one isn't already there. This removes the racy select-then-write fallback.
4. **Fix a cross-agency hole in progress visibility** — the current policies grant the agency-level `admin` role globally, so an admin at one agency can read and write another agency's progress rows. Replaced with: yourself, your downline, or an admin of *your* agency; writes narrow to yourself only.
5. **Course media storage** — create the public `academy-media` bucket and gate writes on resource-manage rights for the agency named by the first path segment (platform defaults are super-admin only). Uploads currently fail because the bucket doesn't exist.

## After it applies

- Re-check the six lesson columns, both new functions, the progress constraint, the new progress policies, and the bucket against the live database.
- Confirm the row shows on the **DB Migrations** admin page.
- Run the typecheck and the migration-safety script — the course builder code already degrades on missing columns, so it should go from "tolerated" to "clean".

## Technical notes

- Every statement is guarded (`if not exists`, `drop policy if exists`, `create or replace`), so the migration is re-runnable.
- No table is created, so no new GRANTs are needed; the one new function gets `grant execute ... to authenticated`.
- The storage read/write policies live on `storage.objects`, which is the only way to authorise uploads to the new bucket; nothing else in the storage schema is touched.
- The dedupe delete in step 3 is the only data removal: each deleted row is a duplicate whose surviving twin carries the same fact.
- `supabase/migrations/PENDING.md` lists both files; it's read-only to me, so those two lines need deleting by hand afterwards.
