# Contracting Ops and Requests redesign

Goal: make the Contracting Operations overview and Contract Requests pages match the simple card + summary sidebar style used in Agency Settings, Contracting and Team. No changes to what the data means or who can see it.

## 1. Contracting Operations overview (/contracting-ops)
- Title, one-line blurb and a gold "+ New request" button.
- Four metric tiles: Active agents, Ready to sell, In progress, Ready to submit.
- Main column:
  - "Needs you" card: overdue requests, missing PDB reports, expiring licenses. Each line is a pill link to the filtered request list. Uses neutral/gold styling, amber only for real warnings.
  - "Where requests stand" card: one gold bar per status with counts.
  - "Carrier turnaround" card: average days from submission to appointment.
- Right summary column: quick actions (New request, Add writing number, Upload PDB report, Manage carriers, Staff queue) and a small pipeline health readout.
- Less-used tools (import, templates, documents, licensing) move under an Advanced drawer.

## 2. Contract Requests (/contracting-ops/requests)
- Replace grey tabs with pill switcher: Agents, Writing numbers, Hierarchy, Change requests. Old URLs keep working.
- Agents section:
  - One filter row: search box + status pills with live counts (All, Needs attention, New, In progress, Waiting on carrier, Fully contracted). Replaces the 5 count boxes, dropdown and 11 pills.
  - Agent cards by default (initials, name, NPN, upline, "6 of 7 active" progress bar, status pill); click opens the agent's contracting workspace. Cards/Table toggle remembered per user.
  - Right summary column: "+ New request", items awaiting manager/owner sign-off, items waiting on carrier.
- Writing numbers, Hierarchy and Change requests sections use the same restyled tables, shared empty/loading states and gold primary buttons, each with a short summary card.

## 3. Check
- Test as kjvaughns13@gmail.com on desktop and phone: counts match the old page, filters work, an agent card opens the right workspace, old tab links land on the right section.

## Technical notes
- Files: src/routes/_authenticated/contracting-ops/index.tsx, contracting-ops.tsx layout, the requests route folder and its section components.
- Reuse ui-kit primitives (HubLayout, HubCard, SummaryCard, FilterChips, AdvancedDrawer, EmptyCard, CardSkeleton). Existing server functions and permission checks stay as they are; counts derive from data already loaded.
