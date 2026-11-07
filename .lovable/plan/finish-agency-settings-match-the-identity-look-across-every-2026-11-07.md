# Finish Agency settings: match the Identity look across every hub

Identity sets the pattern: one card with a "Saving / Saved" indicator in the corner, big friendly controls (swatches, drag-drop, toggle cards), short labels, and a live preview on the right on wide screens. The other four hubs get the same treatment.

## Shared building blocks
- **Hub card**: rounded card, title + "Saved" indicator, used by every hub.
- **Choice cards**: big tap-friendly options (like the brand swatches) instead of dropdowns and number fields where possible.
- **Advanced drawer**: one consistent "Advanced" link at the bottom of each hub that opens the detailed controls. Nothing gets deleted, it just moves there.
- **Preview column**: a sticky right column on desktop showing what agents will see. It stacks under the form on phones.
- **Autosave** wherever a setting is one click, so no Save buttons.

## Carriers & Comp
- Main card: the carrier on/off cards plus "Use standard levels", restyled into the hub card.
- Levels shown as a visual ladder (MGA 80% at the top down to Trainee 50%). Tap a rung to rename it or change its %, with autosave.
- Preview: "What an agent at each level earns on a $1,000 deal", for the carriers that are switched on.
- Advanced: full carrier directory, comp grid upload, renewals.

## Contracting
- Main card with three simple questions as choice cards:
  - Who can request carriers? (Anyone / Needs my approval)
  - How fast should requests be handled? (1, 3, 5, 7 days)
  - Who gets new requests? (Me / a staff member)
- License checks become two toggles with short wording.
- The setup checklist becomes a slim progress row at the top.
- Preview: what an agent sees when they ask for a carrier.
- Advanced: submission templates, the full licensing policy, audit log.

## Connections
- Sales feed: the 3-step card (paste link, Send test, pick style). The preview shows the chosen style as a Discord message.
- Integrations as a grid of tiles with logos and Connected/Not connected badges. Tap a tile to open a small side drawer.
- Advanced: Discord bots, events and thresholds, plus API keys.

## Team & roles (moves into settings)
- New hub in the left menu instead of a link out to the Team page.
- Members list: avatar, name, role badge, level. Tap a person to change role or level in a drawer.
- Roles as preset cards (Owner, Admin staff, Manager, Agent) showing what each can do in plain words. Pick a preset per person, with autosave.
- An "Invite agents" box that works like onboarding: email rows and an Add button.
- Solo plan: the upgrade-to-Agency card shows instead.
- Advanced: the per-permission switches (the current permissions screen).

## Order
1. Shared hub card, Advanced drawer and preview column
2. Carriers & Comp
3. Contracting
4. Connections
5. Team & roles hub (the old team-and-roles links open this hub)
6. Check desktop and phone in the browser as an agency owner

## Technical details
- New components under `src/components/settings/`: `hub-card.tsx`, `carriers-hub.tsx`, `contracting-hub.tsx`, `connections-hub.tsx`, `team-hub.tsx`. Each one wraps the existing panels/server functions, so the saving logic stays the same.
- Add a `team` hub to `HUBS` in `settings.agency.tsx`, gated by the existing team permission in `tab-access.ts`. `/settings/roles` and the launchpad team step will point there.
- Contracting choice cards write the same fields `ContractingSettingsPanel` already saves, through the existing settings server function with debounced autosave. Locked (inherited) fields stay read-only.
- Earnings preview is computed in the browser from levels and carrier mappings. Nothing new is stored.
- No database changes.
