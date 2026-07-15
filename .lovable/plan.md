## Goal
Condense the sidebar by collapsing the Resources, Advanced Market, and Marketing groups into three single sidebar entries. Each entry opens a hub page with in-page tabs to reach the sub-pages (like a New Agent Guide page with tabs across the top for Handbook, Scripts, etc.).

## Sidebar changes (`src/components/app-sidebar.tsx`)
Replace the three multi-item groups with a single "Enablement" group containing 3 links:
- **Resources** → `/resources` (icon: BookOpen)
- **Advanced Market** → `/back-office/advanced-market` (icon: Briefcase)
- **Marketing** → `/back-office/marketing` (icon: Megaphone)

## New hub pages (with internal tab nav)

**1. `/resources` hub** — `src/routes/_authenticated/resources.tsx` as a layout with a top tab bar linking to:
- New Agent Guide, Agent Handbook, Scripts, State Licenses, Agent Academy

Existing child routes (`/resources/new-agent-guide`, etc.) stay where they are — the layout renders `<Outlet />` under the tabs. Add `/resources/index.tsx` that redirects to `/resources/new-agent-guide`.

**2. `/back-office/advanced-market` hub** — new layout route with tabs:
- Case Design, Advanced Desk

Repoints internally to existing `/back-office/case-design` and `/back-office/advanced-desk` pages (kept as-is; layout wraps them via `<Outlet />`). Index redirects to Case Design.

**3. `/back-office/marketing` hub** — new layout route with tabs:
- Recruiting Funnels, Client Marketing, Marketing Tracker

Wraps existing pages. Index redirects to Recruiting Funnels.

## Tab UI
Reuse the existing shadcn `Tabs`-style pill bar (same pattern as current back-office sub-nav in `src/routes/_authenticated/back-office.tsx`) so it visually matches the rest of the app. Active tab derived from `useRouterState` pathname.

## Non-goals
- No changes to the underlying page contents.
- No changes to Production/Agency/Tools/Updates groups.
- No route deletions — old URLs keep working.
