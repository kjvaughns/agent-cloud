# Backdating policies

Give every policy an explicit **sale date** you can set in the past, so imported and hand-entered history lands in the right month on production, the dashboard and the leaderboard — and so commissions for those deals sit on their historical months.

## How it works today

- Production, the dashboard and the leaderboard all window on `policies.production_date`.
- That date is filled automatically when a policy is created: effective date if it is earlier than the post time, otherwise the post time.
- There is no field anywhere to choose it, and **changing a policy's effective date afterwards does not move it** — the trigger only fills the date when it is empty. So a policy posted today can never be moved into a past month from the app.

## What you get

1. **Sale date field on Post a Deal** (full form and the inline Post Deal in the pipeline drawer). Defaults to today, accepts any past date, rejects future dates. Helper text: "When the business was written — set this back for older policies."
2. **Editable sale date on existing policies** in the policy edit card of the client drawer, next to Effective date, showing which month it currently counts in.
3. **Backdating actually moves the numbers.** Setting the sale date rewrites `production_date`, so the policy immediately counts in that month on Reports, the dashboard tiles and charts, and the leaderboard.
4. **Commissions rebuilt on the historical dates.** When a sale date changes, the existing schedule rows for that policy are superseded and recalculated from the new date, so the advance and the trail months read correctly in Finances.
5. **Imports honour their dates.** The book import and admin import paths set the sale date from the effective/written date in the file instead of relying on the fallback, and the admin backfill can rebuild commissions for imported rows.

Anyone posting a deal can set a past date (per your choice). Every change is stamped with who made it and when, and the original post time is kept untouched for audit.

## Technical notes

Database migration:
- Extend `set_policy_production_date()` to a BEFORE INSERT **OR UPDATE** trigger: on update, when the caller supplies `production_date` explicitly, honour it; when the caller changes `effective_date` and did not touch `production_date`, recompute with the same rule. Insert behaviour is unchanged.
- Add a validation trigger rejecting a `production_date` more than a day in the future (trigger, not CHECK — the rule is time-dependent).
- Add `production_date_set_by uuid` + `production_date_set_at timestamptz` on `policies` for the audit stamp.

Server functions:
- `postDeal` (`src/lib/post-deal.functions.ts`) and the inline path in `src/lib/pipeline.functions.ts`: accept optional `sale_date` (date string), pass it as `production_date`, keep `posted_at = now()`.
- `updatePolicy` (`src/lib/pipeline.functions.ts`): accept `sale_date`; on change, write `production_date`, the audit columns, mark existing `commission_schedule` rows for the policy `superseded_at = now()`, and re-run `calculateAndInsertAllCommissions` anchored on the new date.
- `src/lib/commission-calculator.ts`: anchor the schedule on the policy's production/effective date rather than "now" when they differ, so backdated deals get historical payment dates.
- Import paths (`book-import.functions.ts`, `import-helpers.ts`, `admin-import.functions.ts`): set `production_date` explicitly from the parsed effective/written date.

UI:
- `src/routes/_authenticated/post-deal.tsx`: date input for sale date with a max of today.
- `src/components/pipeline/client-detail-drawer.tsx`: same field in the inline Post Deal form and in the policy edit card.
- No change to `src/lib/production/source.ts` — the definition of production stays as it is; only the date now becomes something you can set.
