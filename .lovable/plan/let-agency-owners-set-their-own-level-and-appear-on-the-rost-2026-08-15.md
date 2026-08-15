# Let agency owners set their own level and appear on the roster

Today the roster only shows people **below** you (it walks your downline), and position assignment is a roster-only action. So as the owner of a top-level agency there is no screen where you can see or set your own position — which means your own commission math has nothing to resolve against.

## What changes

1. **"Your position" card** in Settings ▸ Agency ▸ Levels & Positions
   - Shows your name, current position and its percentage (or "Not set").
   - A picker to assign yourself any position from the agency catalog, plus a Clear option.
   - Shows the carrier-level mapping that position resolves to, so you can confirm your comp is configured before posting a deal.
   - Visible to agency owners/admins whose organization has no parent agency (a top-level agency owns its own ladder); for a sub-agency under a parent, the card is read-only with a short note that the parent sets positions.

2. **You appear on the roster**
   - The team roster gains your own row at the top, badged "You", with your own production and the same position column everyone else has, so your placement is visible and editable in the place you'd expect it.
   - It is your row only — it does not change how downline totals roll up.

3. **Self-assignment is permitted server-side**
   - The position action accepts your own id when you are an owner/admin of a top-level agency, with a clearer error when a sub-agency member tries it.

## Technical notes

- `getTeamRoster` (`src/lib/team.functions.ts`) builds from `get_team_downline`, which starts at `upline_id = auth.uid()` and therefore excludes the caller. Fetch the caller's own `profiles` row and its policies alongside, and prepend it as a roster row (`is_self: true`) using the existing `tallyByAgent` / risk-flag pipeline so the numbers match the rest of the page.
- `setAgentPosition` already passes RLS for self (`profiles_self_update`); add an explicit self branch that checks org admin/owner role and `organizations.parent_org_id IS NULL`, and keep the existing downline path unchanged.
- New read `getMyPlacement` in `src/lib/team.functions.ts`: caller's `agency_level_id`, the level's name/`base_pct`, org `parent_org_id`, and the level's `agency_level_carrier_mappings` rows for the mapping summary.
- UI card lives in `src/components/contracting/levels-panel.tsx` above the ladder list, reusing `listAgencyLevels` for the picker and invalidating `["agency-levels"]` plus roster queries on save.
- No schema changes and no commission-calculation changes; this only makes the existing position assignment reachable for yourself.
