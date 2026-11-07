# Team page redesign: agent cards + Team Pulse

Goal: `/team` opens on your people, not a spreadsheet or a pile of alerts. Keep the org chart at the bottom.

## New layout

```text
[ Title: Your team · blurb ]                [ Invite agent ]
[ Search ............ ] [All] [Producing] [Onboarding] [Needs attention]  [Filters v] [Cards|Table]

+------------------------------------+  +----------------------+
| Agent cards grid (2-3 per row)     |  | Team Pulse (sticky)  |
|  avatar · name · position badge    |  |  Top producers (3)   |
|  Own $ · Team $ · carriers · dot   |  |  Needs attention chip|
|  tap card -> existing drawer       |  |  Invite + copy link  |
+------------------------------------+  +----------------------+

[ Org chart (existing tree, restyled as cards) ]
[ Advanced: date ranges, depth, positions/status, pending positions ]
```

## What changes
1. **Agent cards by default** — one rounded card per agent with avatar, name, position (e.g. "Senior Agent · 70%"), own and team production, active carriers, status dot. Tapping opens the existing agent drawer. A small Cards/Table toggle switches to a trimmed 5-column table (Agent, Position, Stage, Production, Actions); choice remembered.
2. **One filter row** — search + four chips (All, Producing, Onboarding, Needs attention). Date range, custom dates, stage list, depth, positions, statuses and pending-positions move into a "Filters" popover / Advanced section. Defaults stay the same.
3. **Team Pulse sidebar** — top 3 producers this period, one "Needs attention" chip summarising the current Getting ready / Going quiet / Alerts items (expands to the list), and an Invite button with copy-link. Replaces the big triage panels at the top. Stacks below the cards on phones.
4. **Org chart kept at the bottom** — same tree and reporting lines, each person shown with the same mini card style.
5. Mobile: single-column cards, chips scroll horizontally, Pulse moves under the roster.

## Not changing
Who can see whom (downline scoping), the agent drawer contents, roles/permissions, invites logic, any data or numbers.

## Technical details
- Rework the `/team` route component and its roster pieces only; reuse existing team queries, filters state and drawer.
- Build with ui-kit primitives (HubLayout/PreviewCard, FilterChips, EmptyCard, CardSkeleton, AdvancedDrawer).
- New small components: `AgentCard`, `TeamPulse`, `TeamFilterBar`; table mode reuses existing table with reduced columns.
- "Needs attention" chip derives from the same data the current triage panels use.
- No database changes. Verify in browser as your account at 1280px and 390px.
