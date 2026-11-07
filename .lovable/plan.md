# Contracting redesign: 3 clear sections

## The fix first
The Team matrix currently pulls active carriers from every agency on the platform, which is why it shows carriers you don't use and two or three copies of each. It will only show your agency's switched-on carriers, one column each.

## New layout
Replace the 5 tabs (Contracts, Team matrix, Comp Grids, Transfer Requests, Work Inbox) with 3 sections, using the same cards, pill filters and side summary as Agency settings and Team.

```text
[ Contracting · one-line blurb ]                 [ Request a carrier ]
[ My appointments ] [ Team coverage ] [ Requests ]

+------------------------------------+  +----------------------+
| Main cards for the chosen section  |  | Summary (sticky)     |
|                                    |  |  Active / Pending    |
|                                    |  |  Waiting on you      |
+------------------------------------+  +----------------------+
[ Advanced: comp grids, logs, bulk tools ]
```

1. **My appointments** (everyone)
   - One card per carrier: name, writing number, comp level, status badge, "Open portal" link.
   - "Request a carrier" and "Add an existing writing number" buttons.
   - Pills: All, Active, Pending, Not contracted.

2. **Team coverage** (owners and uplines; only their downline)
   - Agent cards with the carriers they're appointed with as tags, and missing carriers called out ("Missing 2 of 7").
   - A Cards/Grid switch. The grid has one column per active agency carrier, with plain status badges (Active, Pending, Missing) instead of dots.
   - Pills: All, Fully contracted, Missing carriers, Pending.

3. **Requests** (owners, managers, staff)
   - Work Inbox, contract requests and transfer requests in one list.
   - Pills: Needs you, Waiting on carrier, Done.
   - Each row shows who, which carrier, how long it's been waiting, and one main action.

**Comp grids** move under Advanced on this page (and stay reachable from Agency settings → Carriers & Comp).

**Sidebar links:** "Contracting Ops" and "Contract Requests" open the Requests section instead of separate pages; the old addresses keep working.

## Not changing
Who can see what, request/approval logic, comp numbers, carrier data.

## Technical details
- Add the agency filter to the active-carriers query in `listDownlineMatrix` (`src/lib/contracting.functions.ts`) and remove duplicate carriers by id.
- Rebuild `/contracting` using `?section=appointments|coverage|requests` and map old tab values to the new sections; old ops/requests routes redirect.
- New components in `src/components/contracting/`: AppointmentCard, CoverageCards, CoverageGrid, RequestsQueue, ContractingSummary, all built from the ui-kit pieces.
- Reuse the existing server functions for appointments, matrix, inbox and transfers. No database changes.
- Check as your account at 1280px and 390px: 7 carrier columns, no duplicates, each section loads real data.
