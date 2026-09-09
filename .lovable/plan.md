# Trophy Case on the Leaderboard

A record book under the leaderboard: who holds the agency's best day, week and month — personally, with their team, and for the agency as a whole. When somebody beats a record, they get a celebration on screen and everyone in the agency gets a notification.

## What gets recognized

Records are measured in premium written (ALP), using the same production rule the leaderboard already uses, so a record can never disagree with the board above it.

Nine records per agency:

```text
                 Day        Week       Month
Top producer      *          *           *      one agent's own writing
Top leader        *          *           *      an agent plus their whole downline
Agency            *          *           *      everyone together
```

Weeks start Monday, matching the rest of the app. Each record shows the holder, the amount, and the date it was set. Leaders only appear in the leader rows if they actually have a downline, so a personal producer isn't listed twice.

Owners whose agency has sub-agencies get a second toggle for an IMO-wide trophy case covering every opted-in sub-agency.

Owners who have chosen to hide their own numbers from leaderboards stay hidden here too.

## Where the records come from

Every record is computed from policies already on the books, so the trophy case opens fully populated with this year's imported history — no seeding step, nothing to backfill by hand. Every past day, week and month is scanned and the best one wins.

## Breaking a record

When a deal is posted (or a policy's premium/date is edited so a period changes), the records are recomputed. Any record whose holder or amount changed is written down as the new record, and:

- The record breaker sees a celebration — a gold burst with the record name and the number — right after posting, and once more when they next open the leaderboard if they haven't seen it yet.
- Everyone in the agency gets a notification in their bell: "Samuel James set a new agency record — best day, $18,400". People who have switched off team activity notifications don't get it.
- A record broken by importing old history is recorded silently. No notification, no confetti — nobody wants forty alerts from one import.

## Technical detail

**Migration** — `public.production_records`:
`id`, `organization_id`, `kind` (`producer` | `leader` | `agency`), `period` (`day` | `week` | `month`), `holder_id` (null for agency), `premium numeric`, `period_start date`, `set_at timestamptz`, `previous_premium numeric`, `previous_holder_id`, `announced_at timestamptz`, `seen_at timestamptz`. Unique on `(organization_id, kind, period)` — one row per record, replaced when beaten. Grants for `authenticated` (select) and `service_role`; RLS with a select policy scoped to the caller's organization, writes only through server functions.

**`src/lib/records/records.ts`** (pure, with a `scripts/records-check.ts` alongside): bucket a production row into a day / Monday-week / month key; roll a downline subtree into leader totals (reusing `rollUpDownline` from `lib/team/production.ts`); pick the best bucket per key; and `diffRecords(existing, computed)` returning which records were beaten. No dates or database inside.

**`src/lib/records.functions.ts`**:
- `getTrophyCase({ scope })` — resolves agency or IMO agent ids through the existing scope resolver, reads policies via `selectProduction`, buckets and returns the nine records plus holder names and each record's stored `set_at`/`previous_premium`.
- `syncProductionRecords({ silent })` — recomputes, upserts beaten records, and unless `silent`, calls `notifyPeople` with category `team_activity` for every org member and stamps `announced_at`. Returns records the caller now holds and hasn't seen, so the client can celebrate; `markRecordSeen` stamps `seen_at`.

**Wiring** — `syncProductionRecords()` is called after a successful deal post in `post-deal.tsx` and after a policy edit that touches premium or production date; the import paths call it with `silent: true`. The trophy case query invalidates on both.

**UI** — `src/components/leaderboard/trophy-case.tsx`, rendered in a `Panel` below the existing ranked table on `leaderboard.tsx`: three columns (Day / Week / Month) by three rows, each cell a card with a gold trophy, the holder's avatar and name, the amount and the date. Solo agents keep their existing personal-production screen and see only their own personal-best day/week/month.

**Celebration** — `src/components/leaderboard/record-burst.tsx`: a fixed overlay using existing `scale-in` / `fade-in` utilities plus a CSS gold particle burst, honoring `prefers-reduced-motion` by showing a static gold banner instead. Auto-dismisses after a few seconds. All colors from existing gold tokens — no hardcoded values.
