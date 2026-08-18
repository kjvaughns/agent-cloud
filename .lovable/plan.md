# Samuel's parent agency, and IMO numbers on the dashboard

Two pieces of work: set up Samuel James as the owner of APEX Financial with Vantage Financial sitting under it, and put the IMO view on the dashboard leaderboard.

## 1. Samuel James — agency owner of APEX Financial

What exists today (checked against the live database):

- `info@kingofsales.net` has no account yet.
- Three organizations exist: **Vantage Financial** (owned by kjvaughns13@gmail.com), **APEX Financial Empire** (also owned by that account), and **APEX Financial** — which has no owner at all.
- The sub-agency table exists and is completely empty, so no parent/child relationship is set up anywhere.

Steps:

1. Create the auth account for `info@kingofsales.net` (Samuel James) and send an email invite link so he sets his own password on first sign-in. No password is created or shared.
2. Give him the `agency_owner` role and a profile with his name.
3. Make him the owner of the existing ownerless **APEX Financial** org (rather than adding a fourth org with the same name), and add his primary membership there so his agency resolves correctly.
4. Add the sub-agency relationship: parent = APEX Financial, child = Vantage Financial, status active, with both toggles on — their production counts in his totals and their sales flow into his feed. He can change either from Settings > Sub-Agencies.

Note: **APEX Financial Empire** is a separate org, also on your account. This plan leaves it alone. If that one was meant to be Samuel's agency instead, say so and I'll point the setup at it.

Direction of visibility stays as designed: the rollup only flows up. Samuel sees Vantage's production in his IMO totals; Vantage cannot see his.

## 2. IMO view and sub-agency numbers on the dashboard leaderboard

The full Leaderboard page already has a Total IMO scope. The dashboard's leaderboard panel has none — it always shows self-plus-downline.

Changes to the dashboard leaderboard panel:

- **Scope toggle** in the panel header: My Team / Agency / Total IMO. Total IMO only appears for an org that actually has opted-in sub-agencies, matching the rules the Leaderboard page already uses. Selecting Total IMO ranks agents across your agency and every opted-in child agency together.
- **Sub-agency totals panel** beneath it, visible only to an owner with sub-agencies: one row per agency (yours first, then each child) showing ALP, policy count and placed premium for the selected date range, ranked by ALP. Children that are paused or excluded from the rollup are not counted, consistent with their toggles.

Both read the same date range the rest of the dashboard uses, so the figures can't disagree with the tiles above them.

## Technical notes

- Account and org setup is data work through the backend tools (auth admin invite, role row, profile, membership, `agency_relationships` row) — no schema migration needed; the tables and policies already exist.
- Dashboard panel changes are in `src/routes/_authenticated/dashboard.tsx`, passing `scope` through the existing `getLeaderboardData` server function (it already accepts `mine | team | agency | imo`) and gating the toggle on the existing `canImo` capability from `useMyAccess`/scope caps.
- The per-agency rollup adds one server function alongside the existing scope resolvers, grouping production by the child organization rather than by agent, reusing the same production-date source every other board uses.
