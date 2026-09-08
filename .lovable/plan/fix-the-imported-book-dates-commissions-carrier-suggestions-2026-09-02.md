# Fix the imported book: dates, commissions, carrier suggestions, ownership display

Four changes, all driven by the backdated import.

## 1. Posted date follows the effective date

Every imported policy currently shows a posted date from the day it was imported (Aug 15 – Sep 2), while its production month is already correct. Book of Business sorts and displays that posted date, so the history reads as if the whole book was written last week.

- One-time data fix: for the imported policies, set the posted date equal to the production/effective date. The two 1906-typo policies and the future-dated one keep today's stamp since they have no trustworthy date.
- Import code fix: when a policy is imported with backdating, stamp the posted date from the effective date instead of "now", so future imports land right the first time.

## 2. Commissions on all 166 policies, using the agent's level

166 of 368 policies have no commissions because their carrier (American Home Life 84, Royal Neighbors 63, Transamerica 13, Mutual of Omaha 3, Guarantee Trust Life, Baltimore Life, Aflac) has no agency setup yet. Today the calculator stops at "carrier not configured" and writes nothing.

- Add a provisional resolution path: when the carrier isn't set up, still resolve the percentage down the normal ladder — active contract override, then carrier-level mapping, then the agent's agency position base level — and treat the advance as "as earned" so trails and renewals build on real months.
- Mark those schedules as provisional and keep the carrier setup issue open, so nothing silently looks final.
- Backfill: rebuild commissions for the 166 policies anchored on their effective dates. Once a carrier is properly set up, the existing recalculation replaces provisional rows with the real grid rates.
- Agents with no agency level still can't resolve; those stay listed as setup issues (fix is to place the agent, not the carrier).

## 3. Suggested carriers in Settings

New panel in Settings → Carriers: "Suggested from your book". Lists each carrier that appears on policies but has no agency setup, with the policy count, total premium, and which agents wrote it, plus a "Set up" action that opens the normal carrier setup. Nothing is created automatically.

## 4. Book of Business shows the real producer

Policies written by roster agents without accounts are held under your profile with their email attached, so the book shows your name on all of them. It will instead show the roster name — e.g. "Jorge Oyervidez" with a "no account yet" badge — for the 63 held policies, and they keep moving to the real agent automatically at signup. Agent filtering and totals include them either way.

## Technical notes

- Data fix through the data-change tool: `UPDATE policies SET posted_at = production_date` for rows where the two differ and the production date came from the effective date; import path fix in `src/lib/import-helpers.ts` (`posted_at: now` → backdated value).
- `src/lib/compensation/resolve.ts`: add an `allowUnconfiguredCarrier` input flag returning `provisional: true` plus `advanceSource: "carrier_default"` with `as_earned`; `carrier_not_configured` remains recorded in `commission_setup_issues`. `src/lib/commission-calculator.ts` passes the flag for imported/backfill runs only, so live Post Deal behaviour is unchanged.
- Backfill run through a one-off script calling `calculateAndInsertAllCommissions` per policy, ordered by production date.
- Suggested carriers: server fn aggregating `policies` joined to `carriers` with no matching `org_carriers` row for the org, rendered in a new `src/components/settings/suggested-carriers-panel.tsx` on `settings.carriers.tsx`.
- Producer display: `src/lib/book-of-business.functions.ts` keeps using `get_book_of_business`, then joins `policies.assigned_to_email` against `pending_agents` to override the displayed agent name — no change to the RPC signature.
