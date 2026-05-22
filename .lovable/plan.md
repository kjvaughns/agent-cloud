# Build missing pages (mock UI)

Scope: add the pages from the original AgencyOS spec that don't yet exist, all with mock data and themed via existing tokens. No backend wiring, no schema changes.

## New routes

**Back Office** (rename/extend existing `back-office.tsx` sub-layout):
- `/back-office/case-design` — submit a case for advanced design help; list of in-flight cases with status badges (New, In Review, Quoted, Closed).
- `/back-office/advanced-desk` — concierge desk request form + threaded conversation mock.
- `/back-office/recruiting-funnels` — gallery of funnel templates, "Create funnel" CTA, list of agent's funnels (slug, published toggle, views).
- `/back-office/client-marketing` — landing-page templates gallery, agent's landing pages list (slug, published toggle, leads count).
- Keep existing `recruiting-tracker`. Remove/replace `compliance` and `support` (not in spec) — move their content into the items above where it fits, otherwise delete.

**Resources** (rename existing `resources.tsx` sub-layout to match spec):
- `/resources/new-agent-guide` — onboarding checklist + linked articles.
- `/resources/agent-handbook` — table of contents + long-form sections (mock markdown).
- `/resources/scripts` — keep existing.
- `/resources/state-licenses` — license table (state, number, issued, expires, status), "Upload license" button, expiration warnings, DOI quick links per state.
- `/resources/agent-academy` — course catalog grid (course title, duration, progress bar, "Start"/"Resume").
- Remove `forms`, `marketing`, `training` (not in spec) or repurpose under the above.

**Sophai (Workspace addition)**:
- `/sophai/settings` — toggles: Policy Recovery, SMS Follow-up, Birthday Messages, Beneficiary Engagement; per-toggle description + last-run timestamp.
- `/sophai/activity` — feed of Sophai actions (client, activity_type, outcome, timestamp) with type filters.
- (AI Assistant chat stays as-is on `/ai-assistant`.)

**Gamification**:
- `/challenges` — current daily/weekly/monthly/quarterly challenges as cards with progress bars + targets; trophy case strip at top showing earned trophies.

## Sidebar updates (`src/components/app-sidebar.tsx`)

Realign group items to spec exactly:
- Contracting group: Invite Agent, Contract Requests, Transfer Requests, Commission Grids, Annuity Training, Carriers.
- Resources group: New Agent Guide, Agent Handbook, Scripts, State Licenses, Agent Academy.
- Back Office group: Case Design, Advanced Desk, Recruiting Funnels, Recruiting Tracker, Client Marketing.
- Workspace group: add AI Assistant entries for Sophai Settings + Sophai Activity, and Challenges under My Business.

Each menu item gets an appropriate `lucide-react` icon and points to the new route.

## Mock data

Add `src/lib/mock/` modules per page (e.g. `landingPages.ts`, `funnels.ts`, `licenses.ts`, `academy.ts`, `sophaiActivity.ts`, `challenges.ts`) returning typed arrays consumed by the routes. Keep shapes aligned with the spec's table columns so a future swap to Supabase queries is mechanical.

## Components reused

- `KpiCard`, `StatusBadge`, `TemperatureBadge` already exist.
- Use shadcn `Card`, `Table`, `Tabs`, `Switch`, `Progress`, `Dialog`, `Badge`, `Button` consistently. No new primitives.

## Out of scope (defer)

- Sophai topbar shield dropdown, onboarding wizard, wallet/billing — covered by the other two options from the question; not built here.
- Real Supabase tables/RLS — deferred until you pick "Wire real backend".
- Auth-protected loaders — pages render under `_authenticated` shell only.

## Verification

- Every new route renders with no console errors in light + dark mode.
- Sidebar groups expand to show all spec sub-items; active highlight works.
- Each page has a unique `head()` with `title` + `description`.
- No broken `<Link to>` targets (tsc enforces).
