# Import the full book, backdated

I read your workbook. Four sheets, and every row is accounted for:

| Sheet | Rows | Lands as |
| --- | --- | --- |
| Team Roster | 41 | Agents — matched to existing accounts, the rest as pending agents |
| All Clients | 532 | Clients with stage, DOB, address, tobacco, notes fields, callback |
| Book of Business | 352 | Policies, dated on their effective date |
| Client Notes | 182 | Timeline notes joined to the client by name, keeping the original author and date |

## How it will land

- **Backdated for real.** Each policy's production month becomes its Effective Date, not today, so this year's production, the dashboard tiles and the leaderboard read as the business was actually written — and its commission schedule is rebuilt anchored on that historical date, so advances and trails sit on their real months in Finances.
- **Blank statuses become Active** (261 of the 352). The 91 rows that carry a status — Active, Lapsed, Not Taken, In Review, Withdrawn, Declined, Lapse Pending, Cancelled — keep theirs.
- **Owned by the right producer.** The Agent column decides the owner. Kaeden, Xaviar, Marquay, Pranav and Daniel already have accounts, so their rows go straight onto their pipeline and book. Jorge Oyervidez, Charles Reese, Landon Boyd, Loren Lail and Logan Spatola have no account yet — their 69 policies and 66 clients are held assigned to them by email, and the moment they sign up the records move onto their dashboard automatically. Nothing is lost and nothing is double-counted, because the same records are never re-created when they later upload their own copy.
- **No duplicates.** Clients are matched agency-wide on phone, email and name + date of birth; policies on policy number and on carrier + client + premium. You have 247 clients and 66 policies today, so the overlap is checked against those before anything is written.
- **Notes attach to their client**, not to blank records. A note whose client isn't in the workbook or your book is reported by name rather than inventing a client.

## Data I'll fix on the way in

Three rows in the file are wrong and would poison the numbers if imported as-is:

- Two policies dated **1906-02-01** and **1906-02-18** — an obvious date-entry slip. I'll import them without a production date so they show in the book but don't land in a nonsense month, and list them for you to correct.
- One policy dated **2026-09-03**, tomorrow. Production can't be in the future, so it'll be dated today and flagged.

## What you'll see before it saves

The import runs through the review step: a per-sheet count, the owner resolution list, any orphan notes or policies, the columns nothing claimed, and duplicate handling. I'll report all of it back to you with the actual numbers, and the whole batch stays undoable as one unit if anything reads wrong.

## Technical notes

- Runs the workbook through the existing pipeline: `readDocument` → per-sheet `resolveKind` → `import-workbook.ts` cross-sheet assembly → `applyProposals` → `saveClientFullRecord`, with `production_date` set from effective date via `saleDateToTimestamp` and `calculateAndInsertAllCommissions` per inserted policy.
- Unresolved producers become `pending_agents` rows keyed on the roster email; `claim_my_assigned_records` already moves their records on first sign-in.
- Sanity pass before apply: clamp future production dates to today, null out pre-2000 dates, default blank status to `active`.
- Post-import verification I'll run and report: policy and client counts by agent, production totals by month for 2026, commission_schedule row counts, and orphan/duplicate lists.
