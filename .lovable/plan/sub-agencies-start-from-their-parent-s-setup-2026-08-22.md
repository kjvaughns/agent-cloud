# Sub agencies start from their parent's setup

When an agency is created underneath a parent, it should open with the parent's configuration already in place — the levels ladder, the carriers, the comp grids, the carrier level mappings and the contracting policy — and every bit of it editable. Once copied, the two agencies are independent: the sub agency editing a grid or renaming a level never touches the parent's, and the parent changing theirs afterwards does not reach down.

## What gets copied

At the moment the sub agency is created (or linked to a parent), the parent's effective setup is duplicated into the child's own rows:

- Levels ladder (`agency_levels`) — names, base percentages, order, invite rights
- Carriers the agency works with (`org_carriers`) — status, portals, agent visibility, advance defaults
- Comp grids (`commission_grids`) — every rate row the parent authored for those carriers
- Carrier level mappings (`agency_level_carrier_mappings`) and per-carrier comp levels (`carrier_comp_levels`)
- Carrier submission methods and requirements (`org_carrier_methods`, `carrier_requirements`)
- Contracting policy (`org_contracting_settings`) — copied as the child's own values, so later parent changes don't move them

Not copied: people, production, requests, writing numbers, staff assignments, anything naming a specific person in the parent org.

Copying is one-time and idempotent — a category that already has rows in the child is left alone, so re-running never duplicates or overwrites work the sub agency has already done.

## Where it fires

1. Accepting an agency-owner invite, which is what creates a sub agency today.
2. Linking an existing agency to a parent from the sub-agencies screen.
3. A one-off backfill for the two agencies already linked under APEX Financial.

## About the backfill

Worth knowing before it runs: APEX Financial (the parent) currently holds 13 carriers but no levels ladder, no comp grids and no level mappings — the full setup lives in Vantage Financial. So backfilling from APEX gives Symmetry Financial APEX's 13 carriers and nothing else, and Vantage (which already has its own 10 levels and 186 grid rows) is left untouched.

If the intent is for Symmetry to start from the real Vantage setup instead, say so and the backfill will seed it from Vantage. Going forward, once APEX's own ladder and grids are filled in, new sub agencies inherit them automatically.

## Copy report

After seeding, the sub agency owner sees a one-line note on Agency settings: what was carried over from the parent and that it is theirs to change. No blocking dialog.

## Technical notes

- New `src/lib/agency-seed/seed-from-parent.server.ts`, exporting `seedOrgFromParent(childOrgId, parentOrgId)`. Runs on the admin client (a child cannot read its parent's rows under RLS) and returns a per-table count.
- Ordering matters because of foreign keys: `agency_levels` and `org_carriers` first, capturing old-id → new-id maps; then `carrier_comp_levels`, `agency_level_carrier_mappings`, `org_carrier_methods`, `carrier_requirements`, `commission_grids`, remapping `agency_level_id` / `org_carrier_id` / `comp_level_id` through those maps. `max_downline_level_id` on `carrier_comp_levels` is remapped too.
- `commission_grids` rows keyed on `carriers.id` copy straight across with the child's `organization_id`, `source` set to `inherited`, following the existing `preferOwnGridRows` shadowing rule so the child's copy wins over shared library defaults.
- Guard per category: skip a table when the child already has rows for it, so the seed is safe to re-run.
- Call sites: the `agency_owner` branch of `acceptInvite` in `src/lib/onboarding.functions.ts`, and the link path in `src/lib/agency-relationships.functions.ts`.
- `org_contracting_settings` is copied as concrete child values with `overridden_fields` set to the copied field names, which turns off the live parent inheritance in `effective-settings.ts` for that org — matching the copy-once rule rather than fighting it.
- Backfill runs as a data operation against the two existing children, not a schema migration.
- A check script (`scripts/agency-seed-check.ts`) asserts row counts match, ids are remapped, editing the child leaves the parent untouched, and a second run changes nothing.
